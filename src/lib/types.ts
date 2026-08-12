/** Dataset types the API recognises; mirrors the `dataset.type` union in ragextract-db. */
export type DatasetType = 'doc' | 'audio' | 'video' | 'image';

/** SUCCESS and ERROR are terminal — `jobs.poll` stops on either. */
export type JobStatus = 'NOT_STARTED' | 'IN_QUEUE' | 'IN_PROGRESS' | 'SUCCESS' | 'ERROR';

export type Job = {
    id: string;
    datasetId: string;
    type: string;
    status: JobStatus;
    statusText: string;
    startedAt: number;
    finishedAt: number;
    canceledAt: number;
    createdAt: number;
    updatedAt: number;
};

export type Dataset = {
    id: string;
    workspaceId: string;
    type: DatasetType;
    fileName: string;
    fileExt: string;
    fileSize: number;
    itemCount: number;
    mimeType: string;
    createdAt: number;
    updatedAt: number;
    expiresAt: number;
    share: {
        url: string;
        token: string;
        expiresAt: number;
    }
};

export type DatasetItem = {
    id: string;
    datasetId: string;
    col: number;
    row: string;
    createdAt: number;
    share: {
        url: string;
        token: string;
        expiresAt: number;
    }
};