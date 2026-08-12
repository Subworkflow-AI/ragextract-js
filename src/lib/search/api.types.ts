import type { Dataset } from "../types";

export type SearchOpts = {
    query: string | { text: string, image_url?: string };
    /** Up to 100 datasets; the API rejects more. */
    datasets: Dataset | Dataset[] | string | string[];
    limit?: number;
    /** Share-link TTL for the returned items, in seconds. */
    expiresInSeconds?: number;
    /** @deprecated Use `expiresInSeconds`. Still honoured; will go in a future major. */
    expiryInSeconds?: number;
};

// `sort` and `offset` were declared here but /search accepts neither — results come back ranked by
// relevance, which is the only ordering a vector search has. They were stripped server-side, so
// passing them looked supported and did nothing. Removed rather than left as a lie; add them back
// if and when the endpoint grows them.