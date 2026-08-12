import { describe, expect, it, mock, afterEach } from 'bun:test';
import { ApiClient, buildQuery, RagextractApiError } from '../src/lib/client';

/**
 * These cover the two things that were silently wrong against the API, plus the retry that makes
 * large multipart uploads possible. All three fail invisibly if they regress: a renamed query param
 * is stripped server-side rather than rejected, and a missing retry only shows up on files big
 * enough to cross the write limit.
 */

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const jsonResponse = (body: unknown, status = 200, headers: Record<string,string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

describe('buildQuery', () => {
    it('maps the SDK share-TTL name onto the one the API reads', () => {
        // The whole point: `expiryInSeconds` never reached the API, which reads `expiresInSeconds`.
        expect(buildQuery({ expiryInSeconds: 60 })).toEqual({ expiresInSeconds: 60 });
        expect(buildQuery({ expiresInSeconds: 60 })).toEqual({ expiresInSeconds: 60 });
    });

    it('prefers the correct spelling when both are given', () => {
        // Must not depend on key iteration order.
        expect(buildQuery({ expiryInSeconds: 1, expiresInSeconds: 2 })).toEqual({ expiresInSeconds: 2 });
        expect(buildQuery({ expiresInSeconds: 2, expiryInSeconds: 1 })).toEqual({ expiresInSeconds: 2 });
    });

    it('keeps offset=0 instead of dropping it', () => {
        // The old per-call reduce used `if (!value) return acc`, so page 0 was silently omitted.
        expect(buildQuery({ offset: 0, limit: 10 })).toEqual({ offset: 0, limit: 10 });
    });

    it('joins arrays and omits absent values', () => {
        expect(buildQuery({ cols: [1, 2, 3] })).toEqual({ cols: '1,2,3' });
        expect(buildQuery({ sort: ['-createdAt', 'id'] })).toEqual({ sort: '-createdAt,id' });
        expect(buildQuery({ a: undefined, b: null, c: '', d: [] })).toBeUndefined();
        expect(buildQuery(undefined)).toBeUndefined();
    });
});

describe('ApiClient errors', () => {
    it('throws a typed error carrying the status and parsed body', async () => {
        globalThis.fetch = mock(async () => jsonResponse({ success: false, error: 'Insufficient credits' }, 402)) as any;
        const client = new ApiClient({ apiKey: 'k', baseUrl: 'https://example.test/v1' });

        const err = await client.$post('/search').catch(e => e);

        expect(err).toBeInstanceOf(RagextractApiError);
        // Under credit billing 402 is an ordinary state a caller must branch on — not something
        // they should have to find by substring-matching an error message.
        expect(err.status).toBe(402);
        expect(err.isInsufficientCredits).toBe(true);
        expect(err.isRateLimited).toBe(false);
        expect(err.body.error).toBe('Insufficient credits');
    });

    it('reads the reason from `message` as well as `error`', async () => {
        // HTTPException responses use `message`; handler-returned JSON uses `error`.
        globalThis.fetch = mock(async () => jsonResponse({ message: 'Unauthorized' }, 401)) as any;
        const client = new ApiClient({ apiKey: 'k', baseUrl: 'https://example.test/v1' });

        const err = await client.$get('/datasets').catch(e => e);

        expect(err.isUnauthorized).toBe(true);
        expect(err.message).toContain('Unauthorized');
    });

    it('does not choke on a non-JSON error body', async () => {
        globalThis.fetch = mock(async () => new Response('gateway exploded', { status: 502 })) as any;
        const client = new ApiClient({ apiKey: 'k', baseUrl: 'https://example.test/v1' });

        const err = await client.$get('/datasets').catch(e => e);

        expect(err.status).toBe(502);
        expect(err.body).toBeNull();
        expect(err.rawBody).toBe('gateway exploded');
    });
});

describe('ApiClient retry', () => {
    it('retries a 429 and succeeds', async () => {
        let calls = 0;
        globalThis.fetch = mock(async () => {
            calls++;
            // Retry-After: 0 keeps the test instant while still exercising the header path.
            return calls < 3 ? jsonResponse({ error: 'Rate limit exceeded' }, 429, { 'retry-after': '0' })
                             : jsonResponse({ success: true });
        }) as any;
        const client = new ApiClient({ apiKey: 'k', baseUrl: 'https://example.test/v1' });

        const res = await client.$post('/upload_session/append');

        expect(res.status).toBe(200);
        expect(calls).toBe(3);
    });

    it('gives up after maxRetries and reports the 429', async () => {
        let calls = 0;
        globalThis.fetch = mock(async () => {
            calls++;
            return jsonResponse({ error: 'Rate limit exceeded' }, 429, { 'retry-after': '0' });
        }) as any;
        const client = new ApiClient({ apiKey: 'k', baseUrl: 'https://example.test/v1', maxRetries: 3 });

        const err = await client.$post('/upload_session/append').catch(e => e);

        expect(calls).toBe(3);
        expect(err.isRateLimited).toBe(true);
    });

    it('never retries a non-429, even a 5xx', async () => {
        // A 5xx may have partially executed; replaying a session start would strand an upload.
        let calls = 0;
        globalThis.fetch = mock(async () => { calls++; return jsonResponse({ error: 'boom' }, 500); }) as any;
        const client = new ApiClient({ apiKey: 'k', baseUrl: 'https://example.test/v1' });

        await client.$post('/upload_session/start').catch(() => {});

        expect(calls).toBe(1);
    });

    it('maxRetries: 1 disables retrying', async () => {
        let calls = 0;
        globalThis.fetch = mock(async () => { calls++; return jsonResponse({}, 429, { 'retry-after': '0' }); }) as any;
        const client = new ApiClient({ apiKey: 'k', baseUrl: 'https://example.test/v1', maxRetries: 1 });

        await client.$get('/datasets').catch(() => {});

        expect(calls).toBe(1);
    });
});
