# Changelog

## 0.2.1 (2026-09-28)

A patch: everything below is additive. Under 0.x only a breaking change goes in the minor.

### `tables.query()` — which rows match, free

`ws.tables.query(tableId, { where, select, sort, limit, offset, citations })` calls the new
`POST /v2/…/tables/:tableId/query`. It filters a table's rows on the app's own filter rules and
calls no AI, so it costs nothing. Conditions are ANDed; each names a column by id or name and an
operator its type offers (`TableQueryOperator` lists them). Dates are absolute `YYYY-MM-DD`.

**Read `undetermined` before you count.** A row whose cell never ran, errored or found nothing is
neither matched nor ruled out. It is counted with the reason and listed in `undeterminedRows`, not
silently dropped, so "three venues qualify" does not quietly mean "three, plus two we know nothing
about". Each returned cell's `value` is what a person sees, so a human correction wins; `overridden`
says which. Each cell also carries the pages it cites.

### `tables.stats()`, and query warnings

`ws.tables.stats(tableId)` returns per-column counts over the whole table: filled, no answer,
errored, not extracted, pending, stale, overridden; min/max for numbers and dates; and for a
category or list column **every value it holds with its row count**. Those are the exact strings
`query()`'s `is_any_of` compares against. Read them before filtering on a category.

`query()` results gain `warnings`: a set condition naming a value the column never holds (`'MSc'` of
a column that says `'Masters'`) is named, with the values the column does hold, instead of quietly
returning fewer rows.

### Fixed: what an image cell's value looks like

`CellValue`'s comment said an image column answers with a bare `ImageRegion[]`. Reads have always
returned `{ type, value }` with the regions as `value`, which is what the extraction engine writes.
The comment now says so. `setOverride` still accepts the bare array on an image column. Before
2026-09-27 the API stored it as sent, and the app read that override as **empty**; the API now wraps
it. Overrides set that way before then may need setting again.

## 0.2.0 (2026-09-02)

A minor rather than a patch: the `creditRate` range below is a breaking change, and under 0.x that
goes in the minor.

### The v2 API, routed by your key

**A `psk_` personal key now reaches `/v2`; anything else stays on `/v1`.** The prefix is contract
rather than a heuristic — it is minted in `ragextract-web` and branched on in `ragextract-api` — so
pasting a personal key into existing code reaches the right API without changing a line. Override
with `apiVersion` if you need to; the one useful case is `'v2'` with a workspace (`sk_`) key, which
`/v2` accepts pinned to the one workspace it belongs to.

A personal key with `apiVersion: 'v1'` throws at construction rather than 401-ing at the edge. `/v1`
has no workspace parameter, so there is nothing it could do, and the 401 would send you looking at a
key that is perfectly valid.

Every `/v2` route nests under a workspace, so rather than making the id the first argument of every
call there is a handle:

```ts
const ragextract = new Ragextract({ apiKey: process.env.RAGEXTRACT_API_KEY });
const ws = ragextract.workspace('wks_…');   // .files .tables .bundles .jobs .search()
```

Handles are cached per id, so a loop does not rebuild four API objects each time and
`ws === ragextract.workspace(id)` holds.

- **`ragextract.workspaces`** — `list`, `get`, `create`, `rename`. Discovery of what the key reaches
  and at what level.
- **`ws.files`** — `upload`, `uploadLarge`, `list`, `get`, `delete`, `items`, `item`, `share`.
  `upload()` takes a `Blob`, `File`, `URL` or URL string and is the whole ingest surface: it
  switches to a multipart session above **100 MB** without the caller choosing, waits for the job
  and returns the file. Pass `async: true` to get the `Job` back immediately and poll it yourself,
  which is the right choice for anything large enough that holding a connection open is
  unreasonable.
- **`ws.tables`** — `create`, `addColumn`, `addRow`, `columns`, `rows`, `cells`, `updateColumn`,
  `deleteColumn`, `deleteRow`, `setOverride`, `clearOverride`, `cellEvents`, `cellFacts`.
- **`ws.tables.previewRun()` / `run()` / `runAndWait()` / `runColumn()` / `runs()` / `getRun()`.**
  `previewRun()` prices exactly the cells a run would create, so the quote and the charge agree.
  `runAndWait()` polls a run to completion, because extraction is asynchronous and per-cell and
  every caller was otherwise writing the same loop.
