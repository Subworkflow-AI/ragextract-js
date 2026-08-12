<h3 align="center">
  <a name="readme-top"></a>
    <img
        src="https://cdn.subworkflow.ai/marketing/ragextract_logo_241x60.png"
    />
</h3>
<h4 align="center" style="font-family:monospace">OPTIMISE LONG DOCUMENT EXTRACTION</h4>
<div align="center">
    <a href="https://www.linkedin.com/company/subworkflow-ai">
        <img src="https://img.shields.io/badge/Follow%20on%20LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white" alt="Follow on LinkedIn" />
    </a>
    <a href="https://twitter.com/subworkflow">
        <img src="https://img.shields.io/badge/Follow%20on%20X-000000?style=for-the-badge&logo=x&logoColor=white" alt="Follow on X" />
    </a>
    <a href="https://discord.gg/RCHeCPJnYw">
        <img src="https://img.shields.io/badge/Community%20Support%20-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Need Support?" />
    </a>
</div>

# Ragextract-JS <img src="https://cdn.subworkflow.ai/marketing/logo-blue-32x32.png" height="24"/>

The **Ragextract-JS** library is the official client/server-side javascript sdk for the [Ragextract API](https://subworkflow.ai/ragextract) written in Typescript.

Note: This sdk is not intended to be used in the browser and doing so may expose your API key to unauthorized use.

Please use this project's [issue tracker](https://github.com/Subworkflow-AI/ragextract-js/issues) for any issues and/or support relating to this library. You can also reach out to the team on [our Discord server](https://discord.gg/RCHeCPJnYw).

## What is Ragextract?

Ragextract is a RAG backend API designed and built to handle document RAG with long and/or large documents; where large documents are typically scanned PDFs, 1000+ pages, 300mb+ or a combination thereof. 

Ragextract is able to split, convert, index, store and vectorize these documents and provide a simple API to access, filter and search the resulting pages of one or more documents uploaded to the service. The goal is reduce LLM OCR parsing costs by allowing a robust search and retrieval API for documents.

Learn more by visiting our website at [https://subworkflow.ai/ragextract](https://subworkflow.ai/ragextract).

## Installation

```
npm i --save @subworkflow/ragextract
```

## Usage

Initialise the client from `@subworkflow/ragextract` with your API key.

```typescript
import { Ragextract } from '@subworkflow/ragextract';

const ragextract = new Ragextract({
    apiKey: '$RAGEXTRACT_API_KEY'
});
```

### Two kinds of key, and what each one gets you

**The SDK picks its API version from the key's prefix.** You do not configure it.

| Key | API | Scope |
| --- | --- | --- |
| `psk_…` **personal key** | v2 | every workspace you can reach — files, tables, bundles, jobs, search |
| `sk_…` workspace key | v1 | the one workspace it belongs to — files and search only |

Personal keys are created in **Settings → API keys** and are the recommended choice. Workspace keys
keep working exactly as before; v1 is frozen, not deprecated.

A personal key can be narrowed to specific workspaces and tables, with read or read-write on each.
An unscoped key does everything you can do, and follows your permissions if they change.

### v2: working inside a workspace

Every v2 call happens inside a workspace, so name it once and hold on to the handle.

```typescript
// Which workspaces can this key reach, and at what level?
const workspaces = await ragextract.workspaces.list();

const ws = ragextract.workspace(workspaces[0].id);

// Upload and ingest. Large files switch to a multipart session automatically.
const file = await ws.files.upload(new URL('https://example.com/contract.pdf'));

// Extract structured columns across those files.
const table = await ws.tables.create({ name: 'Contracts' });
await ws.tables.addColumn(table.id, {
    name: 'Notice period',
    prompt: 'What notice period does this contract require?',
    outputType: 'text_quote',
});
await ws.tables.addRow(table.id, { type: 'file', id: file.id });

// See what a run costs before spending anything.
const { cost } = await ws.tables.previewRun(table.id);

// Run it and wait for every cell.
const cells = await ws.tables.runAndWait(table.id);

// Or search across the workspace instead.
const matches = await ws.search({ query: 'termination clause', limit: 5 });
```

Group several files into one row — a master contract and its amendments — with a bundle:

```typescript
const bundle = await ws.bundles.create({ name: 'Acme MSA', fileIds: [master.id] });
await ws.bundles.addFiles(bundle.id, [amendment.id], { role: 'amendment', effectiveAt: Date.now() });
await ws.tables.addRow(table.id, { type: 'bundle', id: bundle.id });
```

### Migrating from v1

Mint a personal key and drop it in — the SDK routes on the prefix, so nothing else has to change to
reach v2. Then, at your own pace: `datasets` becomes `ws.files`, `datasetId` becomes `fileId`, and
`extract`/`vectorize` become the single `ws.files.upload(...)`.

To try v2 with your existing workspace key, pass `apiVersion: 'v2'`; it works, pinned to that one
workspace.

### Handling errors

Failed requests throw a `RagextractApiError` carrying the HTTP `status` and the parsed response
`body`, so you can branch on the code instead of matching on message text.

```typescript
import { Ragextract, RagextractApiError } from '@subworkflow/ragextract';

try {
    const dataset = await ragextract.extract(fileBuffer, { fileName: 'report.pdf' });
} catch (e) {
    if (e instanceof RagextractApiError) {
        if (e.isInsufficientCredits) return topUpAndRetry();  // 402
        if (e.isCapExceeded) return queueForLater();          // 403 — e.g. job concurrency
        if (e.isUnauthorized) throw new Error('Check your API key');  // 401
    }
    throw e;
}
```

Under credit billing, **402 is an ordinary operating state** rather than a bug — worth handling
explicitly.

`429` responses are retried automatically with exponential backoff and only surface once the
attempts are exhausted. This matters for large uploads: the API allows 15 writes per minute and
every multipart part is a write, so a large file *will* be throttled part-way through and the
retries are what carry it to completion. Tune with `maxRetries` (default 10, `1` to disable):

```typescript
const ragextract = new Ragextract({ apiKey: '...', maxRetries: 1 });
```

### 1. Extract & Query Usage
Uploads a document and allows fetching any page or any range of pages in both pdf and jpg formats. Great for use-cases such as Structured Outputs (extracting properties) or Grounding (showing source of LLM's answers).
```typescript
import * as fs from 'fs';
const fileBuffer = fs.readFileSync('/path/to/file.pdf');

// 1. upload a file to get its dataset
const dataset = await ragextract.extract(fileBuffer);

// 2. retrieve a selection of pages from dataset
const results = await ragextract.datasets.getItems(dataset, {
    row: 'jpg',
    cols: [1,2,3], // omit to retrieve all
    offset: 0,
    limit: 10
});

// 3. use the selection of pages in your favourite LLM
import OpenAI from "openai";
const openai = new OpenAI();

const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: [{
        role: "user",
        content: [
            { type: "input_text", text: "Please classify these pages." },
            ...results.map(datasetItem => ({
                type: "input_image",
                image_url: datasetItem.share.url
            })
        ]
    }]
});

console.log(response.output_text);
```

### Vectorize & Search Usage
```typescript
import * as fs from 'fs';
const fileBuffer = fs.readFileSync('/path/to/file.pdf');

// 1. upload a file to get its dataset
// alternatively, use `await datasets.vectorize();` if dataset is alrady extracted
const dataset = await ragextract.vectorize(fileBuffer);

// 2. query the document contextually to return matching pages
const results = await ragextract.search({
    datasets: [dataset],
    query: {
        "text": "Can you find this symbol in the document?",
        "image_url": "https://www.food.gov.uk/sites/default/files/styles/promo_large/public/media/image/food-hygiene-Rating%205_a_preview.jpeg"
    },
    offset: 0,
    limit: 10
});

// 3. Use your fave LLM to generate an answer
import OpenAI from "openai";
const openai = new OpenAI();

const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: [{
        role: "user",
        content: [
            {
                type: "input_text",
                text: "Summarize the procedures and penalties for early lease termination from these pages."
            },
            ...results.map(datasetItem => ({
                type: "input_image",
                image_url: datasetItem.share.url
            })
        ]
    }]
});

console.log(response.output_text);
console.log(`Pages cited for this answer are: ${results.map(datasetItem => datasetItem.col).join(',)}`)
```

## API Reference

### Extract
```typescript
.extract(
    input: Blob | URL,
    opts: {
        fileName: string;
        async?: boolean; 
        expiresInDays?: number;
        chunkSize?: number; 
        concurrency?: number;
    }
): Promise<Dataset | Job>
```
* Unless `async` is set to true, this function will perform polling on the `job` record automatically
* For files over 100mb, this function automatically switches to Multipart Upload mode.
* API reference: https://docs.subworkflow.ai/api-reference/post-v1-extract

**Params**:
 * **input** (Blob) - *Required*. the document file or URL to upload and extract. If URL, it must be publicly accessible.
 * **opts.fileName** (boolean) - *Required*. Sets the filename for the uploaded file.
 * **opts.async?** (boolean) - *Optional*. Set to true to skip auto-polling for job completion and receive the job record instead. Defaults to false.
 * **opts.expiresInDays?** (number) - *Optional*. Overrides the number of days before file expiration. Default is maximum data rentention value for your subscription.
 * **opts.chunkSize?** (number) - *Optional*. MultipartUpload only. Sets the part size for splitting. Defaults to 10mb.
 * **opts.concurrency?** (number) - *Optional*. MultipartUpload only. Sets how many part uploads execute simultaneously. Defaults to 4.

**Returns** either a `Dataset` or `Job`:
 * `Promise<Dataset>` (Dataset) - The dataset object, when `opts.async=false`.
 * `Promise<Job>` (Job) - The job object, when `opts.async=true`

When a `Job` is returned, you'll have to check the job status for the dataset manually.

### Vectorize
```typescript
.vectorize(
    input: Blob | URL,
    opts: {
        fileName: string;
        async?: boolean; 
        expiresInDays?: number;
        chunkSize?: number; 
        concurrency?: number;
    }
): Promise<Dataset | Job>
```
* Unless `async` is set to true, this function will perform polling on the `job` record automatically.
* For files over 100mb, this function automatically switches to Multipart Upload mode.
* Api Reference: https://docs.subworkflow.ai/api-reference/post-v1-vectorize

**Params**:
 * **input** (blob) - *Required*. the document file or url to upload and vectorize. If URL, must be publicly accessible.
 * **opts.fileName** (boolean) - *Required*. Sets the filename for the uploaded file.
 * **opts.async?** (boolean) - *Optional*. Set to true to skip auto-polling for job completion and receive the job record instead. Defaults to false.
 * **opts.expiresInDays?** (number) - *Optional*. Overrides the number of days before file expiration. Default is maximum data rentention value for your subscription.
 * **opts.chunkSize?** (number) - *Optional*. MultipartUpload only. Sets the part size for splitting. Defaults to 10mb.
 * **opts.concurrency?** (number) - *Optional*. MultipartUpload only. Sets how many part uploads execute simultaneously. Defaults to 4.

**Returns** either a `Dataset` or `Job`:
 * `Promise<Dataset>` (Dataset) - The dataset object, when `opts.async=false`.
 * `Promise<Job>` (Job) - The job object, when `opts.async=true`

When a `Job` is returned, you'll have to check the job status for the dataset manually.

### Datasets List
```typescript
.datasets.list(
    opts?: {
        types?: "doc" | "audio" | "video" | "image";
        sort?: string | string[];
        offset?: number;
        limit?: number;
        expiresInSeconds?: number;
    }
): Promise<Dataset[]>;
```
* List all available Datasets (documents) in current workspace

**Params**:
 * **opts?.types** (string) - *optional*. Filter by dataset type: `doc`, `audio`, `video` or `image`. Omit to return every type. One value only — the API rejects a comma-separated list.
 * **opts?.sort?** (string | string[]) - *optional*. Dataset property to sort results by, prepend `-` for desc order eg. `createdAt` for createdAt asc and `-createdAt` for createdAt desc. default is `createdAt` descending.
 * **opts.offset?** (number) - *optional*.  default is 0.
 * **opts.limit?** (number) - *optional*. Max 100. default is 10.
 * **opts.expiresInSeconds?** (number) - *optional*. Overrides the expiration duration for the file share. default is 10 mins.

**Returns**
* `Array<Dataset>` (Dataset[]) - An array of matching Dataset objects.

### Datasets Get
```typescript
.datasets.get(datasetId: string): Promise<Dataset | null>
```
* Returns a single dataset by Id

**Params**:
 * **datasetId** (string) - *Required*. the datasetId of the requested dataset

**Returns**
* `Dataset` (Dataset) - The dataset object.

### Datasets Delete
```typescript
.datasets.delete(dataset: Dataset | Dataset[] | string | string[]): Promise<boolean | null>
```
* Deletes one or more datasets.
* Due to firing off multiple async "delete" jobs, it's not possible to await until all deletes have completed. If you need to wait, use the jobs list endpoint to check on progress of the jobs.
* Api Reference: https://docs.subworkflow.ai/api-reference/delete-v1-datasets

**Params**:
  * **dataset** (Dataset | Dataset[] | string | string[]) - *Required*. One or more dataset object or the dataset ID of the requested dataset

**Returns**
* `Boolean` - always true if successful.

### Dataset Vectorize
```typescript
.datasets.vectorize(
    dataset: Dataset | string,
    opts?: {
        async?: boolean;
    }
): Promise<Dataset | Job>
```
* Triggers a `Vectorize` job for the dataset only if a previous `vectorize` job doesn't exist.
* Unless `async` is set to true, this function will perform polling on the `job` record automatically.
* Api Reference: https://docs.subworkflow.ai/api-reference/get-v1-datasets-id-vectorize

**Params**:
 * **dataset** (Dataset | string) - *Required*. A dataset object or the datasetId of the requested dataset
* **opts?.async?** (boolean) - *Optional*. Set to true to skip auto-polling for job completion and receive the job record instead. Defaults to false.
 
**Returns** either a `Dataset` or `Job`:
 * `Promise<Dataset>` (Dataset) - The dataset object, when `opts.async=false`.
 * `Promise<Job>` (Job) - The job object, when `opts.async=true`

When a `Job` is returned, you'll have to check the job status for the dataset manually.

### Datasets Get Items
```typescript
.datasets.getItems(
    dataset: Dataset | string,
    opts?: {
        row?: string;
        cols?: string | string[];
        sort?: string | string[];
        offset?: number;
        limit?: number;
        expiresInSeconds?: number;
    }
): Promise<DatasetItem[]>;
```
* Filters DatasetItems (pages) from a dataset.

**Params**:
 * **dataset** (Dataset | string) - *Required*. A dataset object or the datasetId of the requested dataset
 * **opts.row?** (string) - *optional*. The format of the page. Either "pdf", "image" or "embedding_image"
 * **opts.cols?** (string | string[]) - *optional*. Page number or range of page numbers inclusive. eg. `1,2,3` or `1:3` are equivalent. default is all cols are included.
 * **opts.sort?** (string | string[]) - *optional*. DatasetItem property to sort results by, prepend `-` for desc order eg. `createdAt` for createdAt asc and `-createdAt` for createdAt desc. default is `createdAt` descending.
 * **opts.offset?** (number) - *optional*.  default is 0.
 * **opts.limit?** (number) - *optional*. Max 100. default is 10.
 * **opts.expiresInSeconds?** (number) - *optional*. Overrides the expiration duration for the file share. default is 10 mins.

**Returns**
* `Array<DatasetItem>` (DatasetItem[]) - An array of matching DatasetItem objects.

### Search
```typescript
.search({
    query: string | { text: string; image_url?: string; };
    datasets: Dataset | Dataset[] | string | string[];
    limit?: number;
    expiresInSeconds?: number;
});
```
* Requires `/vectorize` job executed on dataset prior to search being enabled
* Performs text and/or image search over vector store and returns matching pages
* Unless one or more `datasets` is set, searches over all datasets in vector store.

**Params**:
* **query** (string | { text: string; image_url?: string }) - *Required*. The search terms to query for. Can be either text or text and image. When searching with image, image can be publicly accessible image url or base64 string.
 * **datasets** (Dataset[] | string[]) - *Optional*. filters the search to one or more datasets. Accepts Dataset objects and/or Dataset Ids. Default is all datasets included in search.
 * **limit?** (number) - *optional*. default is 10. Max 100.

 > `sort` and `offset` are not accepted by `/search`. Results come back ranked by relevance, which
 > is the only ordering a vector search has.
 * **expiresInSeconds?** (number) - *optional*. Overrides the expiration duration for the file share. default is 10 mins.

**Returns**
* `Array<DatasetItem>` (DatasetItem[]) - An array of matching datasetItem objects.

### Job Get
```typescript
.jobs.get(jobId: string): Promise<Job | null>
```
**Params**
* **jobId** (string) - *Required*. The ID of the job to retrieve.

**Returns**
* `Job` (Job) - a Job object

### Job Cancel
```typescript
jobs.cancel(jobId: string): Promise<job | null>
```
* Cancels a non-completed job. You can only cancel jobs which are in the "NOT_STARTED" and "IN_PROGRESS" states.

**Params**
* **jobId** (string) - *Required*. The ID of the job to retrieve.

**Returns**
* `Job` (Job) - a Job object

### Jobs List
```typescript
.jobs.list(opts?: {
    statuses?: string | string[];
    offset?: number;
    limit?: number;
})
```
* Returns new and existing jobs only within the last 24hrs. Older jobs are available if retrieved by ID.
* Orderd by creation time descending.

**Params**:
 * **statuses** (string | string[]) - *Optional*. filters results by job status. Available statuses are `NOT_STARTED`, `IN_QUEUE`, `IN_PROGRESS`, `SUCCESS`, `ERROR`. Default is all statuses.
 * **offset?** (number) - *optional*. default is 0.

 > `types` is not accepted by `/jobs`; it was documented and sent, but the API stripped it and
 > returned every type. Filter client-side on `job.type` until the endpoint supports it.
 * **limit?** (number) - *optional*. default is 10. Max 100.

**Returns**
* `Array<Job>` (Job[]) - an array of viewable jobs

## Licence

This project repository is licensed under the MIT License (See LICENSE file). Some dependencies may contain a different license so please refer to the relevant repositories for specific licences.

2026 &copy; Subworkflow AI Limited.