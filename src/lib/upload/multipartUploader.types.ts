

export type UploadSessionStartRequest = {
    /**
     * `/v1` only, and required there. `/v2` has one ingest verb and does not accept the parameter,
     * so its uploader omits it — optional here rather than two near-identical request types.
     */
    jobType?: 'extract' | 'vectorize';
    fileName: string;
    fileExt: string;
    fileType: string;
    expiresInDays?: number;
};

export type UploadSessionStartResponse = {
    key: string;
};

export type UploadSessionAppendRequest = {
    key: string;
    partNumber: number;
    file: File;
};

export type UploadSessionPart = {
    etag: string;
    partNumber: number;
}

export type UploadSessionAppendResponse = UploadSessionPart;

export type UploadSessionEndRequest = {
    key: string;
    parts: Array<UploadSessionPart>
};

export type UploadSessionAbortRequest = {
    key: string;
};

export type UploadSessionAbortResponse = undefined;
