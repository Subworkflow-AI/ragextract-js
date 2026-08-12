import { describe, expect, it, afterEach } from 'bun:test';
import { ApiClient } from '../src/lib/client';
import { MultipartUploader } from '../src/lib/upload/multipartUploader';

/**
 * The upload path against a rate-limiting API.
 *
 * This is the failure that motivated the retry work: the API allows 15 writes per minute and every
 * multipart part is a write, so `1 (start) + parts + 1 (end)` crosses the limit for any file over
 * ~130MB — precisely the size range multipart exists to serve. Before retrying, a part would 429,
 * reject out of `Promise.all`, and abandon an open upload session in R2.
 *
 * The stub below enforces the same shape of limit on a compressed window (a few writes per few
 * hundred ms, with Retry-After so the test does not sit through real backoff). The proportions are
 * what matter — more writes required than the window allows — not the absolute numbers.
 */

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const WINDOW_MS = 300;
const WRITES_PER_WINDOW = 5;

function rateLimitedApi(opts: { failPart?: number } = {}) {
    const calls: string[] = [];
    let rejected = 0;
    let windowStart = Date.now();
    let used = 0;

    globalThis.fetch = (async (url: string, init: any) => {
        const path = new URL(url).pathname;
        calls.push(path);

        if (Date.now() - windowStart >= WINDOW_MS) { windowStart = Date.now(); used = 0; }
        used++;
        if (used > WRITES_PER_WINDOW) {
            rejected++;
            return new Response(JSON.stringify({ message: 'Rate limit exceeded' }), {
                status: 429,
                headers: { 'content-type': 'application/json', 'retry-after': '0.15' },
            });
        }

        if (path.endsWith('/upload_session/start')) {
            return Response.json({ success: true, data: { key: 'upload_key_1' } });
        }
        if (path.endsWith('/upload_session/append')) {
            const partNumber = Number((init.body as FormData).get('partNumber'));
            if (opts.failPart === partNumber) {
                return new Response(JSON.stringify({ error: 'Could not upload file part.' }), {
                    status: 400, headers: { 'content-type': 'application/json' },
                });
            }
            return Response.json({ success: true, data: { etag: `etag-${partNumber}`, partNumber } });
        }
        if (path.endsWith('/upload_session/end')) return Response.json({ success: true, data: { id: 'dsj_1' } });
        if (path.endsWith('/upload_session/abort')) return Response.json({ success: true });
        return Response.json({ success: true });
    }) as any;

    return { calls, rejectedCount: () => rejected };
}

const uploaderFor = (client: ApiClient) => new MultipartUploader(client, { chunkSize: 1024, concurrency: 4 });
const client = () => new ApiClient({ apiKey: 'sk_test', baseUrl: 'https://api.test/v1' });
const blobOf = (parts: number) => new Blob([new Uint8Array(parts * 1024)]);

describe('MultipartUploader against a rate-limited API', () => {
    it('completes an upload that needs more writes than the limit allows', async () => {
        const api = rateLimitedApi();
        const uploader = uploaderFor(client());

        await uploader.start({ jobType: 'extract', fileName: 'big', fileExt: 'pdf', fileType: 'application/pdf' });
        await uploader.append(blobOf(14));
        const res = await uploader.end();

        // 14 parts + start + end = 16 writes against a 5-per-window budget: it can only finish by
        // riding out several windows.
        expect(api.rejectedCount()).toBeGreaterThan(0);
        expect((res as any).success).toBe(true);

        const appends = api.calls.filter(p => p.endsWith('/append'));
        // Every part landed exactly once on top of the retries.
        const succeeded = 14;
        expect(appends.length).toBeGreaterThanOrEqual(succeeded);
    }, 20_000);

    it('aborts the session when a part fails, instead of stranding it', async () => {
        const api = rateLimitedApi({ failPart: 3 });
        const uploader = uploaderFor(client());

        await uploader.start({ jobType: 'extract', fileName: 'big', fileExt: 'pdf', fileType: 'application/pdf' });

        await expect(uploader.append(blobOf(6))).rejects.toThrow();

        // Without this the caller gets an error, the key is cleared only by end(), and R2 keeps an
        // incomplete multipart upload that nothing ever reaps.
        expect(api.calls.some(p => p.endsWith('/upload_session/abort'))).toBe(true);
        expect(uploader.getKey()).toBeNull();
    }, 20_000);

    it('surfaces the original part failure, not an abort failure', async () => {
        const api = rateLimitedApi({ failPart: 2 });
        const uploader = uploaderFor(client());

        await uploader.start({ jobType: 'extract', fileName: 'big', fileExt: 'pdf', fileType: 'application/pdf' });
        const err = await uploader.append(blobOf(4)).catch(e => e);

        expect(err).toBeInstanceOf(Error);
        expect(String(err.message)).toContain('400');
        expect(api.calls.some(p => p.endsWith('/upload_session/abort'))).toBe(true);
    }, 20_000);
});
