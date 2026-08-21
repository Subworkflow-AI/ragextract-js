import { buildQuery, type ApiClient, type ApiResponse } from '../client';
import type { Cell, CellValue, Column, OutputType, Row, Run, Table } from './types';

type TableBundle = {
    table: Table;
    columns: Column[];
    rows: Row[];
    cells: Cell[];
};

type RunResult = {
    run: Run | null;
    cells: number;
    /** Rows left out because a document is still processing, or the bundle is empty. */
    skippedRowIds: string[];
};

type RunSelection = {
    /** Omit both to run the whole table. Given together, they intersect. */
    rowIds?: string[];
    columnIds?: string[];
};

/**
 * Tables — user-defined typed columns × rows of files or bundles, producing extracted cells.
 *
 * TWO THINGS TO KNOW BEFORE CALLING `run`:
 *
 *   - It spends credits, per cell, and `previewRun()` prices exactly the same set beforehand.
 *   - It returns as soon as the cells are queued. `runAndWait()` polls to completion instead.
 *
 * A rerun never clobbers a cell carrying a human override, and skips rows whose documents are still
 * ingesting — so the cell count in the result is usually what was actually started, not what was
 * asked for. `skippedRowIds` says which rows fell out.
 */
export class V2TablesAPI {
    constructor(
        private readonly api: ApiClient,
        private readonly workspaceId: string,
    ) {}

    private get base() {
        return `/workspaces/${this.workspaceId}/tables`;
    }

    private unwrap = async <T>(req: Response): Promise<T | null> => {
        const res = (await req.json()) as ApiResponse<T>;
        if (res.error) throw new Error(res.error);
        return res.data ?? null;
    };

    list = async () => this.unwrap<Table[]>(await this.api.$get(this.base));

    /** The whole table — metadata, columns, rows and cells — in one call. */
    get = async (tableId: string) =>
        this.unwrap<TableBundle>(await this.api.$get(`${this.base}/${tableId}`));

    create = async (data: { name: string; standing?: boolean; color?: string | null; locale?: string | null }) =>
        this.unwrap<Table>(await this.api.$post(this.base, { json: data as never }));

    update = async (
        tableId: string,
        patch: { name?: string; standing?: boolean; color?: string | null; locale?: string | null },
    ) => this.unwrap<Table>(await this.api.$patch(`${this.base}/${tableId}`, { json: patch as never }));

    /** Archives the table. Its columns, rows, cells and audit trail are kept, not deleted. */
    delete = async (tableId: string) =>
        this.unwrap<Table>(await this.api.$delete(`${this.base}/${tableId}`));

    // ── columns ──────────────────────────────────────────────────────────────

    columns = async (tableId: string) =>
        this.unwrap<Column[]>(await this.api.$get(`${this.base}/${tableId}/columns`));

    addColumn = async (
        tableId: string,
        data: {
            name: string;
            prompt: string;
            outputType?: OutputType;
            /** JSON string of type-specific config (categorical options, date format, …). */
            config?: string | null;
            /** True when the answer spans documents rather than living in one of them. */
            isCompositional?: boolean;
            /**
             * Credits charged per cell for this column. Omit it and the server applies its own
             * default, which is what you want unless you are deliberately repricing a column.
             *
             * ⚠️ **The valid range changed on 2026-08-17** and is now **4–40** (it was 1–10). A
             * credit was redenominated from $0.01 to $0.0025, so the same DOLLAR prices are now
             * expressed in 4x as many credits — a typed column is 4, a list column around 12.
             * Sending a value in the old range is rejected by the API with a 400, so code that
             * hardcoded `creditRate: 1` needs updating rather than silently repricing.
             */
            creditRate?: number;
            sortOrder?: number;
        },
    ) => this.unwrap<Column>(await this.api.$post(`${this.base}/${tableId}/columns`, { json: data as never }));

    /** Editing the prompt or output type bumps the column version, marking every cell stale. */
    updateColumn = async (
        tableId: string,
        columnId: string,
        patch: Partial<{
            name: string;
            prompt: string;
            outputType: OutputType;
            config: string | null;
            isCompositional: boolean;
            creditRate: number;
            sortOrder: number;
        }>,
    ) =>
        this.unwrap<Column>(
            await this.api.$patch(`${this.base}/${tableId}/columns/${columnId}`, { json: patch as never }),
        );

    deleteColumn = async (tableId: string, columnId: string) =>
        this.unwrap<Column>(await this.api.$delete(`${this.base}/${tableId}/columns/${columnId}`));

    // ── rows ─────────────────────────────────────────────────────────────────

    rows = async (tableId: string) =>
        this.unwrap<Row[]>(await this.api.$get(`${this.base}/${tableId}/rows`));

    addRow = async (tableId: string, subject: { type: 'file' | 'bundle'; id: string }) =>
        this.unwrap<Row>(
            await this.api.$post(`${this.base}/${tableId}/rows`, {
                json: { subjectType: subject.type, subjectId: subject.id } as never,
            }),
        );

    /** Hard delete — the row's cells, their events and their facts go with it. */
    deleteRow = async (tableId: string, rowId: string) =>
        this.unwrap<never>(await this.api.$delete(`${this.base}/${tableId}/rows/${rowId}`));

