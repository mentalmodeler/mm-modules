// import {runScenario} from './scenario';
import {getMetrics} from './metrics';
import {toInfluence} from './influence';

const normalize = name => name.toLowerCase().trim();

// Relationships are matched by their (from, to) names, each normalized on its own, so
// stray whitespace/case in one name can't bleed into the other and "ab"+"c" can't
// collide with "a"+"bc".
const relationshipKey = (fromNode, toNode) => `${normalize(fromNode.name)}\u0000${normalize(toNode.name)}`;

const compareModel = (model, canonical) => {
    const getNode = ({name, id}) => ({name: name, id: id});
    const findNode = ({id, nodes}) => {
        const _node = nodes.find(node => node.id === id) || {id: '', name: '[not found]'};
        return getNode(_node);
    }

    const getRelationships = ({name: fromName, id: fromId, relationships = []}, _, nodes) => (
        relationships.map(({name, id, influence}) => ({
            fromNode: {
                id: fromId,
                name: fromName
            },
            toNode: findNode({id, nodes}),
            relationship: {
                id: id,
                name: name,
                influence: influence,
                fromNodeId: fromId
            }
        }))
    );
    
    const differenceNodes = (a, b) => {
        const names = b.map(({name}) => normalize(name));
        return a.filter(({name}) => !names.includes(normalize(name)));
    };

    const intersectionNodes = (a, b) => {
        const names = b.map(({name}) => normalize(name));
        return a.filter(({name}) => names.includes(normalize(name)));
    };

    const differenceRelationships = (a, b) => {
        const keys = b.map(({fromNode, toNode}) => relationshipKey(fromNode, toNode));
        return a.filter(({fromNode, toNode}) => !keys.includes(relationshipKey(fromNode, toNode)));
    };

    const intersectionRelationships = (a, b, invert) => {
        const keys = b.map(({fromNode, toNode}) => relationshipKey(fromNode, toNode));
        return a.filter(({fromNode, toNode}) => keys.includes(
            invert ? relationshipKey(toNode, fromNode) : relationshipKey(fromNode, toNode)
        ));
    };

    const correctlySigned = (relationships, cRelationships) => {
        // Compare numeric signs: both positive, both negative, or both zero. Influences are
        // strings in .mmp files, so go through toInfluence() rather than comparing raw values.
        const isCorrect = (x, y) => Math.sign(toInfluence(x)) === Math.sign(toInfluence(y));

        return relationships.filter(({fromNode, toNode, relationship}) => {
            const key = relationshipKey(fromNode, toNode);
            return cRelationships.some(({fromNode: cFromNode, toNode: cToNode, relationship: cRelationship}) => (
                key === relationshipKey(cFromNode, cToNode) && isCorrect(relationship.influence, cRelationship.influence)
            ));
        });
    };

    const findReversedRelationships = ({extraRelationships, missingRelationships}) => {
        const reversedRelationships = intersectionRelationships(extraRelationships, missingRelationships, true);
        const keys = reversedRelationships.map(({fromNode, toNode}) => relationshipKey(fromNode, toNode));
        return {
            reversedRelationships,
            updatedExtraRelationships: extraRelationships.filter(({fromNode, toNode}) => !keys.includes(relationshipKey(fromNode, toNode))),
            updatedMissingRelationships: missingRelationships.filter(({fromNode, toNode}) => !keys.includes(relationshipKey(toNode, fromNode))),
        };
    };

    const canonicalNodes = canonical.concepts.map(getNode);
    const modelNodes = model.concepts.map(getNode);
    const canonicalRelationships = canonical.concepts.flatMap(getRelationships);
    const modelRelationships = model.concepts.flatMap(getRelationships);
    const extraNodes = differenceNodes(modelNodes, canonicalNodes);
    const missingNodes = differenceNodes(canonicalNodes, modelNodes);
    const presentNodes = intersectionNodes(modelNodes, canonicalNodes);
    const extraRelationships = differenceRelationships(modelRelationships, canonicalRelationships);
    const missingRelationships = differenceRelationships(canonicalRelationships, modelRelationships);
    const {reversedRelationships, updatedExtraRelationships, updatedMissingRelationships} = findReversedRelationships({extraRelationships, missingRelationships});
    const correctlyLinkedRelationships = intersectionRelationships(modelRelationships, canonicalRelationships);
    const correctlySignedRelationships = correctlySigned(correctlyLinkedRelationships, canonicalRelationships);
    const incorrectlySignedRelationships = differenceRelationships(correctlyLinkedRelationships, correctlySignedRelationships);
    const score = correctlySignedRelationships.length - (updatedExtraRelationships.length + updatedMissingRelationships.length + reversedRelationships.length);
    return {
        id: model.id,
        score: score,
        nodes: {
            extra: extraNodes,
            missing: missingNodes,
            present: presentNodes,
        },
        relationships: {
            extra: updatedExtraRelationships, // extraRelationships,
            missing: updatedMissingRelationships, // missingRelationships,
            reversed: reversedRelationships,
            correctlySigned: correctlySignedRelationships,
            incorrectlySigned: incorrectlySignedRelationships,
        },
    };
};

// not comapring scenarios anymore - JME 2021/01/31
// const compareScenario = (model, scenario, correctResults) => {
//     const getPoints = concept => {
//         const sConcept = scenario.concepts.find(({name}) => normalize(name) === normalize(concept.name));
//         return sConcept ? sConcept.points : 0;
//     };
//     const wrapConceptWithPoints = concept => {
//         const points = getPoints(concept);
//         return { ...concept, points };
//     };
//     const isCorrect = result => {
//         const cResult = correctResults.find(({name}) => normalize(name) === normalize(result.name));
//         return cResult && result.influence === cResult.influence;
//     };
//     const results = runScenario(model, scenario);
//     const correct = results.filter(isCorrect).map(wrapConceptWithPoints);
//     const incorrect = results.filter(concept => !isCorrect(concept)).map(wrapConceptWithPoints);
//     const score = correct.length ? correct.map(({points}) => points).reduce((score, points) => score + points) : 0;

//     return {
//         score: score,
//         correct: correct,
//         incorrect: incorrect,
//     };
// };

const compareModels = ({modelsJSON, canonicalId, scenario}) => {
    const canonical = modelsJSON.find(model => model.id === canonicalId);
    
    // not running the scenario anymore - JME 2021/01/31
    // const correctScenarioResult = runScenario(canonical, scenario);
    
    const modelsToCompare = modelsJSON.filter(model => model.id !== canonicalId);
    return  modelsToCompare.reduce(
        (acc, model) => ({
            ...acc,
            [model.id]: {
                ...compareModel(model, canonical),
                ...getMetrics({concepts: model.concepts}),
            }
        })
    , {});
    
    // modelsToCompare.forEach(model => {
    //     let result = compareModel(model, canonical);
    //     // not running the scenario anymore - JME 2021/01/31
    //     // const scenarioResult = compareScenario(model, scenario, correctScenarioResult);
    //     // result.scenario = scenarioResult;
    //     // result.score += scenarioResult.score;
    //     results[model.id] = result;
    // });
    // return results;
};

export {compareModels, compareModel, /*compareScenario, */normalize as normalizeName};
