import { describe, test, expect } from 'bun:test';
import { Ragextract } from '../src';

const { RAGEXTRACT_API_KEY } = process.env;

describe('jobs', () => {
    const subworkfow = new Ragextract({ apiKey: RAGEXTRACT_API_KEY });

    test('jobs.list', async () => {
        const actual = await subworkfow.jobs.list();
        expect(actual?.length).toBeGreaterThan(0);
    });
});