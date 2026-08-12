import type { ApiClient, ApiResponse } from "../client";
import type {
    UploadSessionAppendResponse,
    UploadSessionPart,
    UploadSessionStartRequest,
    UploadSessionStartResponse } from "./multipartUploader.types";
import pLimit from 'p-limit';

type MultipartUploaderOpts = {
    chunkSize: number;
    concurrency: number;
}

class MultipartUploader <T>{
    private key: string | null = null;
    private uploadedParts: UploadSessionPart[] = [];
    private opts: MultipartUploaderOpts = {
        chunkSize: 1024 * 1024 * 10,
        concurrency: 4
    };

    constructor(
        private readonly api: ApiClient,
        opts?: Partial<MultipartUploaderOpts>
    ) {
        if (opts) this.opts = { ...this.opts, ...opts };
    }

    public getKey(): string | null {
        return this.key;
    }

    public start = async (params: UploadSessionStartRequest) => {
        this.uploadedParts = [];
        const formData = {
            fileName: params.fileName,
            fileExt: params.fileExt,
            fileType: params.fileType,
            jobType: params.jobType,
            expiresInDays: params.expiresInDays ? String(params.expiresInDays) : undefined
        }

        const req = await this.api.$post(`/upload_session/start`,{ form: formData });
        const response = await req.json() as ApiResponse<UploadSessionStartResponse>;
        if (!response.data?.key) throw new Error(`Expected response to contain 'key' but none found.`);
        this.key = response.data.key;
    }

    private sendChunk = async (
         partNumber: number,
         file: Blob
    ): Promise<void> => {
        if (!this.key) throw new Error('Upload session not started. Call start() first.');

        const formData = new FormData();
        formData.append('key', this.key);
        formData.append('partNumber', String(partNumber));
        formData.append('file', file, `${this.key}_${partNumber}`);

        const req = await this.api.$post(`/upload_session/append`,{ form: formData });
        const response = await req.json() as ApiResponse<UploadSessionAppendResponse>;

        const part = response.data;
        if (!part?.etag || !part?.partNumber) throw new Error(`${this.key} Append response is missing 'etag' or 'partNumber' property.`);
        this.uploadedParts.push(part);
    }

    public append = async (data: Blob | Buffer | ArrayBuffer): Promise<void> => {
        const limiter = pLimit(this.opts.concurrency ?? 4);

        const totalSize = (data as any).size ?? (data as any).byteLength;
        if (typeof totalSize === 'undefined') {
            throw new Error(`${this.key} Unsupported data type for append. Must be Blob, Buffer, or ArrayBuffer.`);
        }

        const numChunks = Math.ceil(totalSize / this.opts.chunkSize!);

        const jobs = [];
        let offset = 0;
        for (let i = 0; i < numChunks; i++) {
            const partNumber = i + 1;
            let chunk: Blob;
            if (data instanceof Blob) {
                chunk = (data as any).slice(offset, offset + this.opts.chunkSize!);
            } else if (data instanceof Buffer) {
                const bufferChunk = (data as Buffer).subarray(offset, offset + this.opts.chunkSize!);
                chunk = new Blob([new Uint8Array(bufferChunk)]);
            } else if (data instanceof ArrayBuffer) {
                const arrayBufferChunk = (data as ArrayBuffer).slice(offset, offset + this.opts.chunkSize!);
                chunk = new Blob([new Uint8Array(arrayBufferChunk)]);
            } else {
                throw new Error(`${this.key} partNumber=${partNumber} Unsupported data type for chunking. Must be Blob, Buffer, or ArrayBuffer.`);
            }
            jobs.push(limiter(() => this.sendChunk(partNumber, chunk)));
            offset += chunk.size;
        }

        try {
            await Promise.all(jobs);
        } catch (e) {
            // Abort, then rethrow. A failed part used to escape with the session still open,
            // leaving an incomplete multipart upload in R2 that nothing cleans up — and the caller
            // could not abort it themselves, since the key is private and `end()` is what clears it.
            // Best-effort: the original failure is the informative one, so a failing abort must not
            // replace it.
            try {
                await this.abort();
            } catch (abortError) {
                console.warn('Failed to abort upload session after a part error.', abortError);
            }
            throw e;
        }
    }

    public end = async () => {
        if (!this.key) throw new Error('No active session to end.');
        const sortedParts = this.uploadedParts.sort((a, b) => a.partNumber - b.partNumber);
        const formData = {
            key: this.key,
            parts: sortedParts
        }
        const req = await this.api.$post(`/upload_session/end`, { form: formData });
        const response = await req.json() as ApiResponse<T>;
        this.key = null;
        return response;
    }

    public abort = async (): Promise<void> => {
        if (!this.key) console.warn('Attempted to abort, but no active session found.');
        const formData = { key: this.key };
        await this.api.$post(`/upload_session/abort`, { form: formData });
        this.key = null;
        this.uploadedParts = [];
    }
}

export { MultipartUploader };
