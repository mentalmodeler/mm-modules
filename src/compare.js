import {getMetrics} from './metrics';
import {toInfluence} from './influence';

const normalize = name => String(name ?? '').toLowerCase().trim();

// Relationships are matched by their (from, to) names, each normalized on its own, so
// stray whitespace/case in one name can't bleed into the other and "ab"+"c" can't
// collide with "a"+"bc".
const relationshipKey = (fromNode, toNode) => `${normalize(fromNode.name)}\u0000${normalize(toNode.name)}`;

// Student files are untrusted: a list may be missing, null or not an array, and its entries
// may be null. Drop what isn't an object so one bad file can't stop the whole batch.
const objectsOf = (list) => (Array.isArray(list) ? list : []).filter((item) => item && typeof item === 'object');
const cleanConcepts = (concepts) => objectsOf(concepts).map((concept) => ({
    ...concept,
    relationships: objectsOf(concept.relationships),
}));

// Keep the first relationship for each (from, to) key. Two concepts can share a normalized
// name (e.g. "A" and "a "), and each copy would otherwise match the other model's edge.
const uniqueRelationships = (relationships) => {
    const seen = new Set();
    return relationships.filter(({fromNode, toNode}) => {
        const key = relationshipKey(fromNode, toNode);
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
};

const compareModel = (model, canonical) => {
    const getNode = ({name, id}) => ({name: name, id: id});
    const findNode = ({id, nodes}) => {
        const _node = nodes.find(node => node.id === id) || {id: '', name: '[not found]'};
        return getNode(_node);
    }

    const getRelationships = ({name: fromName, id: fromId, relationships}, _, nodes) => (
        (relationships || [])
            .filter(({id}) => nodes.some((node) => node.id === id))
            .map(({name, id, influence}) => ({
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

    const canonicalConcepts = cleanConcepts(canonical.concepts);
    const modelConcepts = cleanConcepts(model.concepts);
    const canonicalNodes = canonicalConcepts.map(getNode);
    const modelNodes = modelConcepts.map(getNode);
    const canonicalRelationships = uniqueRelationships(canonicalConcepts.flatMap(getRelationships));
    const modelRelationships = uniqueRelationships(modelConcepts.flatMap(getRelationships));
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

const compareModels = ({modelsJSON, canonicalId, scenario}) => {
    const canonical = modelsJSON.find(model => model.id === canonicalId);

    const modelsToCompare = modelsJSON.filter(model => model.id !== canonicalId);
    return  modelsToCompare.reduce(
        (acc, model) => ({
            ...acc,
            [model.id]: {
                ...compareModel(model, canonical),
                ...getMetrics({concepts: cleanConcepts(model.concepts)}),
            }
        })
    , {});
};

export {compareModels, compareModel, normalize as normalizeName};
