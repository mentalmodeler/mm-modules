import {runScenario} from './scenario';

const normalize = name => name.toLowerCase().trim(); 

const compareModel = (model, canonical) => {
    const getNode = ({name, id}) => ({name: name, id: id});
    const findNode = ({id, nodes}) => {
        const _node = nodes.find(node => node.id === id) || {id: '', name: '[not found]'};
        return getNode(_node);
    }

    const getRelationships = ({name: fromName, id: fromId, relationships}, _, nodes) => (
        relationships && relationships.map(({name, id, influence}) => ({
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
        const names = b.map(({fromNode, toNode}) => normalize(fromNode.name + toNode.name));
        return a.filter(({fromNode, toNode}) => !names.includes(normalize(fromNode.name + toNode.name)));
    };

    const intersectionRelationships = (a, b) => {
        const names = b.map(({fromNode, toNode}) => normalize(fromNode.name + toNode.name));
        return a.filter(({fromNode, toNode}) => names.includes(normalize(fromNode.name + toNode.name)));
    };

    const correctlySigned = (relationships, cRelationships) => {
        const isCorrect = (x, y) => (x > 0 && y > 0) || (x < 0 && y < 0) || (x === 0 && y === 0);

        return relationships.filter(({fromNode, relationship}) => {
            const name = normalize(fromNode.name + relationship.name);
            return cRelationships.find(({fromNode: cFromNode, relationship: cRelationship}) => {
                return name === normalize(cFromNode.name + relationship.name) && isCorrect(relationship.influence, cRelationship.influence);
            });
        });
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
    const correctlyLinkedRelationships = intersectionRelationships(modelRelationships, canonicalRelationships);
    const correctlySignedRelationships = correctlySigned(correctlyLinkedRelationships, canonicalRelationships);
    const incorrectlySignedRelationships = differenceRelationships(correctlyLinkedRelationships, correctlySignedRelationships);
    const score = correctlySignedRelationships.length - (extraRelationships.length + missingRelationships.length);

    return {
        id: model.id,
        score: score,
        nodes: {
            extra: extraNodes,
            missing: missingNodes,
            present: presentNodes,
        },
        relationships: {
            extra: extraRelationships,
            missing: missingRelationships,
            correctlySigned: correctlySignedRelationships,
            incorrectlySigned: incorrectlySignedRelationships,
        },
    };
};

const compareScenario = (model, scenario, correctResults) => {
    const getPoints = concept => scenario.concepts.find(({name}) => normalize(name) === normalize(concept.name)).points;
    const isCorrect = result => {
        const cResult = correctResults.find(({name}) => normalize(name) === normalize(result.name));
        return cResult && result.influence === cResult.influence;
    };
    const wrapConceptWithPoints = concept => {
        const points = getPoints(concept);
        return { ...concept, points };
    };
    const results = runScenario(model, scenario);
    const correct = results.filter(isCorrect).map(wrapConceptWithPoints);
    const incorrect = results.filter(concept => !isCorrect(concept)).map(wrapConceptWithPoints);
    const score = correct.length ? correct.map(({points}) => points).reduce((score, points) => score + points) : 0;

    return {
        score: score,
        correct: correct,
        incorrect: incorrect,
    };
};

const compareModels = ({modelsJSON, canonicalId, scenario}) => {
    const canonical = modelsJSON.find(model => model.id === canonicalId);
    const correctScenarioResult = runScenario(canonical, scenario);
    const modelsToCompare = modelsJSON.filter(model => model.id !== canonicalId);
    let results = {};

    modelsToCompare.forEach(model => {
        let result = compareModel(model, canonical);
        const scenarioResult = compareScenario(model, scenario, correctScenarioResult);

        result.scenario = scenarioResult;
        result.score += scenarioResult.score;

        results[model.id] = result;
    });

    return results;
};

export {compareModels, compareModel, compareScenario, normalize as normalizeName};
