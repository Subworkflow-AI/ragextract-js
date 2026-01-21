import { ApiClient } from "./lib/client";
import { DatasetsAPI } from './lib/datasets';
import { UploadAPI } from './lib/upload/api';
import { SearchAPI } from './lib/search/api';
import { JobsAPI } from "./lib/jobs/api";

const BASE_URL = 'https://api.subworkflow.ai/v1';

type RagextractOpts = {
    apiKey?: string;
    baseUrl?: string;
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
        this.api = new ApiClient({ apiKey: opts.apiKey, baseUrl });
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