- **`ws.bundles`** — `list`, `get`, `create`, `update`, `delete`, `addFiles`, `updateFile`,
  `removeFile`. Group a contract and its amendments so they answer as one row.
- **`ws.jobs`** — `list`, `get`, `cancel`, `poll`.
- **`ws.search()`** — semantic search across the workspace's pages. Note this one spends credits.

`/v1` is untouched: same classes, same names, same behaviour. `datasets` stays as v1's word for what
v2 calls files — renaming a live API's client is not a kindness.

### Typed cell payloads, and image regions

`value`, `citations` and `humanOverride` were `string | null` — raw JSON you had to parse with
nothing describing what was inside. They are typed now, matching what `/v2` returns.

`ImageRegion` is the value of an `image` / `image_list` column: `{ fileId, page, box, caption }`,
with `box` as `[xmin, ymin, xmax, ymax]` in 0–1 fractions of the page image and `null` meaning the
whole page. Fractions rather than pixels is what lets a box located against the page image the model
saw map unchanged onto a higher-DPI render of the same page.

**Nothing materialises a cropped bitmap anywhere in the pipeline, so the region _is_ the answer** —
`ws.files.item(fileId, itemId)` gets the page and you crop.

`setOverride` now takes the value itself rather than a JSON string, which is what the endpoint
accepts. `OutputType` gains `image` / `image_list`; `FileType` gains `image_list`.

### Run cancellation

`ws.tables.cancelRun(tableId, runId)` and `ws.tables.cancelRuns(tableId)`. The second is not a
convenience wrapper around the first: a table can have several runs in flight at once, so "stop this
table" is a different request from stopping a run whose id you hold.

**Fixed:** `runAndWait()` polled for `SUCCESS` or `ERROR` only, so a cancelled run polled out all
150 attempts and then threw a timeout — reporting a hang for something that stopped on request.
`CANCELED` is now terminal. `RunStatus` is `Run`'s own union rather than a widened `JobStatus`,
because a dataset job cannot reach `CANCELED` (`jobs.cancel` lands it on `ERROR`).

### Packaging — the package is importable from Node again

**`main` and `exports` were both missing.** Node ignores `module`, which is a bundler convention, so
`import '@subworkflow/ragextract'` resolved to `<pkg>/index.js`, which does not exist, and threw
`ERR_MODULE_NOT_FOUND`. This affected **0.1.1 and every version before it**; bundlers (Vite,
webpack, Rollup) and Bun were unaffected, because they honour `module`. If you were reaching for a
bundler alias or a deep `dist/` import to work around this, you can stop.

**The build now actually runs before a publish.** The hook was named `prepublish`, which npm has not
run on publish since npm 5, so what shipped was whatever happened to be sitting in `dist/`. It is
`prepublishOnly` now. The `publish` script was renamed to `release:npm` — `publish` is itself an npm
lifecycle script that runs *after* a successful publish, so a script of that name calling
`npm publish` re-enters it.

### Breaking — credit redenomination (2026-08-17)

**A credit is now $0.0025 rather than $0.01.** Every credit-denominated number returned by the API
is 4× what it was; the dollar prices behind them are unchanged, apart from ingest, which got 4×
cheaper. One page of ingest now costs exactly one credit.

Most of this needs no code change — the values you read are simply larger. Two things do:

- **`createColumn`/`updateColumn` reject the old `creditRate` range.** Valid values are now **4–40**
  (previously 1–10), and the API returns **400** for anything below 4. Code that passed
  `creditRate: 1` to mean "the default" must either pass `4` or, better, **omit the field** and let
  the server apply its own default.
- **Anything comparing a balance or cost against a hardcoded threshold** is now comparing against a
  number 4× larger. A client that warned below "100 credits" is warning at a quarter of the money it
  used to.

Unchanged: the shape of every response, `previewRun()`'s contract (it still prices exactly the cells
a run would create), and 402 remaining an ordinary operating state rather than an error.

Reference: `../ragextract-docs/business/pricing-and-costs.md` §2a.
