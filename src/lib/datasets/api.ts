import { buildQuery, type ApiClient, type ApiResponse, type QueryValue } from "../client";
import type { JobsAPI } from "../jobs/api";
import type { Dataset, DatasetItem, DatasetType, Job } from "../types";

/**
 * Share-link TTL, in seconds.
 *
 * `expiryInSeconds` is the historical SDK spelling and never reached the API, which reads
 * `expiresInSeconds`. Both are accepted so existing code keeps compiling — and now actually takes
 * effect — but new code should use `expiresInSeconds`.
 */
type ShareTtlOpts = {
    expiresInSeconds?: number;
    /** @deprecated Use `expiresInSeconds`. Still honoured; will go in a future major. */
    expiryInSeconds?: number;
};

export class DatasetsAPI {
    constructor(
        private readonly api: ApiClient,
        private readonly jobs: JobsAPI
    ){}

    get = async (datasetId: string, opts?: ShareTtlOpts) => {
        const req = await this.api.$get(`/datasets/${datasetId}`,{ query: buildQuery(opts) });
        const res = await req.json() as ApiResponse<Dataset>;
        if (res.error) throw new Error(res.error);
        return res.data || null;
    }

    delete = async (dataset: Dataset | Dataset[] | string | string[]) => {
        const items = [];
        if (Array.isArray(dataset)) {
            items.push(
                ...dataset.map(item => typeof item !== 'string' ? item.id : item)
            )
        } else {
            items.push(typeof dataset !== 'string' ? dataset.id : dataset);
        }
        const req = await this.api.$delete(`/datasets`, {
            json: { datasetIds: items }
        });
        const res = await req.json() as ApiResponse<Dataset>;
        if (res.error) throw new Error(res.error);
        return res.data || null;
    }

    vectorize = async (dataset: Dataset | string, opts?: { async?: boolean }) => {
        const datasetId = typeof dataset === 'string' ? dataset : dataset.id;
        const req = await this.api.$post(`/datasets/${datasetId}/vectorize`);
        const res = await req.json() as ApiResponse<Job>;
        if (res.error) throw new Error(res.error);
        if (opts?.async || !res.data) return res.data;

        const jobResponse = await this.jobs.poll(res.data, 500);
        if (!jobResponse?.datasetId) throw new Error(`Expected dataset after job polling but got none. ${jobResponse}`);
        const datasetResponse = await this.get(jobResponse.datasetId);
        return datasetResponse;
    }

    list = async (opts?: ShareTtlOpts & {
        /**
         * Filter by dataset type. Omit to return every type.
         *
         * The wire name is `types`; the SDK previously sent `type`, which the API ignored — so this
         * filter has never actually applied. It also hard-coded `doc` on every call, meaning
         * `list()` really did return all types. Defaulting to no filter preserves that observed
         * behaviour rather than silently narrowing existing callers' results to `doc`.
         *
         * One value only: the API validates this against a single-value enum today, so a
         * comma-joined list is rejected.
         */
        types?: DatasetType,
        sort?: string | string[];
        offset?: number;
        limit?: number;
    }) => {
        const req = await this.api.$get(`/datasets`,{ query: buildQuery(opts as Record<string, QueryValue>) });
        const res = await req.json() as ApiResponse<Dataset[]>;
        if (res.error) throw new Error(res.error);
        return res.data || null;
    }

     getItems = async (
        dataset: Dataset | string,
        opts?: ShareTtlOpts & {
            row?: string;
            cols?: number | number[];
            sort?: string | string[];
            offset?: number;
            limit?: number;
        }
    ) => {
        const datasetId = typeof dataset === 'string' ? dataset : dataset.id;
        const req = await this.api.$get(`/datasets/${datasetId}/items`,{ query: buildQuery(opts as Record<string, QueryValue>) });
        const res = await req.json() as ApiResponse<DatasetItem[]>;
        if (res.error) throw new Error(res.error);
        return res.data || null;
    }
}
