/**
 * The `/v2` vocabulary.
 *
 * A dataset is a FILE here, matching the app and the `/v2` wire. The `/v1` types in `../types.ts`
 * are untouched and still say `Dataset`/`datasetId` — the two versions coexist, and a caller on one
 * never sees the other's names.
 */

export type FileType = 'doc' | 'audio' | 'video' | 'image' | 'image_list';

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
    | 'list_scalar'
    /** Answers with a region of a page rather than text. See `ImageRegion`. */
    | 'image'
    /** Same value shape as `image`; a bundle unions the regions instead of resolving precedence. */
    | 'image_list';

/** `[xmin, ymin, xmax, ymax]` as fractions (0-1) of the page image's width and height. */
export type Box = [number, number, number, number];

/**
 * One picture an `image`/`image_list` column found.
 *
 * NOT a cropped bitmap — nothing server-side materialises a derived image, so the region is the
 * whole answer: fetch the page with `ws.files.item(fileId, itemId)` and crop to `box` yourself.
 *
 * `box` in fractions rather than pixels is what makes that work at any resolution — it was located
 * against the page image the model saw and maps unchanged onto a higher-DPI render of the same
 * page. `null` means the whole page.
 */
export type ImageRegion = {
    fileId: string;
    page: number;
    box: Box | null;
    /** What the model says it found — the verification signal, and the alt text. */
    caption: string | null;
};

/** Where a cell's answer came from. `box` is present when grounding managed to locate it. */
export type Citation = {
    fileId: string;
    page: number;
    quote: string | null;
    box?: Box | null;
};

/**
 * A cell's answer: regions for an image column, a typed scalar for everything else. Decided by the
 * column's `outputType`, so narrow on that rather than sniffing the shape.
 */
export type CellValue = ImageRegion[] | { type: string; value: unknown };

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
    /**
     * Credits charged per cell. Values are 4x what they were before 2026-08-17: a credit is now
     * $0.0025 rather than $0.01, so the dollar price is unchanged while the number is not.
     */
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
    value: CellValue | null;
    citations: Citation[] | null;
    confidence: number | null;
    /** A manual correction, kept alongside the AI value rather than replacing it. */
    humanOverride: CellValue | null;
    columnVersion: number;
    bundleVersion: number;
    /** The cell's snapshot is behind its column or its bundle — it needs a rerun to be current. */
    stale: boolean;
    createdAt: number;
    updatedAt: number;
};

/**
 * A run has one terminal state a dataset job does not: CANCELED, written when someone stops the
 * run. Deliberately not folded into `JobStatus` — a dataset job cannot reach it (`jobs.cancel`
 * lands a job on ERROR), so widening the shared union would advertise a state that never occurs.
 */
export type RunStatus = JobStatus | 'CANCELED';

export type Run = {
    id: string;
    tableId: string;
    status: RunStatus;
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
