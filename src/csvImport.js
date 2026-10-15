import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from 'd3-force';

const NODE_SIZE = 125;
const SIMULATION_TICKS = 300;
const MARGIN = 40;

// A cell is an influence only if its whole trimmed text is a finite number; parseFloat would
// accept "1abc" as 1 and "Infinity" as Infinity. Anything else reads as 0 (skipped).
const parseCell = (value) => {
    const text = `${value ?? ''}`.trim();
    const parsed = text === '' ? NaN : Number(text);
    return Number.isFinite(parsed) ? parsed : 0;
};

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

    // Keep a slot per header column (null for blank headers) so row/column positions
    // stay aligned with the CSV; only drop the blanks once the matrix has been read.
    const slots = names.map((conceptName, id) => {
        const trimmed = `${conceptName ?? ''}`.trim();
        return trimmed ? { id, name: trimmed, relationships: [] } : null;
    });

    // Match each data row to its concept by the row label (first column), taking concepts of
    // the same name in order, so stray blank lines in the file don't shift later rows onto the
    // wrong concept. A row whose label matches nothing falls back to its position.
    const used = new Set();
    const findConceptForRow = (row, rowIndex) => {
        const label = `${row[0] ?? ''}`.trim().toLowerCase();
        if (!label) {
            return null;
        }
        const byLabel = slots.find((slot) => slot && !used.has(slot) && slot.name.toLowerCase() === label);
        const concept = byLabel || slots[rowIndex];
        return concept && !used.has(concept) ? concept : null;
    };

    dataRows.forEach((row, rowIndex) => {
        const concept = findConceptForRow(row, rowIndex);
        if (!concept) {
            return;
        }
        used.add(concept);
        row.slice(1).forEach((value, columnIndex) => {
            const relatedConcept = slots[columnIndex];
            const influence = parseCell(value);
            if (relatedConcept && influence) {
                concept.relationships.push({ id: relatedConcept.id, name: relatedConcept.name, influence });
            }
        });
    });

    const concepts = slots.filter(Boolean);
    layoutConcepts(concepts);

    return { info: { name }, concepts };
};
