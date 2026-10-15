import { describe, expect, it } from 'vitest';
import { getConceptsWithMetrics, getMetrics } from '../src/metrics';
import { concept, rel } from './fixtures';

const model = {
    concepts: [
        concept('a', 'A', [rel('b', 1), rel('c', -0.5)]),
        concept('b', 'B', [rel('c', 0.5)]),
        concept('c', 'C'),
    ],
};

describe('getConceptsWithMetrics', () => {
    it('annotates every concept with degrees, centrality and type', () => {
        const byId = Object.fromEntries(getConceptsWithMetrics(model).map((c) => [c.id, c]));
        expect(byId.a).toMatchObject({ indegree: 0, outdegree: 1.5, centrality: 1.5, type: 'driver' });
        expect(byId.b).toMatchObject({ indegree: 1, outdegree: 0.5, centrality: 1.5, type: 'ordinary' });
        expect(byId.c).toMatchObject({ indegree: 1, outdegree: 0, centrality: 1, type: 'receiver' });
    });
});

describe('getMetrics', () => {
    it('summarises structure', () => {
        expect(getMetrics(model)).toMatchObject({
            numNodes: 3,
            numRelationships: 3,
            numDrivers: 1,
            numReceivers: 1,
            numOrdinary: 1,
            density: 0.5,
            relationshipsPerNode: 1,
            complexity: 1,
        });
    });

    it('computes each ranking independently of the others (ties keep model order)', () => {
        const result = getMetrics(model);
        expect(result.driversRanked.map(({ id }) => id)).toEqual(['a', 'b', 'c']);
        expect(result.receiversRanked.map(({ id }) => id)).toEqual(['b', 'c', 'a']);
        expect(result.centralityRanked.map(({ id }) => id)).toEqual(['a', 'b', 'c']);
    });

    it('returns 0, not NaN, for density and relationships-per-node on tiny models', () => {
        [{ concepts: [] }, { concepts: [concept('a', 'A')] }].forEach((tiny) => {
            const { density, relationshipsPerNode } = getMetrics(tiny);
            expect(density).toBe(0);
            expect(relationshipsPerNode).toBe(0);
        });
    });
});
