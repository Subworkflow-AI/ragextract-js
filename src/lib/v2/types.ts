/**
 * The `/v2` vocabulary.
 *
 * A dataset is a FILE here, matching the app and the `/v2` wire. The `/v1` types in `../types.ts`
 * are untouched and still say `Dataset`/`datasetId` — the two versions coexist, and a caller on one
 * never sees the other's names.
 */

export type FileType = 'doc' | 'audio' | 'video' | 'image';

/** SUCCESS and ERROR are terminal — the pollers stop on either. */
export type JobStatus = 'NOT_STARTED' | 'IN_QUEUE' | 'IN_PROGRESS' | 'SUCCESS' | 'ERROR';

export type Share = {
    url: string;
    token: string;
    expiresAt: number;
};

export type Workspace = {
    id: string;
    name: string;
    orgId: string | null;
    createdAt: number;
    updatedAt: number;
    /**
     * What THIS key may do here: 1 read, 2 read & write, 3 manage. `0` means the key reaches only
     * specific tables inside the workspace and nothing else in it.
     */
    level: number;
};

export type RagextractFile = {
    id: string;
    workspaceId: string;
    type: FileType;
    fileName: string;
    fileExt: string;
    fileSize: number;
    itemCount: number;
    mimeType: string;
    createdAt: number;
    updatedAt: number;
    expiresAt: number;
    share: Share | null;
};

export type FileItem = {
    id: string;
    fileId: string;
    col: number;
    row: string;
    createdAt: number;
    share: Share;
};

export type Job = {
    id: string;
    fileId: string;
    type: string;
    status: JobStatus;
    statusText: string | null;
    startedAt: number;
    finishedAt: number;
    canceledAt: number;
    createdAt: number;
    updatedAt: number;
};

export type OutputType =
    | 'boolean'
    | 'date'
    | 'categorical'
    | 'number'
    | 'text_quote'
    | 'list_scalar';

export type Table = {
    id: string;
    workspaceId: string;
    name: string;
    /** Auto-run on each new upload to the workspace. */
    standing: boolean;
    color: string | null;
    /** BCP-47 primary language subtag the engine answers in. Null = English. */
    locale: string | null;
    archivedAt: number | null;
    createdAt: number;
    updatedAt: number;
};

export type Column = {
    id: string;
    tableId: string;
    name: string;
    prompt: string;
    outputType: OutputType;
    config: string | null;
    isCompositional: boolean;
    creditRate: number;
    sortOrder: number;
    version: number;
    archivedAt: number | null;
    createdAt: number;
    updatedAt: number;
};

export type Row = {
    id: string;
    tableId: string;
    subjectType: 'file' | 'bundle';
    subjectId: string;
    createdAt: number;
    updatedAt: number;
};

export type Cell = {
    id: string;
    rowId: string;
    columnId: string;
    status: JobStatus;
    statusText: string | null;
    /** `credits` or `cap` when billing stopped this cell; null when it ran or failed ordinarily. */
    blockReason: 'credits' | 'cap' | null;
    /** JSON string: the typed value `{ type, value }`. */
    value: string | null;
    /** JSON string: `[{ fileId, page, quote }]`. */
    citations: string | null;
    confidence: number | null;
    humanOverride: string | null;
    columnVersion: number;
    bundleVersion: number;
    /** The cell's snapshot is behind its column or its bundle — it needs a rerun to be current. */
    stale: boolean;
    createdAt: number;
    updatedAt: number;
};

export type Run = {
    id: string;
    tableId: string;
    status: JobStatus;
    triggeredBy: string | null;
    totalCells: number;
    pendingCells: number;
    startedAt: number;
    finishedAt: number;
    createdAt: number;
    updatedAt: number;
};

export type Bundle = {
    id: string;
    workspaceId: string;
    name: string;
    color: string | null;
    /** Bumped on every membership change; cells snapshot it to detect staleness. */
    documentsVersion: number;
    archivedAt: number | null;
    createdAt: number;
    updatedAt: number;
};

export type BundleFile = {
    fileId: string;
    /** Structural anchor — the document the others amend. */
    isPrimary: boolean;
    role: string | null;
    /** Precedence, with sortOrder as the tie-break. */
    effectiveAt: number | null;
    sortOrder: number;
    createdAt: number;
    updatedAt: number;
};
