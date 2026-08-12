import { RagextractApiError, type ApiErrorBody } from "./errors";

type ApiClientOpts = {
    apiKey?: string;
    baseUrl?: string;
    /** Attempts per request when rate limited. 1 disables retrying. Default 10. */
    maxRetries?: number;
}

/**
 * Ten attempts with the backoff below spans roughly four minutes of waiting.
 *
 * That is sized against the constraint, not picked for feel: the API's write limit is 15/min and
 * every multipart part is a write, so a 500MB upload needs ~54 writes and therefore has to survive
 * about four rate-limit windows. Fewer attempts and large uploads fail part-way; this is the number
 * that makes them merely slow.
 *
 * It only costs time when actually throttled, which is why this replaced the uploader's old fixed
 * 100ms-per-part stagger — that delayed every upload, including the small ones that were never
 * near the limit, and still did not pace anything close to 15/min.
 */
const DEFAULT_MAX_RETRIES = 10;
const MAX_BACKOFF_MS = 60_000;

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

/**
 * How long to wait before retrying a 429.
 *
 * Honours `Retry-After` when one is sent; otherwise backs off exponentially from ~1s, capped at one
 * full rate-limit window. The jitter matters more than it looks: the uploader has several parts in
 * flight, so without it every rejected part wakes at the same instant and collides again.
 */
const retryDelayMs = (res: Response, attempt: number): number => {
    const header = res.headers.get('retry-after');
    if (header) {
        const seconds = Number(header);
        if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    }
    return Math.min(1000 * 2 ** (attempt - 1), MAX_BACKOFF_MS) + Math.random() * 500;
};

export class ApiClient {
    private opts: ApiClientOpts = {}
    constructor(
        opts?: Partial<ApiClientOpts>
    ){
        if (opts) this.opts = { ...opts };
        if (!this.opts.baseUrl) throw new Error('baseUrl must be set.');
        if (!this.opts.apiKey) throw new Error('apiKey must be set.');
    }

    private _fetch = async <T extends Record<string, any>>(
        method: 'get' | 'post' | 'patch' | 'put' | 'delete',
        route: string,
        input?: {
            query?: T,
            json?: T,
            form?: T
        },
        headers?: {
            'x-api-key'?: string;
            'Content-Type'?: string;
        }
     ) => {
        const _route = route.startsWith('/') ? route : `/${route}`;
        const url = new URL(this.opts?.baseUrl + _route);
        const _headers = {
            'x-api-key': this.opts.apiKey,
            ...headers
        };
        let qs,body:string|object|FormData|undefined;
        if (input) {
            if (input.query) qs = new URLSearchParams(input.query);
            if (input.json) {
                body = JSON.stringify(input.json);
                _headers['Content-Type'] = 'application/json';
            }
            if (input.form) {
                if (input.form instanceof FormData) {
                    body = input.form;
                } else {
                    body = new FormData();
                    Object.keys(input.form).forEach(key => {
                        input.form
                        && (body instanceof FormData)
                        && input.form[key] !== undefined
                        && body.append(key, typeof input.form[key] !== 'string' ? JSON.stringify(input.form[key]) : input.form[key])
                    });
                }
            }
        }
        const requestUrl = url.toString() + (qs ? `?${qs.toString()}` : '');

        const maxRetries = Math.max(1, this.opts.maxRetries ?? DEFAULT_MAX_RETRIES);
        let req: Response;
        for (let attempt = 1; ; attempt++) {
            // @ts-ignore
            req = await fetch(requestUrl, { method, headers: _headers, body });
            if (req.status !== 429 || attempt >= maxRetries) break;

            // Safe to retry unconditionally: rate limiting is enforced by middleware ahead of the
            // handler, so a 429 means the operation did not run. This is what lets a multipart
            // upload of more than a handful of parts finish at all — the API's write limit is
            // 15/min and every part is a write, so any large file WILL be throttled part-way
            // through. Bodies here are in-memory Blobs, so re-sending them is safe.
            //
            // Deliberately not extended to 5xx: there the handler may have partially run, and
            // replaying e.g. a session start would strand an upload.
            await sleep(retryDelayMs(req, attempt));
        }

        if (!req.ok) {
            const rawBody = await req.text();
            let parsed: ApiErrorBody | null = null;
            try { parsed = JSON.parse(rawBody) as ApiErrorBody; } catch { /* not JSON — keep the raw text */ }
            throw new RagextractApiError({ status: req.status, rawBody, body: parsed, method, url: requestUrl });
        }
        return req;
    }

    $get = async <T extends Record<string, any>>(
        route: string,
        input?: {
            query?: T,
            json?: T,
            form?: T
        },
        headers?: {
            'Content-Type'?: string;
        }
    ) => {
        return this._fetch('get',route,input,headers);
    }
    $post = async <T extends Record<string, any>>(
        route: string,
        input?: {
            query?: T,
            json?: T,
            form?: T
        },
        headers?: {
            'Content-Type'?: string;
        }
    ) => {
        return this._fetch('post',route,input,headers);
    }
    // PATCH and PUT exist for /v2, which uses proper verbs where /v1 overloaded POST and DELETE —
    // a partial update is a PATCH, and setting a cell override is an idempotent PUT.
    $patch = async <T extends Record<string, any>>(
        route: string,
        input?: {
            query?: T,
            json?: T,
            form?: T
        },
        headers?: {
            'Content-Type'?: string;
        }
    ) => {
        return this._fetch('patch',route,input,headers);
    }
    $put = async <T extends Record<string, any>>(
        route: string,
        input?: {
            query?: T,
            json?: T,
            form?: T
        },
        headers?: {
            'Content-Type'?: string;
        }
    ) => {
        return this._fetch('put',route,input,headers);
    }
    $delete = async <T extends Record<string, any>>(
        route: string,
        input?: {
            query?: T,
            json?: T,
            form?: T
        },
        headers?: {
            'Content-Type'?: string;
        }
    ) => {
        return this._fetch('delete',route,input,headers);
    }
};