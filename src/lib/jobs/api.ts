import { buildQuery, type ApiClient, type ApiResponse } from "../client";
import type { Job, JobStatus } from "../types";

export class JobsAPI {
    constructor(
        private readonly api: ApiClient
    ){}

    poll = async (job: Job | string, maxPollingCount = 60 * 3) => {
        const jobId = typeof job === 'string' ? job : job.id;
        if (!jobId.startsWith('dsj_')) throw new Error('Invalid job ID');

        let isFinished = false;
        let pollingCount = 0;
        let jobResponse;
        while (
            !isFinished
            && pollingCount < maxPollingCount
        ) {
            const jobRequest = await this.api.$get(`/jobs/${jobId}`);
            jobResponse = await jobRequest.json() as ApiResponse<Job>;
            if (jobResponse.error || !jobResponse.data?.status) throw new Error(`Unabled to continue polling for job. ${jobResponse}`);
            isFinished = jobResponse.data.status === 'SUCCESS' || jobResponse.data.status === 'ERROR';
            pollingCount = pollingCount + 1;
            await new Promise(res => setTimeout(res,1e3));
        }
        if (!isFinished) throw new Error(`Job polling timed out for ${jobId} (${pollingCount})`);
        return jobResponse?.data ?? null;
    }

    get = async (jobId: string) => {
        if (!jobId.startsWith('dsj_')) throw new Error('Invalid job ID');
        const req = await this.api.$get(`/jobs/${jobId}`);
        const res = await req.json() as ApiResponse<Job>;
        if (res.error) throw new Error(res.error);
        return res.data || null;
    }

    cancel = async (job: Job | string) => {
        const jobId = typeof job === 'string' ? job : job.id;
        if (!jobId.startsWith('dsj_')) throw new Error('Invalid job ID');
        const req = await this.api.$delete(`/jobs/${jobId}`);
        const res = await req.json() as ApiResponse<Job>;
        if (res.error) throw new Error(res.error);
        return res.data || null;
    }

    // `types` was declared here but /jobs accepts only statuses/offset/limit — it was stripped
    // server-side, so filtering by job type looked supported and quietly returned everything.
    // Removed rather than left as a lie.
    list = async (opts?: {
        statuses?: JobStatus | JobStatus[];
        offset?: number;
        limit?: number;
    }) => {
        const req = await this.api.$get(`/jobs`,{ query: buildQuery(opts) });
        const res = await req.json() as ApiResponse<Job[]>;
        if (res.error) throw new Error(res.error);
        return res.data || null;
    }
}