import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from 'd3-force';

const NODE_SIZE = 125;
const SIMULATION_TICKS = 300;
const MARGIN = 40;

// Lays out concepts with a force simulation rather than a hierarchical layout
// (e.g. dagre): FCMs are built around feedback loops, so a layered/DAG-style
// layout has to fake-reverse edges to impose a hierarchy, producing tangled
// backward edges. A spring/repulsion simulation has no notion of hierarchy or
// edge direction, so cycles settle naturally instead of being fought against.
const layoutConcepts = (concepts) => {
    const nodes = concepts.map(({ id }) => ({ id }));
    const links = concepts.flatMap(({ id, relationships }) =>
        relationships.map(({ id: targetId }) => ({ source: id, target: targetId }))
    );

    const simulation = forceSimulation(nodes)
        .force('charge', forceManyBody().strength(-300))
        .force(
            'link',
            forceLink(links)
                .id(({ id }) => id)
                .distance(150)
        )
        .force('center', forceCenter(0, 0))
        .force('collide', forceCollide(NODE_SIZE / 1.5))
        .stop();

    for (let i = 0; i < SIMULATION_TICKS; i++) {
        simulation.tick();
    }

    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const xs = nodes.map(({ x }) => x);
    const ys = nodes.map(({ y }) => y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);

    concepts.forEach((concept) => {
        const node = nodeById.get(concept.id);
        concept.x = Math.round(node.x - minX + MARGIN);
        concept.y = Math.round(node.y - minY + MARGIN);
    });
};

// Parses the same adjacency-matrix shape as getMatrixRows()/exportCSV: a
// header row (top-left cell holds the model name, remaining cells are
// concept names), then one row per concept, in the same order as the header,
// with influence values in the matching columns.
export const importCSV = (rows = []) => {
    const [headerRow = [], ...dataRows] = rows;
    const [name = '', ...names] = headerRow;

    const concepts = names
        .map((conceptName, id) => (conceptName ? { id, name: `${conceptName}`.trim(), relationships: [] } : null))
        .filter(Boolean);

    dataRows.forEach((row, rowIndex) => {
        const concept = concepts[rowIndex];
        if (!concept) {
            return;
        }
        row.slice(1).forEach((value, columnIndex) => {
            const relatedConcept = concepts[columnIndex];
            const influence = parseFloat(value);
            if (relatedConcept && !isNaN(influence) && influence) {
                concept.relationships.push({ id: relatedConcept.id, name: relatedConcept.name, influence });
            }
        });
    });

    layoutConcepts(concepts);

    return { info: { name }, concepts };
};
