import type { ApiClient, ApiResponse } from '../client';
import { V2BundlesAPI } from './bundles';
import { V2FilesAPI } from './files';
import { V2JobsAPI } from './jobs';
import { V2TablesAPI } from './tables';
import type { FileItem, RagextractFile, Workspace } from './types';

type SearchOpts = {
    query: string | { text: string; image_url?: string };
    /** Up to 100 files; the API rejects more. Omit to search the whole workspace. */
    files?: RagextractFile | RagextractFile[] | string | string[];
    limit?: number;
    /** Share-link TTL for the returned items, in seconds. */
    expiresInSeconds?: number;
};

/**
 * Everything inside one workspace, with its id supplied once.
 *
 * Every `/v2` route is nested under a workspace, so without this the id would be the first argument
 * of every call in the SDK. `client.workspace('wks_…')` returns this handle; the sub-APIs close
 * over the id and never take it again.
 */
export class WorkspaceHandle {
    readonly files: V2FilesAPI;
    readonly tables: V2TablesAPI;
    readonly bundles: V2BundlesAPI;
    readonly jobs: V2JobsAPI;

    constructor(
        private readonly api: ApiClient,
        readonly id: string,
    ) {
        this.jobs = new V2JobsAPI(api, id);
        this.files = new V2FilesAPI(api, id, this.jobs);
        this.tables = new V2TablesAPI(api, id);
        this.bundles = new V2BundlesAPI(api, id);
    }

    /** Semantic search across this workspace's ingested files. Charged against prepaid credits. */
    search = async (opts: SearchOpts) => {
        // Built explicitly rather than spread: `files` may hold whole File objects, and shipping
        // those alongside the ids derived from them is the bug /v1's search had for its whole life.
        const json = {
            query: opts.query,
            fileIds: opts.files
                ? (Array.isArray(opts.files) ? opts.files : [opts.files]).map(item =>
                      typeof item === 'string' ? item : item.id,
                  )
                : undefined,
            limit: opts.limit,
            expiresInSeconds: opts.expiresInSeconds,
        };
        const req = await this.api.$post(`/workspaces/${this.id}/search`, { json: json as never });
        const res = (await req.json()) as ApiResponse<FileItem[]>;
        if (res.error) throw new Error(res.error);
        return res.data ?? null;
    };

    /** Mints a signed, expiring link to one page of one file. */
    share = async (fileItemId: string, opts?: { expiresInSeconds?: number }) => {
        const req = await this.api.$post(`/workspaces/${this.id}/share/${fileItemId}`, {
            json: (opts ?? {}) as never,
        });
        const res = (await req.json()) as ApiResponse<{ url: string; token: string; expiresAt: number }>;
        if (res.error) throw new Error(res.error);
        return res.data ?? null;
    };
}

export class V2WorkspacesAPI {
    constructor(private readonly api: ApiClient) {}

    /**
     * Every workspace this key can reach, with the level it has in each.
     *
     * The natural first call: a personal key spans workspaces, and this is how a client discovers
     * which ones without provoking a 404 per guess. A `level` of 0 means the key reaches only
     * specific tables inside that workspace and nothing else in it.
     */
    list = async () => {
        const req = await this.api.$get('/workspaces');
        const res = (await req.json()) as ApiResponse<Workspace[]>;
        if (res.error) throw new Error(res.error);
        return res.data ?? null;
    };

    get = async (workspaceId: string) => {
        const req = await this.api.$get(`/workspaces/${workspaceId}`);
        const res = (await req.json()) as ApiResponse<Workspace>;
        if (res.error) throw new Error(res.error);
        return res.data ?? null;
    };

    /** Organisation owners and admins only, and only with a personal key. */
    create = async (data: { name: string }) => {
        const req = await this.api.$post('/workspaces', { json: data as never });
        const res = (await req.json()) as ApiResponse<Workspace>;
        if (res.error) throw new Error(res.error);
        return res.data ?? null;
    };

    rename = async (workspaceId: string, name: string) => {
        const req = await this.api.$patch(`/workspaces/${workspaceId}`, { json: { name } as never });
        const res = (await req.json()) as ApiResponse<Workspace>;
        if (res.error) throw new Error(res.error);
        return res.data ?? null;
    };
}
