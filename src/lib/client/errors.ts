/**
 * Typed API errors.
 *
 * Every non-2xx used to become `new Error(\`${status} ${text}\`)`, which forced callers to
 * string-parse the message to tell one failure from another. That is workable while every error is
 * a bug, and stops being workable once some of them are normal operating conditions:
 *
 *   402  the org is out of prepaid credits. Under credit billing this is an ordinary state a caller
 *        is expected to handle (top up, queue, degrade) — not an exception path.
 *   429  rate limited. Retryable, and the client now retries it automatically.
 *   403  an entitlement cap was exceeded (e.g. job concurrency). Retryable later, not now.
 *
 * `status` and the parsed `body` are exposed so callers can branch on the code rather than the
 * text, and the predicates below spare them memorising which number means what.
 */

export type ApiErrorBody = {
    success?: boolean;
    error?: string;
    message?: string;
    [key: string]: unknown;
};

export class RagextractError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'RagextractError';
    }
}

export class RagextractApiError extends RagextractError {
    readonly status: number;
    readonly body: ApiErrorBody | null;
    readonly rawBody: string;
    readonly method: string;
    readonly url: string;

    constructor(params: {
        status: number;
        rawBody: string;
        body: ApiErrorBody | null;
        method: string;
        url: string;
    }) {
        // The API is inconsistent about which key carries the reason — HTTPException responses use
        // `message`, handler-returned JSON uses `error` — so try both before falling back to raw.
        const detail = params.body?.error ?? params.body?.message ?? params.rawBody;
        super(`${params.status} ${params.method.toUpperCase()} ${params.url} — ${detail}`);
        this.name = 'RagextractApiError';
        this.status = params.status;
        this.body = params.body;
        this.rawBody = params.rawBody;
        this.method = params.method;
        this.url = params.url;
    }

    /** 401 — missing, unknown, revoked or expired API key. */
    get isUnauthorized() { return this.status === 401; }
    /** 402 — the org's prepaid credit balance cannot cover the request. */
    get isInsufficientCredits() { return this.status === 402; }
    /** 403 — an entitlement cap was exceeded. */
    get isCapExceeded() { return this.status === 403; }
    /** 429 — rate limited. Already retried by the client before you see this. */
    get isRateLimited() { return this.status === 429; }
    /** 4xx that is the caller's to fix — bad input, oversized upload, unknown id. */
    get isClientError() { return this.status >= 400 && this.status < 500; }
    /** 5xx — retrying is not automatically safe, since the handler may have partially run. */
    get isServerError() { return this.status >= 500; }
}
