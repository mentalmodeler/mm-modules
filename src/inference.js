// Scenario inference with the options offered by PyFCM (https://github.com/payamaminpour/PyFCM,
// Payam Aminpour, Michigan State University, MIT license): three inference rules, four squashing
// functions, a steepness parameter (lambda) and a noise threshold that drops weak links. Results are
// checked against PyFCM's own output in test/inference.test.js (see test/golden/).
//
// Unlike runScenario, clamps are an explicit list, so a concept can be clamped to exactly 0.
import {getWeightMatrix} from './scenario';
import {normalizeScenarioSettings} from './scenarioSettings';

const EPSILON = 0.00001;
const MAX_ITERATIONS = 10000;

const squashFunctions = {
    sigmoid: (x, lambda) => 1 / (1 + Math.exp(-lambda * x)),
    'hyperbolic tangent': (x, lambda) => Math.tanh(lambda * x),
    bivalent: (x) => (x > 0 ? 1 : 0),
    trivalent: (x) => (x > 0 ? 1 : x < 0 ? -1 : 0),
};

// Each concept collects from the concepts that point at it (weights is row = source). Real models
// are sparse and a non-settling map runs up to MAX_ITERATIONS steps, so each concept's incoming
// links are listed once up front instead of multiplying through the dense matrix every step.
const getIncoming = (weights) =>
    weights[0].map((_, target) => {
        const sources = [];
        const values = [];
        weights.forEach((row, source) => {
            if (row[target] !== 0) {
                sources.push(source);
                values.push(row[target]);
            }
        });
        return {sources: Int32Array.from(sources), values: Float64Array.from(values)};
    });

const collect = (state, incoming, out) => {
    incoming.forEach(({sources, values}, target) => {
        let sum = 0;
        for (let k = 0; k < sources.length; k += 1) {
            sum += state[sources[k]] * values[k];
        }
        out[target] = sum;
    });
};

// Writes the pre-activation for each concept into `out` (scratch is working space for the rescaled rule).
const getPreActivation = (rule, state, incoming, scratch, out) => {
    if (rule === 'rescaled kosko') {
        for (let i = 0; i < state.length; i += 1) {
            scratch[i] = 2 * state[i] - 1;
        }
        collect(scratch, incoming, out);
        for (let i = 0; i < state.length; i += 1) {
            out[i] += scratch[i];
        }
        return;
    }
    collect(state, incoming, out);
    if (rule === 'modified kosko') {
        for (let i = 0; i < state.length; i += 1) {
            out[i] += state[i];
        }
    }
};

// Iterates to a fixed point from all ones, holding clamped concepts at their values. Some maps
// (e.g. a bivalent or trivalent feedback loop) flip between states forever, so the iteration is
// capped; at the cap the mean of the last two states is returned, since which one we stopped on is
// arbitrary.
const settle = (incoming, {rule, squash, lambda}, clampValues) => {
    const size = incoming.length;
    const squashFn = squashFunctions[squash];
    const x = new Float64Array(size);
    const scratch = new Float64Array(size);
    let previous = new Float64Array(size).fill(1);
    let prior = new Float64Array(size).fill(1);
    let current = new Float64Array(size);
    let diff = 1;
    let iterations = 0;

    while (diff > EPSILON && iterations < MAX_ITERATIONS) {
        iterations += 1;
        getPreActivation(rule, previous, incoming, scratch, x);
        diff = 0;
        for (let i = 0; i < size; i += 1) {
            current[i] = clampValues.has(i) ? clampValues.get(i) : squashFn(x[i], lambda);
            diff = Math.max(diff, Math.abs(current[i] - previous[i]));
        }
        [prior, previous, current] = [previous, current, prior];
    }

    if (diff > EPSILON) {
        console.warn(`mm-modules: scenario did not converge after ${MAX_ITERATIONS} iterations; returning the mean of the last two states.`);
        return previous.map((value, i) => (value + prior[i]) / 2);
    }
    return previous;
};

// A clamp value is a finite number or a numeric string; anything else is ignored, like an unknown id.
const toClampValue = (value) => {
    const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    return typeof number === 'number' && Number.isFinite(number) ? number : null;
};

/**
 * Change from baseline for every concept that was not clamped, in model order.
 * @param {{concepts: object[]}} model
 * @param {{clamps?: {id: string, value: number}[], settings?: object}} [options] settings are
 *   normalized (see normalizeScenarioSettings); clamps naming an unknown concept, or whose value is
 *   not a finite number, are ignored.
 * @returns {{id: string, name: string, influence: number}[]}
 */
const runInference = ({concepts = []}, {clamps = [], settings} = {}) => {
    if (concepts.length === 0) {
        return [];
    }
    const normalized = normalizeScenarioSettings(settings);
    const weights = getWeightMatrix(concepts).map((row) =>
        row.map((weight) => (Math.abs(weight) <= normalized.noiseThreshold ? 0 : weight)),
    );
    const incoming = getIncoming(weights);
    const indexById = new Map(concepts.map(({id}, i) => [id, i]));
    const clampValues = new Map();
    clamps.forEach(({id, value}) => {
        const clampValue = toClampValue(value);
        if (indexById.has(id) && clampValue !== null) {
            clampValues.set(indexById.get(id), clampValue);
        }
    });

    const baseline = settle(incoming, normalized, new Map());
    const scenario = settle(incoming, normalized, clampValues);

    return concepts
        .map(({id, name}, i) => ({id, name, influence: scenario[i] - baseline[i]}))
        .filter((_, i) => !clampValues.has(i));
};

export {runInference};
