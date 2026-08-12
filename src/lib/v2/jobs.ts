import { buildQuery, type ApiClient, type ApiResponse } from '../client';
import type { Job, JobStatus } from './types';

export class V2JobsAPI {
    constructor(
        private readonly api: ApiClient,
        private readonly workspaceId: string,
    ) {}

    private get base() {
        return `/workspaces/${this.workspaceId}`;
    }

    /**
     * Polls until the job reaches a terminal status.
     *
     * One second between attempts, `maxPollingCount` attempts — so the default is ~3 minutes, which
     * covers ordinary ingest. Throws on timeout rather than returning a still-running job: a caller
     * that treats "not finished" as "finished" reads an empty result as an empty document.
     */
    poll = async (job: Job | string, maxPollingCount = 60 * 3) => {
        const jobId = typeof job === 'string' ? job : job.id;
        if (!jobId.startsWith('dsj_')) throw new Error('Invalid job ID');

        for (let attempt = 0; attempt < maxPollingCount; attempt++) {
            const res = await this.get(jobId);
            if (!res?.status) throw new Error(`Unable to continue polling job ${jobId}`);
            if (res.status === 'SUCCESS' || res.status === 'ERROR') return res;
            await new Promise(resolve => setTimeout(resolve, 1e3));
        }
        throw new Error(`Job polling timed out for ${jobId} after ${maxPollingCount} attempts`);
    };

    get = async (jobId: string) => {
        if (!jobId.startsWith('dsj_')) throw new Error('Invalid job ID');
        const req = await this.api.$get(`${this.base}/jobs/${jobId}`);
        const res = (await req.json()) as ApiResponse<Job>;
        if (res.error) throw new Error(res.error);
        return res.data ?? null;
    };

    list = async (opts?: { statuses?: JobStatus | JobStatus[]; offset?: number; limit?: number }) => {
        const req = await this.api.$get(`${this.base}/jobs`, { query: buildQuery(opts) });
        const res = (await req.json()) as ApiResponse<Job[]>;
        if (res.error) throw new Error(res.error);
        return res.data ?? null;
    };

    /**
     * POST, not DELETE — `/v1` overloaded DELETE for this, which reads as destroying the record.
     * The job row survives a cancel and is exactly what the caller polls afterwards.
     */
    cancel = async (job: Job | string) => {
        const jobId = typeof job === 'string' ? job : job.id;
        if (!jobId.startsWith('dsj_')) throw new Error('Invalid job ID');
        const req = await this.api.$post(`${this.base}/jobs/${jobId}/cancel`);
        const res = (await req.json()) as ApiResponse<Job>;
        if (res.error) throw new Error(res.error);
        return res.data ?? null;
    };
}
