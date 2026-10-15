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

describe('compareModels with malformed models', () => {
    const compare = (canon, student) =>
        compareModels({ modelsJSON: [{ id: 'c', ...canon }, { id: 's', ...student }], canonicalId: 'c' }).s;

    it('does not throw on a concept with a missing, null or non-string name', () => {
        const canon = { concepts: [{ id: 'a', name: 'A' }, { id: 'b' }] };
        const student = { concepts: [{ id: 'a', name: 'A' }, { id: 'b', name: null }, { id: 'c', name: 5 }] };
        const result = compare(canon, student);
        expect(result.nodes.present.map(({ id }) => id)).toEqual(['a', 'b']);
        expect(result.nodes.extra.map(({ id }) => id)).toEqual(['c']);
        expect(result.numNodes).toBe(3);
    });

    it('treats relationships: null as no relationships', () => {
        const canon = { concepts: [{ id: 'a', name: 'A', relationships: null }] };
        const student = { concepts: [{ id: 'a', name: 'A', relationships: null }] };
        const result = compare(canon, student);
        expect(result.score).toBe(0);
        expect(result.numRelationships).toBe(0);
    });

    it('treats a missing concepts key on the student as an empty model', () => {
        const result = compare({ concepts: [{ id: 'a', name: 'A' }] }, {});
        expect(result.nodes.missing.map(({ name }) => name)).toEqual(['A']);
        expect(result.nodes.present).toEqual([]);
        expect(result.numNodes).toBe(0);
    });

    it('treats a missing concepts key on the canonical model as an empty model', () => {
        const result = compare({}, { concepts: [{ id: 'a', name: 'A' }] });
        expect(result.nodes.extra.map(({ name }) => name)).toEqual(['A']);
        expect(result.nodes.missing).toEqual([]);
    });
});

describe('compareModels with dangling relationships', () => {
    const compare = (canon, student) =>
        compareModels({ modelsJSON: [{ id: 'c', ...canon }, { id: 's', ...student }], canonicalId: 'c' }).s;

    it('does not match a dangling edge in one model with a dangling edge in the other', () => {
        const canon = { concepts: [concept('a', 'A', [rel('zzz', 1)])] };
        const student = { concepts: [concept('a', 'A', [rel('yyy', 1)])] };
        const result = compare(canon, student);
        expect(result.relationships.correctlySigned).toEqual([]);
        expect(result.relationships.extra).toEqual([]);
        expect(result.relationships.missing).toEqual([]);
        expect(result.score).toBe(0);
    });

    it('does not count a dangling student edge as extra', () => {
        const canon = { concepts: [concept('a', 'A', [rel('b', 1)]), concept('b', 'B')] };
        const student = { concepts: [concept('a', 'A', [rel('b', 1), rel('ghost', 1)]), concept('b', 'B')] };
        const result = compare(canon, student);
        expect(result.relationships.extra).toEqual([]);
        expect(result.score).toBe(1);
    });

    it('does not count a dangling canonical edge as missing', () => {
        const canon = { concepts: [concept('a', 'A', [rel('b', 1), rel('ghost', 1)]), concept('b', 'B')] };
        const student = { concepts: [concept('a', 'A', [rel('b', 1)]), concept('b', 'B')] };
        const result = compare(canon, student);
        expect(result.relationships.missing).toEqual([]);
        expect(result.score).toBe(1);
    });
});

describe('compareModels with duplicate concept names', () => {
    const compare = (canon, student) =>
        compareModels({ modelsJSON: [{ id: 'c', ...canon }, { id: 's', ...student }], canonicalId: 'c' }).s;

    const canonAtoB = { concepts: [concept('a', 'A', [rel('b', 1)]), concept('b', 'B')] };

    it('scores a duplicated student edge once, not once per copy', () => {
        const student = {
            concepts: [concept('a1', 'A', [rel('b', 1)]), concept('a2', 'a ', [rel('b', 1)]), concept('b', 'B')],
        };
        const result = compare(canonAtoB, student);
        expect(result.relationships.correctlySigned).toHaveLength(1);
        expect(result.score).toBe(1);
        expect(result.nodes.present).toHaveLength(3);
    });

    it('lets the first duplicate in model order decide the sign', () => {
        const student = {
            concepts: [concept('a1', 'A', [rel('b', -1)]), concept('a2', 'a ', [rel('b', 1)]), concept('b', 'B')],
        };
        const result = compare(canonAtoB, student);
        expect(result.relationships.correctlySigned).toHaveLength(0);
        expect(result.relationships.incorrectlySigned).toHaveLength(1);
        expect(result.score).toBe(0);
    });

    it('counts a duplicated canonical edge as missing once', () => {
        const canon = {
            concepts: [concept('a1', 'A', [rel('b', 1)]), concept('a2', 'a ', [rel('b', 1)]), concept('b', 'B')],
        };
        const student = { concepts: [concept('a', 'A'), concept('b', 'B')] };
        const result = compare(canon, student);
        expect(result.relationships.missing).toHaveLength(1);
        expect(result.score).toBe(-1);
    });
});

describe('compareModels with structurally broken models', () => {
    const compare = (canon, student) =>
        compareModels({ modelsJSON: [{ id: 'c', ...canon }, { id: 's', ...student }], canonicalId: 'c' }).s;
    const canon = { concepts: [concept('a', 'A', [rel('b', 1)]), concept('b', 'B')] };

    it('ignores null entries in a relationships list', () => {
        const student = { concepts: [concept('a', 'A', [null, rel('b', 1)]), concept('b', 'B')] };
        const result = compare(canon, student);
        expect(result.score).toBe(1);
        expect(result.numRelationships).toBe(1);
    });

    it('ignores null entries in a concepts list', () => {
        const student = { concepts: [null, concept('a', 'A', [rel('b', 1)]), concept('b', 'B')] };
        const result = compare(canon, student);
        expect(result.score).toBe(1);
        expect(result.numNodes).toBe(2);
    });

    it('treats concepts and relationships that are not arrays as empty', () => {
        const student = { concepts: { a: 1 } };
        expect(compare(canon, student).nodes.missing).toHaveLength(2);
        const student2 = { concepts: [{ id: 'a', name: 'A', relationships: { b: 1 } }] };
        expect(compare(canon, student2).relationships.missing).toHaveLength(1);
    });
});

