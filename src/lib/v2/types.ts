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
 * A cell's answer. **Reads always return `{ type, value }`**, image columns included, where `value`
 * is the `ImageRegion[]`. Narrow on the column's `outputType` rather than sniffing the shape.
 *
 * The bare `ImageRegion[]` is accepted by `setOverride` on an image column and wrapped by the API
 * before it is stored. Until 2026-09-27 it was stored bare, and read as empty in the app.
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
 * The operators a query condition may use. Which ones a column accepts depends on its `outputType`
 * — the API refuses an operator the column does not offer and names the ones it does:
 *
 *   text_quote: contains, not_contains, is, is_not
 *   number:     eq, neq, gt, gte, lt, lte, between
 *   date:       eq, lt, lte, gt, gte, between — absolute `YYYY-MM-DD` only, never "today"
 *   boolean:    is_true, is_false
 *   categorical: is_any_of, is_none_of
 *   list_scalar: is_any_of, has_all_of, is_none_of, contains
 *   image / image_list: contains, not_contains (on captions)
 *   document (the row's file names): is_any_of, is_none_of, contains
 *   every column but document: is_empty, is_not_empty, no_answer, has_error, not_extracted
 */
export type TableQueryOperator =
    | 'contains' | 'not_contains' | 'is' | 'is_not'
    | 'is_any_of' | 'is_none_of' | 'has_all_of'
    | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'between'
    | 'is_true' | 'is_false'
    | 'is_empty' | 'is_not_empty' | 'no_answer' | 'has_error' | 'not_extracted';

export type TableQueryCondition = {
    /** A column id, its exact name (case-insensitive), or `'document'` for the row's file names. */
    column: string;
    op: TableQueryOperator;
    /** The operand: a number, text, or a `YYYY-MM-DD` date. */
    value?: string | number | boolean;
    /** The upper bound, for `between`. */
    value2?: string | number;
    /** For `is_any_of`, `is_none_of` and `has_all_of`. */
    values?: (string | number)[];
};

export type TableQuery = {
    /** All of them must hold. */
    where?: TableQueryCondition[];
    /** Columns to return, by id or name. Default: every column. */
    select?: string[];
    /** Blanks sort last in either direction. Default: table order. */
    sort?: { column: string; direction?: 'asc' | 'desc' };
    /** Default 25, max 200. */
    limit?: number;
    offset?: number;
    /** Include each cell's quotes, not just the pages it cites. */
    citations?: boolean;
};

/** Why a condition could not be decided for a row. */
export type UndeterminedReason = 'not_extracted' | 'pending' | 'error' | 'no_answer' | 'unreadable';

export type TableQueryCell = {
    cellId: string | null;
    /** The value a person sees — a human correction when `overridden`. The inner value (a number,
     *  text, a list, regions), not the `{ type, value }` wrapper; `outputType` says which. */
    value: unknown;
    overridden: boolean;
    stale: boolean;
    confidence: number | null;
    status: string | null;
    pages: { fileId: string; page: number }[];
    /** Present when the query asked for `citations: true`. */
    citations?: Citation[] | null;
};

export type TableQueryResult = {
    rowsInTable: number;
    matched: number;
    /**
     * Rows nothing decidable ruled out, but at least one condition could not be decided — a cell
     * never extracted, errored, empty, or unreadable as its type. They are in neither `rows` nor the
     * excluded set: report them as unknown, never as failing.
     */
    undetermined: number;
    undeterminedBy: Record<string, Partial<Record<UndeterminedReason, number>>>;
    /** Up to 25 of the undetermined rows, with the reason per column. */
    undeterminedRows: { rowId: string; label: string | null; reasons: Record<string, UndeterminedReason> }[];
    /** Matches whose answer rests on a cell extracted before its column or documents changed. */
    matchedOnStale: number;
    offset: number;
    /** Null on the last page. */
    nextOffset: number | null;
    columns: { key: string; columnId: string; name: string; outputType: string }[];
    rows: {
        rowId: string;
        /** What the app calls the row: a bundle's name, or its primary file's. */
        label: string | null;
        /** Keyed by column name (id appended where two share one). The document field is a list
         *  of file names. */
        cells: Record<string, TableQueryCell | (string | null)[]>;
    }[];
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
