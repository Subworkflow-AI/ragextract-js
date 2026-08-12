import type { ApiClient, ApiResponse } from "../client";
import type { DatasetItem } from "../types";
import type { SearchOpts } from "./api.types";

export class SearchAPI {
    constructor(
        private readonly api: ApiClient
    ){}

    search = async (opts: SearchOpts) => {
        // Built explicitly rather than by spreading `opts`. The spread also shipped `datasets` —
        // whole Dataset objects, once resolved to ids just below — in the request body, where the
        // API strips them. Harmless but wasteful, and it grew with the number of datasets searched.
        const json = {
            query: opts.query,
            datasetIds: opts.datasets
                ? Array.isArray(opts.datasets)
                    ? opts.datasets.map(item => typeof item === 'string' ? item : item.id)
                    : typeof opts.datasets === 'string' ? [opts.datasets] : [opts.datasets.id]
                : undefined,
            limit: opts.limit,
            // The API reads `expiresInSeconds`; `expiryInSeconds` was the SDK's misspelling and
            // silently did nothing.
            expiresInSeconds: opts.expiresInSeconds ?? opts.expiryInSeconds,
        };
        const req = await this.api.$post(`/search`,{ json });
        const res = await req.json() as ApiResponse<DatasetItem[]>;
        if (res.error) throw new Error(res.error);
        return res.data || null;
    }
}