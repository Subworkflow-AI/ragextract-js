import { describe, test, expect, beforeAll } from 'bun:test';
import { Ragextract } from '../src';
import type { Dataset } from '../src/lib/types';

const { RAGEXTRACT_API_KEY } = process.env;

describe('datasets', () => {
    const subworkfow = new Ragextract({ apiKey: RAGEXTRACT_API_KEY });
    let dataset: Dataset | null;
    beforeAll(async () => {
        const file = Bun.file('./test/assets/small_5.pdf');
        const response = await subworkfow.extract(file,{ fileName: 'small_5.pdf' });
        dataset = response as Dataset;
        if (!dataset.itemCount) throw new Error('Error occurred trying to create dataset');
    },1000 * 30);

    test('datasets.list', async () => {
        const actual = await subworkfow.datasets.list();
        expect(actual?.length).toBeGreaterThan(0);
    });

    test('datasets.get', async () => {
        const actual = await subworkfow.datasets.get(dataset!.id);
        expect(actual?.fileName).toEqual(dataset?.fileName);
        expect(actual?.fileSize).toEqual(dataset?.fileSize);
    });

    test('datasets.vectorize', async () => {
        const job = await subworkfow.datasets.vectorize(dataset!, { async: true });
        await subworkfow.jobs.poll(job!.id,30);
        const expected = await subworkfow.jobs.get(job!.id);
        expect(expected?.type).toBe('datasets/vectorize');
        expect(expected?.status).toBe('SUCCESS');
    },1000 * 60);

    test('datasets.delete', async () => {
        const response = await subworkfow.datasets.delete(dataset!);
        expect((new Date()).getTime()).toBeLessThanOrEqual(Number(response?.expiresAt));
    });

    test('datasets.getItems', async () => {
        const results = await subworkfow.datasets.getItems(dataset!, {
            row: 'jpg',
            cols: [3,4,5],
        });
        expect(results).toHaveLength(3);
    });
});