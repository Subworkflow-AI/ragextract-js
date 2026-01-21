import { describe, test, expect, beforeAll } from 'bun:test';
import { Ragextract } from '../src';

const { RAGEXTRACT_API_KEY } = process.env;

describe('search', () => {
    const subworkfow = new Ragextract({ apiKey: RAGEXTRACT_API_KEY });
    
    test('search', async () => {
        const jobs = await subworkfow.jobs.list({ statuses: 'SUCCESS' });
        const vectorizeJob = jobs?.find(job => job.type === 'datasets/vectorize' && job.status === 'SUCCESS');
        if (!vectorizeJob) throw new Error('No available vectorized dataset to test against.');

        const results = await subworkfow.search({
            query: 'what is 4?',
            datasets: [vectorizeJob.datasetId],
        });
        expect(results).toHaveLength(5);
        expect(results?.filter(item => item.col === 4).length).toBeGreaterThan(0);
    });
});