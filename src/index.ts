import { ApiClient } from "./lib/client";
import { DatasetsAPI } from './lib/datasets';
import { UploadAPI } from './lib/upload/api';
import { SearchAPI } from './lib/search/api';
import { JobsAPI } from "./lib/jobs/api";
import { V2WorkspacesAPI, WorkspaceHandle } from './lib/v2/workspaces';

// Public surface beyond the client itself. `RagextractApiError` in particular has to be reachable
// from the package root — branching on 402/403/429 is the documented way to handle failures, and it
// is not usable if callers cannot import the class to `instanceof` against.
export { RagextractError, RagextractApiError, type ApiErrorBody } from './lib/client/errors';
export type { Dataset, DatasetItem, DatasetType, Job, JobStatus } from './lib/types';
export type { SearchOpts } from './lib/search/api.types';
export type { ExtractRequestOpts, VectorizeRequestOpts, UploadSessionOpts } from './lib/upload/api.types';
export type {
    Bundle,
    BundleFile,
    Cell,
    Column,
    FileItem,
    FileType,
    OutputType,
    RagextractFile,
    Row,
    Run,
    Table,
    Workspace,
} from './lib/v2/types';
export { WorkspaceHandle } from './lib/v2/workspaces';

const API_HOST = 'https://api.ragextract.com';

export type ApiVersion = 'v1' | 'v2';

/**
 * Personal keys are `psk_`-prefixed and authenticate `/v2`; everything else is a workspace key on
 * `/v1`.
 *
 * The prefix is contract, not a heuristic — it is minted in ragextract-web (`apiKey.ts`) and
 * branched on in ragextract-api (`isPersonalKey`). Routing on it here means a user who pastes a new
 * key into existing code reaches the right API without changing a line.
 */
const PERSONAL_KEY_PREFIX = 'psk_';
export const apiVersionForKey = (apiKey: string): ApiVersion =>
    apiKey.startsWith(PERSONAL_KEY_PREFIX) ? 'v2' : 'v1';

type RagextractOpts = {
    apiKey?: string;
    baseUrl?: string;
    /**
     * Override the API version. Defaults to the one the key implies.
     *
     * The one useful case is `'v2'` with a workspace (`sk_`) key: `/v2` accepts those, pinned to
     * the one workspace they belong to, which makes migrating an existing integration a one-line
     * change rather than a re-keying exercise. The reverse — a personal key on `/v1` — is refused,
     * because `/v1` has no workspace parameter and could not know which workspace to act in.
     */
    apiVersion?: ApiVersion;
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
    private workspacesApi: V2WorkspacesAPI;
    private workspaceHandles = new Map<string, WorkspaceHandle>();

    /** Which API this client is talking to. Derived from the key unless overridden. */
    readonly apiVersion: ApiVersion;

    constructor(opts: RagextractOpts) {
        if (!opts?.apiKey) throw('Please add an API Key.');

        const implied = apiVersionForKey(opts.apiKey);
        if (opts.apiVersion === 'v1' && implied === 'v2') {
            // Fail here rather than at the edge: every request would 401 with a message about an
            // invalid key, which is the wrong thing to go looking at.
            throw new Error(
                'A personal API key (psk_…) cannot be used with v1. v1 endpoints have no workspace parameter — use v2, or a workspace key (sk_…).',
            );
        }
        this.apiVersion = opts.apiVersion ?? implied;

        const baseUrl = opts.baseUrl
            ? opts.baseUrl.endsWith('/') ? opts.baseUrl.slice(0, -1) : opts.baseUrl
            : `${API_HOST}/${this.apiVersion}`;

        this.api = new ApiClient({ apiKey: opts.apiKey, baseUrl, maxRetries: opts.maxRetries });
        this.jobsApi = new JobsAPI(this.api);
        this.datasetsApi = new DatasetsAPI(this.api,this.jobsApi);
        this.uploadApi = new UploadAPI(this.api,this.datasetsApi,this.jobsApi);
        this.searchApi = new SearchAPI(this.api);
        this.workspacesApi = new V2WorkspacesAPI(this.api);
    }

    private assertV2(member: string) {
        if (this.apiVersion !== 'v2') {
            throw new Error(`${member} requires the v2 API. Use a personal API key (psk_…), or pass apiVersion: 'v2'.`);
        }
    }

    // ── v2 ───────────────────────────────────────────────────────────────────

    /** Discover which workspaces this key reaches, and at what level. */
    get workspaces() {
        this.assertV2('workspaces');
        return this.workspacesApi;
    }

    /**
     * Everything inside one workspace: `ws.files`, `ws.tables`, `ws.bundles`, `ws.jobs`,
     * `ws.search()`.
     *
     * Handles are cached per id so repeated calls in a loop do not rebuild four API objects each
     * time, and so `ws === client.workspace(id)` holds for anyone comparing them.
     */
    workspace(workspaceId: string): WorkspaceHandle {
        this.assertV2('workspace()');
        const existing = this.workspaceHandles.get(workspaceId);
        if (existing) return existing;
        const handle = new WorkspaceHandle(this.api, workspaceId);
        this.workspaceHandles.set(workspaceId, handle);
        return handle;
    }

    // ── v1 ───────────────────────────────────────────────────────────────────
    //
    // Unchanged, and still the whole surface for a workspace key. `datasets` is v1's name for what
    // v2 calls files; both stay, because renaming a live API's client is not a kindness.

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
