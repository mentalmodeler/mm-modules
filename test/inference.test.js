import { describe, expect, it, vi } from 'vitest';
import { runInference } from '../src/inference';
import { runScenario, sigm, tanh } from '../src/scenario';
import { concept, rel } from './fixtures';
import golden from './fixtures/pyfcm-golden.json';

// Concept ids are the golden names; a relationship for every non-zero matrix entry (row = source).
const toModel = (names, matrix) => ({
    concepts: names.map((name, i) =>
        concept(
            name,
            name,
            matrix[i].flatMap((weight, j) => (weight !== 0 ? [rel(names[j], weight)] : [])),
        ),
    ),
});
const goldenModel = toModel(golden.names, golden.matrix);

const describeCase = ({ settings: s, clamps }, i) =>
    `#${i} ${s.rule} / ${s.squash} / lambda ${s.lambda} / threshold ${s.noiseThreshold} / clamps ${clamps
        .map(({ name, value }) => `${name}=${value}`)
        .join(', ')}`;

const expectMatchesPyFCM = (model, testCase) => {
    const clamps = testCase.clamps.map(({ name, value }) => ({ id: name, value }));
    const result = runInference(model, { clamps, settings: testCase.settings });
    const clampedNames = testCase.clamps.map(({ name }) => name);

    expect(result).toHaveLength(model.concepts.length - clampedNames.length);
    result.forEach(({ id, influence }) => {
        expect(clampedNames).not.toContain(id);
        expect(influence).toBeCloseTo(testCase.changes[id], 9);
    });
};

describe('runInference against PyFCM', () => {
    it.each(golden.cases.map((c, i) => [describeCase(c, i), c]))('matches PyFCM: %s', (_, testCase) => {
        expectMatchesPyFCM(goldenModel, testCase);
    });

    describe.each(golden.maps.map((m) => [m.name, m]))('on the small map "%s"', (_, { names, matrix, cases }) => {
        const model = toModel(names, matrix);
        it.each(cases.map((c, i) => [describeCase(c, i), c]))('matches PyFCM: %s', (__, testCase) => {
            expectMatchesPyFCM(model, testCase);
        });
    });

    it('covers bivalent and trivalent cases that actually move, and weights on the threshold boundary', () => {
        const all = [...golden.cases, ...golden.maps.flatMap((m) => m.cases)];
        const moves = (testCase) => Object.values(testCase.changes).some((change) => Math.abs(change) > 1e-9);
        ['bivalent', 'trivalent'].forEach((squash) =>
            expect(all.filter((c) => c.settings.squash === squash && moves(c)).length).toBeGreaterThan(10),
        );
        expect(all.some((c) => c.settings.noiseThreshold === 0.25)).toBe(true);
        expect(all.some((c) => c.settings.noiseThreshold === 0.5)).toBe(true);
    });
});

describe('runInference defaults', () => {
    const clamps = [
        { id: golden.names[1], value: 0.5 },
        { id: golden.names[4], value: 1 },
    ];
    // runScenario clamps by position: a non-zero influence at a concept's index.
    const scenario = {
        concepts: golden.names.map((_, i) => ({ influence: i === 1 ? 0.5 : i === 4 ? 1 : 0 })),
    };

    it('gives what runScenario gives today with sigmoid when no settings are passed', () => {
        const expected = runScenario(goldenModel, scenario, sigm);
        const result = runInference(goldenModel, { clamps });
        expect(result.map(({ id }) => id)).toEqual(expected.map(({ id }) => id));
        result.forEach(({ influence }, i) => expect(influence).toBeCloseTo(expected[i].influence, 10));
    });

    it('gives what runScenario gives today with tanh for the hyperbolic tangent setting', () => {
        const expected = runScenario(goldenModel, scenario, tanh);
        const result = runInference(goldenModel, { clamps, settings: { squash: 'hyperbolic tangent' } });
        result.forEach(({ influence }, i) => expect(influence).toBeCloseTo(expected[i].influence, 10));
    });

    it('labels each result with the concept id and name', () => {
        const [first] = runInference(goldenModel, { clamps });
        expect(first).toMatchObject({ id: golden.names[0], name: golden.names[0] });
        expect(typeof first.influence).toBe('number');
    });
});

