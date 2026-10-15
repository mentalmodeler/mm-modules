import { describe, expect, it } from 'vitest';
import { compareModels } from '../src/compare';
import { concept, rel } from './fixtures';

const canonical = {
    id: 'c',
    concepts: [concept('w', 'Water', [rel('f', 1)]), concept('f', 'Fish', [rel('b', 1)]), concept('b', 'Birds')],
};

const run = (student) => compareModels({ modelsJSON: [canonical, student], canonicalId: 'c' })[student.id];

describe('compareModels', () => {
    it('matches concepts by normalized name (case and stray whitespace), not by id', () => {
        const student = {
            id: 's',
            concepts: [
                concept('s1', ' water ', [rel('s2', 0.5)]),
                concept('s2', 'FISH', [rel('s3', -1)]),
                concept('s3', 'Birds'),
                concept('s4', 'Algae', [rel('s2', 1)]),
            ],
        };
        const result = run(student);
        expect(result.nodes.extra.map(({ name }) => name)).toEqual(['Algae']);
        expect(result.nodes.missing).toEqual([]);
        expect(result.nodes.present).toHaveLength(3);
        expect(result.relationships.extra.map(({ fromNode }) => fromNode.name)).toEqual(['Algae']);
        expect(result.relationships.missing).toEqual([]);
        expect(result.relationships.correctlySigned).toHaveLength(1);
        expect(result.relationships.incorrectlySigned).toHaveLength(1);
        expect(result.score).toBe(0);
        expect(result.numNodes).toBe(4);
    });

    it('does not confuse "ab"->"c" with "a"->"bc"', () => {
        const left = { id: 'c', concepts: [concept('1', 'ab', [rel('2', 1)]), concept('2', 'c')] };
        const right = { id: 's', concepts: [concept('1', 'a', [rel('2', 1)]), concept('2', 'bc')] };
        const result = compareModels({ modelsJSON: [left, right], canonicalId: 'c' }).s;
        expect(result.relationships.extra).toHaveLength(1);
        expect(result.relationships.missing).toHaveLength(1);
    });

    it('treats an edge drawn the wrong way round as reversed, not extra + missing', () => {
        const canon = { id: 'c', concepts: [concept('a', 'A', [rel('b', 1)]), concept('b', 'B')] };
        const student = { id: 's', concepts: [concept('a', 'A'), concept('b', 'B', [rel('a', 1)])] };
        const result = compareModels({ modelsJSON: [canon, student], canonicalId: 'c' }).s;
        expect(result.relationships.reversed).toHaveLength(1);
        expect(result.relationships.extra).toEqual([]);
        expect(result.relationships.missing).toEqual([]);
        expect(result.score).toBe(-1);
    });

    it('judges sign on numeric value: same sign is correct, a zero (or blank) matches a zero, anything else is not', () => {
        const targets = ['B', 'C', 'D', 'E', 'F'];
        const targetConcepts = () => targets.map((name) => concept(name.toLowerCase(), name));
        const canon = {
            id: 'c',
            concepts: [
                concept('a', 'A', [rel('b', 1), rel('c', 1), rel('d', 0), rel('e', 0), rel('f', 1)]),
                ...targetConcepts(),
            ],
        };
        const student = {
            id: 's',
            concepts: [
                // B: 0.5 vs 1 -> same sign; C: -1 vs 1 -> opposite; D: 0 vs 0 -> both zero;
                // E: blank vs 0 -> both zero (a connection with no value is a zero); F: 0 vs 1 -> mismatch
                concept('a', 'A', [rel('b', 0.5), rel('c', -1), rel('d', 0), rel('e', ''), rel('f', 0)]),
                ...targetConcepts(),
            ],
        };
        const result = compareModels({ modelsJSON: [canon, student], canonicalId: 'c' }).s;
        expect(result.relationships.correctlySigned.map(({ toNode }) => toNode.name)).toEqual(['B', 'D', 'E']);
        expect(result.relationships.incorrectlySigned.map(({ toNode }) => toNode.name)).toEqual(['C', 'F']);
        expect(result.score).toBe(3);
    });

    it('does not throw when concepts have no relationships key (as produced by XML parsing)', () => {
        const canon = { id: 'c', concepts: [{ id: 'a', name: 'A' }] };
        const student = { id: 's', concepts: [{ id: 'a', name: 'A' }] };
        const result = compareModels({ modelsJSON: [canon, student], canonicalId: 'c' }).s;
        expect(result.score).toBe(0);
        expect(result.nodes.present).toHaveLength(1);
    });
});
