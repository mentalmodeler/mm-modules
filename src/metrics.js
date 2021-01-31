const parseInfluence = (influence) => {
    const parsed = parseFloat(influence);
    return !isNaN(parsed) ? Math.abs(parsed) : 0;
};

const getNumberOfConnections = (concepts = []) => 
    concepts.reduce(
        (acc, concept) => acc + (concept.relationships ? concept.relationships.length: 0)
    , 0);

const getPossibleNumberOfConnections = (concepts = []) => {
    const l = concepts.length;
    return l > 0 ? l * (l - 1) :  0;
}

const getInfluencees = ({id = '', concepts = []}) => 
    concepts.flatMap(
        ({relationships = []}) => relationships.filter((relationship) => relationship.id === id)
    );

const getIndegree = ({id = '', concepts = []}) => 
    getInfluencees({id, concepts}).reduce(
        (acc, {influence}) => acc + parseInfluence(influence)
    , 0);

const getOutdegree = (relationships = []) =>
    relationships.reduce(
        (acc, {influence}) => acc + parseInfluence(influence)    
    , 0);

const getDegrees = ({id = '', concepts = []}) => {
    const concept = concepts.find((c) => c.id === id);
    return concept
        ? {
            indegree: getIndegree({id, concepts}),
            outdegree: getOutdegree(concept.relationships)
        }
        : {indegree: 0, outdegree: 0};
}

const getType = ({id, concepts = []}) => {
    const {indegree, outdegree} = getDegrees({id, concepts});
    let type = 'none';
    if (indegree !== 0) {
        if (outdegree !== 0) {
            type = 'ordinay';
        } else {
            type = 'receiver';
        }
    } else if (outdegree !== 0) {
        type = 'driver';
    }
    return type;
};

const getConceptsWithMetrics = ({concepts= []}) => 
    concepts.map(
        ({id, ...concept}) => {
            const {indegree, outdegree} = getDegrees({id, concepts});
            return {
                ...concept,
                id,
                indegree,
                outdegree,
                centrality: indegree + outdegree,
                type: getType ({id, concepts}),
            }
        }
    );

const getByType = ({concepts = [], type = ''}) => concepts.filter(concept =>  type === concept.type);
const round = (number, precision) => {
    const prec = Math.pow(10, precision);
    return Math.round(number * prec) / prec;
};

const rank = ({concepts = [], indegree = true, outdegree = true}) => 
    concepts.sort((a, b) => {
        const valueA = (indegree ? a.indegree : 0) + (outdegree ? a.outdegree : 0);
        const valueB = (indegree ? b.indegree : 0) + (outdegree ? b.outdegree : 0);
        if (valueA === valueB) {
            return 0
        }
        return valueA > valueB ? -1 : 1;
    });

export const getMetrics = ({concepts = []}) => {
    concepts = getConceptsWithMetrics({concepts});
    const precision = 10;
    const numNodes = concepts.length;
    const numLinks = getNumberOfConnections(concepts);
    const drivers = getByType({concepts, type: 'driver'});
    const receivers = getByType({concepts, type: 'receiver'});
    const ordinay = getByType({concepts, type: 'ordinay'});
    return {
        numNodes,
        numRelationships: numLinks,
        numDrivers: drivers.length,
        numReceivers: receivers.length,
        numOrdinay: ordinay.length,
        density: round(numLinks / getPossibleNumberOfConnections(concepts), precision),
        relationshipsPerNode: numLinks / numNodes,
        complexity: receivers.length > 0 && drivers.length > 0 ? receivers.length / drivers.length: 0,
        drivers,
        driversRanked: rank({concepts, indegree: false}).slice(0, 5),
        receiversRanked: rank({concepts, outdegree: false}).slice(0, 5),
        centralityRanked: rank({concepts}).slice(0, 8),
    }
};
