import { describe, expect, it } from 'vitest';
import { getWeightMatrix, runScenario } from '../src/scenario';
import { concept, rel } from './fixtures';

describe('getWeightMatrix', () => {
    it("puts each concept's outgoing influences in its own row, as numbers", () => {
        const concepts = [concept('a', 'A', [rel('b', '0.5')]), concept('b', 'B')];
        expect(getWeightMatrix(concepts)).toEqual([
            [0, 0.5],
            [0, 0],
        ]);
    });

    it('treats a concept with no relationships key as a row of zeros', () => {
        const concepts = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
        expect(getWeightMatrix(concepts)).toEqual([
            [0, 0],
            [0, 0],
        ]);
    });
});

describe('runScenario', () => {
    const cyclic = {
        concepts: [concept('a', 'A', [rel('b', 1)]), concept('b', 'B', [rel('a', -1)]), concept('c', 'C')],
    };

    it('returns a zero delta for every concept when nothing is clamped', () => {
        const result = runScenario(cyclic, { concepts: [] });
        expect(result.map(({ id }) => id)).toEqual(['a', 'b', 'c']);
        result.forEach(({ influence }) => expect(influence).toBeCloseTo(0, 10));
    });

    it('excludes clamped concepts, and treats an influence of 0 as "not clamped"', () => {
        const scenario = { concepts: [{ influence: 1 }, { influence: 0 }, { influence: 0 }] };
        expect(runScenario(cyclic, scenario).map(({ id }) => id)).toEqual(['b', 'c']);
    });

    it('excludes by position, not name, when two concepts share a name', () => {
        const model = { concepts: [concept('x1', 'X'), concept('x2', 'X')] };
        const scenario = { concepts: [{ influence: 1 }, { influence: 0 }] };
        expect(runScenario(model, scenario).map(({ id }) => id)).toEqual(['x2']);
    });

    it('labels each result with the concept id and name', () => {
        const [first] = runScenario(cyclic, { concepts: [{ influence: 1 }, { influence: 0 }, { influence: 0 }] });
        expect(first).toMatchObject({ id: 'b', name: 'B' });
        expect(typeof first.influence).toBe('number');
    });
});
