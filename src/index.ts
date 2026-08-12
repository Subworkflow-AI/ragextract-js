import { ApiClient } from "./lib/client";
import { DatasetsAPI } from './lib/datasets';
import { UploadAPI } from './lib/upload/api';
import { SearchAPI } from './lib/search/api';
import { JobsAPI } from "./lib/jobs/api";

// Public surface beyond the client itself. `RagextractApiError` in particular has to be reachable
// from the package root — branching on 402/403/429 is the documented way to handle failures, and it
// is not usable if callers cannot import the class to `instanceof` against.
export { RagextractError, RagextractApiError, type ApiErrorBody } from './lib/client/errors';
export type { Dataset, DatasetItem, DatasetType, Job, JobStatus } from './lib/types';
export type { SearchOpts } from './lib/search/api.types';
export type { ExtractRequestOpts, VectorizeRequestOpts, UploadSessionOpts } from './lib/upload/api.types';

const BASE_URL = 'https://api.ragextract.com/v1';

type RagextractOpts = {
    apiKey?: string;
    baseUrl?: string;
    /**
     * Attempts per request when the API rate-limits (429). Defaults to 10, which is what lets a
     * large multipart upload ride out the API's 15-writes/minute limit rather than fail part-way.
     * Set to 1 to surface 429s immediately.
     */
    maxRetries?: number;
}

export class Ragextract {
    private api: ApiClient;
    private jobsApi: JobsAPI;
    private uploadApi: UploadAPI;
    private datasetsApi: DatasetsAPI;
    private searchApi: SearchAPI;

    constructor(opts: RagextractOpts) {
        if (!opts?.apiKey) throw('Please add an API Key.');
        const baseUrl = opts.baseUrl
            ? opts.baseUrl.endsWith('/') ? opts.baseUrl.slice(0, -1) : opts.baseUrl
            : BASE_URL;
        this.api = new ApiClient({ apiKey: opts.apiKey, baseUrl, maxRetries: opts.maxRetries });
        this.jobsApi = new JobsAPI(this.api);
        this.datasetsApi = new DatasetsAPI(this.api,this.jobsApi);
        this.uploadApi = new UploadAPI(this.api,this.datasetsApi,this.jobsApi);
        this.searchApi = new SearchAPI(this.api);
    }
    get extract() {
        return this.uploadApi.extract;
    }
    get vectorize() {
        return this.uploadApi.vectorize;
    }
    get search() {
        return this.searchApi.search;
    }
    get datasets() {
        return this.datasetsApi;
    }
    get jobs() {
        return this.jobsApi;
    }
}
