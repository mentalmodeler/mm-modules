import { describe, expect, it, vi } from 'vitest';
import { converge, getWeightMatrix, runScenario, sigm, tanh } from '../src/scenario';
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

describe('runScenario convergence', () => {
    it('returns instead of looping forever on a tanh feedback loop that does not settle', () => {
        const model = { concepts: [concept('a', 'A', [rel('b', 1)]), concept('b', 'B', [rel('a', -1)])] };
        const result = runScenario(model, { concepts: [] }, tanh);
        expect(result).toHaveLength(2);
        result.forEach(({ influence }) => expect(Number.isFinite(influence)).toBe(true));
    });
});

describe('blank influences', () => {
    it('reads a blank or missing influence as a weight of 0, not NaN', () => {
        const concepts = [
            concept('a', 'A', [rel('b', ''), { id: 'c' }]),
            concept('b', 'B'),
            concept('c', 'C'),
        ];
        expect(getWeightMatrix(concepts)).toEqual([
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
        ]);
    });

    it('still returns finite results when one relationship has no value', () => {
        const model = { concepts: [concept('a', 'A', [rel('b', '')]), concept('b', 'B', [rel('a', 1)])] };
        const result = runScenario(model, { concepts: [{ influence: '' }, { influence: 1 }] });
        result.forEach(({ influence }) => expect(Number.isFinite(influence)).toBe(true));
    });
});

describe('runScenario direction of influence', () => {
    // a -> b with weight 1: a influences b.
    const chain = { concepts: [concept('a', 'A', [rel('b', 1)]), concept('b', 'B')] };

    it('moves the influenced concept when its influencer is clamped', () => {
        const [b] = runScenario(chain, { concepts: [{ influence: 1 }, { influence: 0 }] });
        expect(b.id).toBe('b');
        expect(b.influence).toBeGreaterThan(0.05);
    });

    it('does not move an influencer when the concept it influences is clamped', () => {
        const [a] = runScenario(chain, { concepts: [{ influence: 0 }, { influence: 1 }] });
        expect(a.id).toBe('a');
        expect(a.influence).toBeCloseTo(0, 10);
    });
});

describe('converge when the cap is hit', () => {
    // Every concept inhibits every other with weight -1: the unclamped state flips between
    // two values forever, so where the loop happens to stop decides what it returns.
    const n = 8;
    const ids = Array.from({ length: n }, (_, i) => `n${i}`);
    const mesh = ids.map((id) => concept(id, id, ids.filter((other) => other !== id).map((other) => rel(other, -1))));

    it('returns the same state whether the cap is odd or even', () => {
        const weights = getWeightMatrix(mesh);
        const init = new Array(n).fill(1);
        const even = converge(init, weights, sigm, [], 100);
        const odd = converge(init, weights, sigm, [], 101);
        even.forEach((value, i) => expect(value).toBeCloseTo(odd[i], 6));
    });

    it('warns that the result did not settle', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        converge(new Array(n).fill(1), getWeightMatrix(mesh), sigm, [], 100);
        expect(warn).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });
});