    // ── cells ────────────────────────────────────────────────────────────────

    cells = async (tableId: string) =>
        this.unwrap<Cell[]>(await this.api.$get(`${this.base}/${tableId}/cells`));

    /**
     * Sets a human override. The AI value is kept alongside it, never overwritten, and a rerun will
     * not touch an overridden cell.
     *
     * `value` is the typed value itself, not a JSON string, and matches the column's `outputType` —
     * `{ type, value }` for a typed column, `ImageRegion[]` for an image one.
     */
    setOverride = async (tableId: string, cellId: string, value: CellValue) =>
        this.unwrap<Cell>(
            await this.api.$put(`${this.base}/${tableId}/cells/${cellId}/override`, {
                json: { value } as never,
            }),
        );

    clearOverride = async (tableId: string, cellId: string) =>
        this.unwrap<Cell>(await this.api.$delete(`${this.base}/${tableId}/cells/${cellId}/override`));

    /** Append-only audit of every override set and cleared on this cell. */
    cellEvents = async (tableId: string, cellId: string) =>
        this.unwrap<unknown[]>(await this.api.$get(`${this.base}/${tableId}/cells/${cellId}/events`));

    /** For a bundle row: one fact per member document, in precedence order — the "why". */
    cellFacts = async (tableId: string, cellId: string) =>
        this.unwrap<unknown[]>(await this.api.$get(`${this.base}/${tableId}/cells/${cellId}/facts`));

    // ── runs ─────────────────────────────────────────────────────────────────

    /** What a run would cost, in credits, and how many cells it would start. Charges nothing. */
    previewRun = async (tableId: string, selection?: RunSelection) =>
        this.unwrap<{ cost: number; cells: number; skippedRowIds: string[] }>(
            await this.api.$get(`${this.base}/${tableId}/runs/preview`, {
                query: buildQuery({
                    rowIds: selection?.rowIds,
                    columnIds: selection?.columnIds,
                }),
            }),
        );

    /** Queues the cells and returns immediately. Throws with the API's message on a 402. */
    run = async (tableId: string, selection?: RunSelection) =>
        this.unwrap<RunResult>(
            await this.api.$post(`${this.base}/${tableId}/runs`, { json: (selection ?? {}) as never }),
        );

    /** Runs one column across every row. */
    runColumn = async (tableId: string, columnId: string) =>
        this.unwrap<RunResult>(await this.api.$post(`${this.base}/${tableId}/columns/${columnId}/run`));

    runs = async (tableId: string) =>
        this.unwrap<Run[]>(await this.api.$get(`${this.base}/${tableId}/runs`));

    getRun = async (tableId: string, runId: string) =>
        this.unwrap<Run>(await this.api.$get(`${this.base}/${tableId}/runs/${runId}`));

    /**
     * Stops one run. 409s if it had already finished — a cancel races the thing it cancels, and
     * answering "done" to a request that stopped nothing hides the only fact worth knowing.
     *
     * Cells the run had not reached yet are simply left blank and can be run again; a cell already
     * extracting finishes and bills, because it has already cost the extraction provider. So this
     * means "stop starting new ones", not "stop now".
     */
    cancelRun = async (tableId: string, runId: string) =>
        this.unwrap<Run>(await this.api.$post(`${this.base}/${tableId}/runs/${runId}/cancel`));

    /**
     * Stops every run in flight for a table, and reports how many that was.
     *
     * A table can have several at once — each rerun is its own run, and a standing table's sweep
     * starts one of its own — so "stop this table" is a different request from stopping a run you
     * happen to hold the id of, not a convenience wrapper around it. Cancelling nothing is a
     * success, not an error.
     */
    cancelRuns = async (tableId: string) =>
        this.unwrap<{ canceled: number; runs: Run[] }>(
            await this.api.$post(`${this.base}/${tableId}/runs/cancel`),
        );

    /**
     * Starts a run and polls until it finishes, returning the table's cells.
     *
     * Extraction is asynchronous and per-cell, so without this every caller writes the same poll
     * loop. A run with nothing to do (everything overridden or still ingesting) returns straight
     * away rather than polling a run that was never created.
     */
    runAndWait = async (
        tableId: string,
        selection?: RunSelection,
        opts?: { intervalMs?: number; maxAttempts?: number },
    ) => {
        const started = await this.run(tableId, selection);
        if (!started?.run) return this.cells(tableId);

        const interval = opts?.intervalMs ?? 2_000;
        const maxAttempts = opts?.maxAttempts ?? 150; // ~5 minutes at the default interval

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            await new Promise(resolve => setTimeout(resolve, interval));
            const run = await this.getRun(tableId, started.run.id);
            // CANCELED is terminal too. Without it a cancelled run polls out the full maxAttempts
            // and then throws a timeout — reporting a hang for something that stopped on request.
            if (run?.status === 'SUCCESS' || run?.status === 'ERROR' || run?.status === 'CANCELED') {
                return this.cells(tableId);
            }
        }
        throw new Error(`Run ${started.run.id} did not finish within ${(maxAttempts * interval) / 1000}s`);
    };
}
