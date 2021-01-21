import {abs, max, multiply, subtract, tanh} from 'mathjs';

const sigm = (x) => 1 / (1 + Math.exp(-x));
const getWeightMatrix = (concepts) => {
    return concepts.map(({relationships}) => {
        return concepts.map(({id: conceptId}) => {
            if (!relationships) {
                return 0;
            }
            else {
                const relationship = relationships.find(({id}) => id === conceptId);
                return relationship ? parseFloat(relationship.influence) : 0;
            }
        });
    });
}

const converge = (initVec, weightMat, clampFn, influences = []) => {
    const epsilon = 0.00001;
    let previousVec = initVec;
    let currentVec;
    let diff = 1;

    while (diff > epsilon) {
        const intermediateVec = multiply(weightMat, previousVec);

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
}

const runScenario = (concepts, influences, clampFn = sigm) => {
    const vecSize = concepts.length;
    const initVec = new Array(vecSize).fill(1);
    const weightMat = getWeightMatrix(concepts);
    const steadyVec = converge(initVec, weightMat, clampFn);
    const scenarioVec = converge(initVec, weightMat, clampFn, influences);
    const scenarioResult = subtract(scenarioVec, steadyVec);

    return scenarioResult.map((inf, i) => ({id: concepts[i].id, influence: inf})); 
}

export {sigm, tanh, runScenario};
