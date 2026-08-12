/**
 * Builds a query string from an options object.
 *
 * Three call sites had near-identical copies of this reduce, which is how the share-TTL option came
 * to be spelled `expiryInSeconds` in the SDK while the API has always read `expiresInSeconds`. The
 * name never matched, so passing it did nothing: unknown query keys are stripped by the API's zod
 * schemas rather than rejected, and the failure was completely silent. Keeping one builder means
 * the mapping is stated once.
 */

/** Option keys the SDK exposes under a different name than the wire accepts. */
const WIRE_NAMES: Record<string, string> = {
    /** @deprecated Historical SDK misspelling — accepted so existing code keeps compiling. */
    expiryInSeconds: 'expiresInSeconds',
};

export type QueryValue = string | number | boolean | Array<string | number> | undefined | null;

export const buildQuery = (
    opts?: Record<string, QueryValue>,
): Record<string, string | number> | undefined => {
    if (!opts) return undefined;

    const query: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(opts)) {
        // Skip absent values, but NOT falsy ones — `offset: 0` is meaningful, and the previous
        // `if (!value) return acc` silently dropped it.
        if (value === undefined || value === null || value === '') continue;
        if (Array.isArray(value)) {
            if (!value.length) continue;
            query[WIRE_NAMES[key] ?? key] = value.join(',');
        } else {
            query[WIRE_NAMES[key] ?? key] = typeof value === 'boolean' ? String(value) : value;
        }
    }
    // A caller passing both spellings gets the correct one; the deprecated key must not win by
    // virtue of iteration order.
    if (opts.expiresInSeconds !== undefined && opts.expiresInSeconds !== null) {
        query.expiresInSeconds = opts.expiresInSeconds as string | number;
    }
    return Object.keys(query).length ? query : undefined;
};
