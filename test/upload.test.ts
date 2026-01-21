import { describe, test, expect } from 'bun:test';
import { Ragextract } from '../src';
import type { Dataset, Job } from '../src/lib/types';

const { RAGEXTRACT_API_KEY } = process.env;

describe('uploads', () => {
    test('extract (file,sync)', async () => {
        const subworkfow = new Ragextract({ apiKey: RAGEXTRACT_API_KEY });
        const file = Bun.file('./test/assets/small_5.pdf');
        const dataset = await subworkfow.extract(file,{ fileName: 'small_5.pdf' });
        expect((dataset as Dataset).itemCount).toEqual(5);
    }, 1000 * 30);

    test('extract (file,async)', async () => {
        const subworkfow = new Ragextract({ apiKey: RAGEXTRACT_API_KEY });
        const file = Bun.file('./test/assets/small_5.pdf');
        const job = await subworkfow.extract(file,{ fileName: 'small_5.pdf', async: true });
        expect((job as Job).type).toEqual('datasets/extract');
    }, 1000 * 30);

    test('extract (url,sync)', async () => {
        const subworkfow = new Ragextract({ apiKey: RAGEXTRACT_API_KEY });
        const dataset = await subworkfow.extract(new URL("https://bitcoin.org/bitcoin.pdf"), { fileName: 'bitcoin.pdf' });
        expect((dataset as Dataset).itemCount).toEqual(9);
    }, 1000 * 30);

    test('vectorize (file,sync)', async () => {
        const subworkfow = new Ragextract({ apiKey: RAGEXTRACT_API_KEY });
        const file = Bun.file('./test/assets/small_5.pdf');
        const dataset = await subworkfow.vectorize(file,{ fileName: 'small_5.pdf', expiresInDays: 1 });
        expect((dataset as Dataset).itemCount).toEqual(5);
    }, 1000 * 30);

    test('vectorize (file,async)', async () => {
        const subworkfow = new Ragextract({ apiKey: RAGEXTRACT_API_KEY });
        const file = Bun.file('./test/assets/small_5.pdf');
        const job = await subworkfow.vectorize(file,{ fileName: 'small_5.pdf', expiresInDays: 1, async: true });
        expect((job as Job).type).toEqual('datasets/extract');
    }, 1000 * 30);
});

describe('upload-session', () => {
    test('mid (164mb)', async () => {
        const subworkfow = new Ragextract({ apiKey: RAGEXTRACT_API_KEY });
        const file = Bun.file('./test/assets/mid_164.pdf');
        const dataset = await subworkfow.extract(file,{ fileName: 'mid_164.pdf' });
        expect((dataset as Dataset).itemCount).toEqual(1447);
    },1000 * 60 * 5);
})