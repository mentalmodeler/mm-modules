import {abs, max, multiply, subtract, tanh} from 'mathjs';
import {toInfluence} from './influence';

const sigm = (x) => 1 / (1 + Math.exp(-x));
const getWeightMatrix = (concepts) => {
    return concepts.map(({relationships}) => {
        return concepts.map(({id: conceptId}) => {
            if (!relationships) {
                return 0;
            }
            else {
                const relationship = relationships.find(({id}) => id === conceptId);
                return relationship ? toInfluence(relationship.influence) : 0;
            }
        });
    });
};

const MAX_ITERATIONS = 10000;

const converge = (initVec, weightMat, clampFn, influences = []) => {
    const epsilon = 0.00001;
    let previousVec = initVec;
    let currentVec;
    let diff = 1;
    let iterations = 0;

    // Some feedback loops (e.g. tanh with weights whose product is +/-1) approach their
    // fixed point only like 1/sqrt(n), so epsilon alone is not a safe stopping rule.
    while (diff > epsilon && iterations < MAX_ITERATIONS) {
        iterations += 1;
        // vector x matrix (row = source): each concept collects from the concepts that point at it.
        const intermediateVec = multiply(previousVec, weightMat);

        currentVec = intermediateVec.map((x, i) => {
            if (influences[i]) {
                return influences[i];
            }
            else {
                return clampFn(x);
            }
        });
        
        diff = max(abs(subtract(currentVec, previousVec)));
        previousVec = currentVec;
    }

    return currentVec;
};

const runScenario = ({concepts}, {concepts: scenarioConcepts = []}, clampFn = sigm) => {
    const vecSize = concepts.length;
    const initVec = new Array(vecSize).fill(1);
    const influences = scenarioConcepts.map(({influence}) => toInfluence(influence));
    const weightMat = getWeightMatrix(concepts);
    const steadyVec = converge(initVec, weightMat, clampFn);
    const scenarioVec = converge(initVec, weightMat, clampFn, influences);
    const scenarioResult = subtract(scenarioVec, steadyVec);

    return scenarioResult
        .map((influence, i) => ({
            id: concepts[i].id,
            name: concepts[i].name,
            influence,
        }))
        // scenarioConcepts[i] is the clamp input for concepts[i] (the caller builds it by
        // mapping over the same concepts array -- see runScenarioCalculation in -suite), so
        // excluding clamped concepts by this same index, rather than by re-matching name,
        // can't be confused by two concepts sharing a name where only one was clamped.
        .filter((_, i) => !influences[i]);
};

export {getWeightMatrix, runScenario, sigm, tanh};