describe('runInference clamps', () => {
    const loop = {
        concepts: [concept('a', 'A', [rel('b', 1)]), concept('b', 'B', [rel('a', -1)]), concept('c', 'C', [rel('a', 0.5)])],
    };

    it('honors a clamp with value 0', () => {
        const unclamped = runInference(loop, { clamps: [] });
        const clampedToZero = runInference(loop, { clamps: [{ id: 'b', value: 0 }] });

        expect(clampedToZero.map(({ id }) => id)).toEqual(['a', 'c']);
        unclamped.forEach(({ influence }) => expect(influence).toBeCloseTo(0, 10));
        expect(Math.abs(clampedToZero.find(({ id }) => id === 'a').influence)).toBeGreaterThan(0.01);
    });

    it('ignores a clamp that names an unknown concept', () => {
        const withUnknown = runInference(loop, { clamps: [{ id: 'b', value: 1 }, { id: 'zzz', value: 1 }] });
        expect(withUnknown).toEqual(runInference(loop, { clamps: [{ id: 'b', value: 1 }] }));
    });

    it.each([[{ id: 'a' }], [{ id: 'a', value: NaN }], [{ id: 'a', value: Infinity }], [{ id: 'a', value: 'H+' }]])(
        'ignores a clamp whose value is not a finite number: %j',
        (clamp) => {
            const chain = {
                concepts: [concept('a', 'A', [rel('b', 0.5)]), concept('b', 'B', [rel('c', -0.75)]), concept('c', 'C')],
            };
            expect(runInference(chain, { clamps: [clamp] })).toEqual(runInference(chain, { clamps: [] }));
        },
    );

    it('accepts a numeric string as a clamp value', () => {
        const chain = { concepts: [concept('a', 'A', [rel('b', 0.5)]), concept('b', 'B')] };
        expect(runInference(chain, { clamps: [{ id: 'a', value: '0.7' }] })).toEqual(
            runInference(chain, { clamps: [{ id: 'a', value: 0.7 }] }),
        );
    });

    it('does not mutate the model or the clamps', () => {
        const modelCopy = JSON.parse(JSON.stringify(goldenModel));
        const clamps = [{ id: golden.names[1], value: 0.5 }];
        const clampsCopy = JSON.parse(JSON.stringify(clamps));
        runInference(goldenModel, { clamps, settings: { rule: 'rescaled kosko', noiseThreshold: 0.15 } });
        expect(goldenModel).toEqual(modelCopy);
        expect(clamps).toEqual(clampsCopy);
    });
});

describe('runInference edge cases', () => {
    it('returns an empty list for a model with no concepts, and with no options at all', () => {
        expect(runInference({ concepts: [] })).toEqual([]);
        expect(runInference({ concepts: [] }, { clamps: [{ id: 'a', value: 1 }] })).toEqual([]);
    });

    it('treats concepts with no relationships key as having no influence on anything', () => {
        const model = { concepts: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] };
        const result = runInference(model, { clamps: [{ id: 'a', value: 1 }] });
        expect(result.map(({ id }) => id)).toEqual(['b']);
        expect(result[0].influence).toBeCloseTo(0, 10);
    });

    it('returns all zeros when the noise threshold removes every link', () => {
        const clamps = [{ id: golden.names[1], value: 0.5 }];
        runInference(goldenModel, { clamps, settings: { noiseThreshold: 1 } }).forEach(({ influence }) =>
            expect(influence).toBeCloseTo(0, 10),
        );
    });

    it('uses lambda for sigmoid but not for bivalent', () => {
        const clamps = [{ id: golden.names[1], value: 0.5 }];
        const maxDifference = (a, b) => Math.max(...a.map(({ influence }, i) => Math.abs(influence - b[i].influence)));
        const sigmoid = (lambda) => runInference(goldenModel, { clamps, settings: { squash: 'sigmoid', lambda } });
        const bivalent = (lambda) => runInference(goldenModel, { clamps, settings: { squash: 'bivalent', lambda } });

        expect(maxDifference(sigmoid(1), sigmoid(4))).toBeGreaterThan(1e-4);
        expect(maxDifference(bivalent(1), bivalent(4))).toBe(0);
    });

    it('falls back to the default settings for invalid ones instead of throwing', () => {
        const clamps = [{ id: golden.names[1], value: 0.5 }];
        const invalid = { rule: 'nope', squash: 5, lambda: 'abc', noiseThreshold: -3 };
        expect(runInference(goldenModel, { clamps, settings: invalid })).toEqual(runInference(goldenModel, { clamps }));
    });
});

// A reproducible random signed map (mulberry32), sparse like real models.
const randomModel = (size, density, seed) => {
    let state = seed;
    const random = () => {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const ids = Array.from({ length: size }, (_, i) => `c${i}`);
    return {
        concepts: ids.map((id) =>
            concept(
                id,
                id,
                ids.flatMap((target) => (random() < density ? [rel(target, (random() * 2 - 1).toFixed(2))] : [])),
            ),
        ),
    };
};

describe('runInference speed', () => {
    it.each(['bivalent', 'trivalent'])(
        'finishes a 200-concept map that never settles (%s) without a noticeable stall',
        (squash) => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const model = randomModel(200, 0.05, 7);

            const start = performance.now();
            const result = runInference(model, { clamps: [{ id: 'c0', value: -1 }], settings: { squash } });
            const elapsed = performance.now() - start;

            expect(warn).toHaveBeenCalled(); // it really did run to the iteration cap
            expect(result).toHaveLength(199);
            expect(elapsed).toBeLessThan(300);
            warn.mockRestore();
        },
        30000,
    );
});

describe('runInference convergence', () => {
    const flipFlop = { concepts: [concept('a', 'A', [rel('b', 1)]), concept('b', 'B', [rel('a', -1)])] };

    it.each([
        ['kosko', 'trivalent'],
        ['modified kosko', 'bivalent'],
        ['rescaled kosko', 'trivalent'],
    ])('returns finite numbers instead of hanging on a map that never settles (%s, %s)', (rule, squash) => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const result = runInference(flipFlop, { settings: { rule, squash } });
        expect(result).toHaveLength(2);
        result.forEach(({ influence }) => expect(Number.isFinite(influence)).toBe(true));
        warn.mockRestore();
    });

    it('warns when it gives up on a map that never settles', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        runInference(flipFlop, { settings: { rule: 'kosko', squash: 'trivalent' } });
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });
});
