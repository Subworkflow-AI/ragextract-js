import { buildQuery, type ApiClient, type ApiResponse, type QueryValue } from '../client';
import { MultipartUploader } from '../upload/multipartUploader';
import type { FileItem, FileType, Job, RagextractFile } from './types';
import type { V2JobsAPI } from './jobs';

/** Share-link TTL, in seconds. `/v2` has only ever had one spelling for this. */
type ShareTtlOpts = { expiresInSeconds?: number };

/** Above this the single-shot upload is refused and a multipart session is used instead. */
const SINGLE_SHOT_LIMIT_BYTES = 100 * 1024 * 1024;

/**
 * Files in one workspace.
 *
 * ONE INGEST VERB. `/v1` made callers choose between `extract` (parse only) and `vectorize` (parse
 * and embed); `/v2` always does both, so `upload()` is the whole surface and there is no
 * re-vectorize call to forget. Large files transparently switch to a multipart session — the
 * caller does not choose that either.
 */
export class V2FilesAPI {
    constructor(
        private readonly api: ApiClient,
        private readonly workspaceId: string,
        private readonly jobs: V2JobsAPI,
    ) {}

    private get base() {
        return `/workspaces/${this.workspaceId}`;
    }

    /**
     * Upload and ingest a file, or a URL for the service to fetch.
     *
     * Waits for the job to finish and returns the ingested file. Pass `async: true` to get the Job
     * back immediately instead and poll it yourself — the right choice for anything large enough
     * that holding a connection open for the duration is unreasonable.
     */
    upload = async (
        source: Blob | File | URL | string,
        opts?: {
            fileName?: string;
            expiresInDays?: number;
            async?: boolean;
            /** Chunk size for the multipart path, in bytes. Ignored for a single-shot upload. */
            chunkSize?: number;
        },
    ): Promise<RagextractFile | Job | null> => {
        const isUrl = source instanceof URL || typeof source === 'string';

        if (!isUrl && source.size > SINGLE_SHOT_LIMIT_BYTES) {
            return this.uploadLarge(source, opts);
        }

        const form: Record<string, unknown> = {
            expiresInDays: opts?.expiresInDays,
        };
        if (isUrl) form.url = String(source);
        else form.file = source;

        const req = await this.api.$post(`${this.base}/files`, { form: form as Record<string, never> });
        const res = (await req.json()) as ApiResponse<Job>;
        if (res.error) throw new Error(res.error);
        if (opts?.async || !res.data) return res.data ?? null;

        return this.awaitIngest(res.data);
    };

    /** Multipart path. Chosen automatically by `upload()`; exposed for callers streaming from disk. */
    uploadLarge = async (
        file: Blob | File,
        opts?: { fileName?: string; expiresInDays?: number; async?: boolean; chunkSize?: number },
    ): Promise<RagextractFile | Job | null> => {
        const fileName = opts?.fileName ?? (file instanceof File ? file.name : 'upload');
        const uploader = new MultipartUploader<Job>(this.api, {
            // Every session call nests under this workspace's files — see MultipartUploaderOpts.
            basePath: `${this.base}/files`,
            ...(opts?.chunkSize ? { chunkSize: opts.chunkSize } : {}),
        });

        await uploader.start({
            fileName,
            fileExt: fileName.split('.').pop() ?? '',
            fileType: file.type || 'application/octet-stream',
            // No `jobType`: /v2 has one ingest verb, and the endpoint does not accept the parameter.
            expiresInDays: opts?.expiresInDays,
        });
        try {
            await uploader.append(file);
            // `end()` answers with the API envelope, not the job — the multipart protocol's last
            // call is the one that creates it.
            const ended = await uploader.end();
            if (ended.error) throw new Error(ended.error);
            const job = ended.data ?? null;
            if (opts?.async || !job) return job;
            return this.awaitIngest(job);
        } catch (e) {
            // A half-finished session holds an R2 multipart upload open. Aborting is best-effort:
            // failing to clean up must not replace the error the caller actually needs to see.
            await uploader.abort().catch(() => {});
            throw e;
        }
    };

    private awaitIngest = async (job: Job) => {
        const finished = await this.jobs.poll(job);
        if (!finished?.fileId) throw new Error(`Ingest job finished without a fileId: ${JSON.stringify(finished)}`);
        return this.get(finished.fileId);
    };

    list = async (opts?: ShareTtlOpts & {
        types?: FileType;
        sort?: string | string[];
        offset?: number;
        limit?: number;
    }) => {
        const req = await this.api.$get(`${this.base}/files`, { query: buildQuery(opts as Record<string, QueryValue>) });
        const res = (await req.json()) as ApiResponse<RagextractFile[]>;
        if (res.error) throw new Error(res.error);
        return res.data ?? null;
    };

    get = async (fileId: string, opts?: ShareTtlOpts) => {
        const req = await this.api.$get(`${this.base}/files/${fileId}`, { query: buildQuery(opts) });
        const res = (await req.json()) as ApiResponse<RagextractFile>;
        if (res.error) throw new Error(res.error);
        return res.data ?? null;
    };

    delete = async (file: RagextractFile | RagextractFile[] | string | string[]) => {
        const ids = (Array.isArray(file) ? file : [file]).map(item =>
            typeof item === 'string' ? item : item.id,
        );
        // The bulk endpoint is all-or-nothing, so a single id goes through it too rather than
        // taking a different code path with different failure semantics.
        const req = await this.api.$delete(`${this.base}/files`, { json: { fileIds: ids } as never });
        const res = (await req.json()) as ApiResponse<never>;
        if (res.error) throw new Error(res.error);
        return true;
    };

    items = async (fileId: string, opts?: ShareTtlOpts & {
        row?: string;
        cols?: number | number[];
        sort?: string | string[];
        offset?: number;
        limit?: number;
    }) => {
        const req = await this.api.$get(`${this.base}/files/${fileId}/items`, {
            query: buildQuery(opts as Record<string, QueryValue>),
        });
        const res = (await req.json()) as ApiResponse<FileItem[]>;
        if (res.error) throw new Error(res.error);
        return res.data ?? null;
    };

    item = async (fileId: string, fileItemId: string, opts?: ShareTtlOpts) => {
        const req = await this.api.$get(`${this.base}/files/${fileId}/items/${fileItemId}`, {
            query: buildQuery(opts),
        });
        const res = (await req.json()) as ApiResponse<FileItem>;
        if (res.error) throw new Error(res.error);
        return res.data ?? null;
    };
}
