import {abs, max, multiply, subtract, tanh} from 'mathjs';
import {normalizeName} from './compare';

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
};

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
};

const runScenario = ({concepts}, {concepts: scenarioConcepts = []}, clampFn = sigm) => {
    const vecSize = concepts.length;
    const initVec = new Array(vecSize).fill(1);
    const influences = scenarioConcepts.map(({influence}) => parseFloat(influence));
    const weightMat = getWeightMatrix(concepts);
    const steadyVec = converge(initVec, weightMat, clampFn);
    const scenarioVec = converge(initVec, weightMat, clampFn, influences);
    const scenarioResult = subtract(scenarioVec, steadyVec);

    return scenarioResult
    .map((influence, i) => (
    {
        id: concepts[i].id, 
        name: concepts[i].name,
        influence: influence,
    }
    )).filter(({name}) => {
        const sConcept = scenarioConcepts.find(({name: sName}) => normalizeName(name) === normalizeName(sName));
        return !sConcept || !sConcept.influence;
    }); 
};

export {getWeightMatrix, runScenario, sigm, tanh};
