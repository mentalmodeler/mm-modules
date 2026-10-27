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

// state x weights, with row = source: each concept collects from the concepts that point at it.
const collect = (state, weights) => weights[0].map((_, j) => state.reduce((sum, value, i) => sum + value * weights[i][j], 0));

const getPreActivation = (rule, state, weights) => {
    if (rule === 'rescaled kosko') {
        const rescaled = state.map((value) => 2 * value - 1);
        return collect(rescaled, weights).map((incoming, i) => rescaled[i] + incoming);
    }
    const incoming = collect(state, weights);
    return rule === 'modified kosko' ? incoming.map((value, i) => state[i] + value) : incoming;
};

// Iterates to a fixed point from all ones, holding clamped concepts at their values. Some maps
// (e.g. a bivalent or trivalent feedback loop) flip between states forever, so the iteration is
// capped; at the cap the mean of the last two states is returned, since which one we stopped on is
// arbitrary.
const settle = (weights, {rule, squash, lambda}, clampValues) => {
    const squashFn = squashFunctions[squash];
    let previous = weights.map(() => 1);
    let prior = previous;
    let current = previous;
    let diff = 1;
    let iterations = 0;

    while (diff > EPSILON && iterations < MAX_ITERATIONS) {
        iterations += 1;
        current = getPreActivation(rule, previous, weights).map((x, i) =>
            clampValues.has(i) ? clampValues.get(i) : squashFn(x, lambda),
        );
        diff = Math.max(...current.map((value, i) => Math.abs(value - previous[i])));
        prior = previous;
        previous = current;
    }

    if (diff > EPSILON) {
        console.warn(`mm-modules: scenario did not converge after ${MAX_ITERATIONS} iterations; returning the mean of the last two states.`);
        return current.map((value, i) => (value + prior[i]) / 2);
    }
    return current;
};

/**
 * Change from baseline for every concept that was not clamped, in model order.
 * @param {{concepts: object[]}} model
 * @param {{clamps?: {id: string, value: number}[], settings?: object}} [options] settings are
 *   normalized (see normalizeScenarioSettings); clamps naming an unknown concept are ignored.
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
    const indexById = new Map(concepts.map(({id}, i) => [id, i]));
    const clampValues = new Map();
    clamps.forEach(({id, value}) => {
        if (indexById.has(id)) {
            clampValues.set(indexById.get(id), value);
        }
    });

    const baseline = settle(weights, normalized, new Map());
    const scenario = settle(weights, normalized, clampValues);

    return concepts
        .map(({id, name}, i) => ({id, name, influence: scenario[i] - baseline[i]}))
        .filter((_, i) => !clampValues.has(i));
};

export {runInference};
