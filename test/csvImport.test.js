import { describe, expect, it } from 'vitest';
import { importCSV } from '../src/csvImport';

const rows = [
    ['My model', 'A', 'B', 'C'],
    ['A', '', '0.5', ''],
    ['B', '-1', '', '0.25'],
    ['C', '', '', ''],
];

describe('importCSV', () => {
    it('builds concepts and relationships from the adjacency matrix', () => {
        const { info, concepts } = importCSV(rows);
        expect(info).toEqual({ name: 'My model' });
        expect(concepts.map(({ id, name }) => [id, name])).toEqual([[0, 'A'], [1, 'B'], [2, 'C']]);
        expect(concepts[0].relationships).toEqual([{ id: 1, name: 'B', influence: 0.5 }]);
        expect(concepts[1].relationships).toEqual([
            { id: 0, name: 'A', influence: -1 },
            { id: 2, name: 'C', influence: 0.25 },
        ]);
        expect(concepts[2].relationships).toEqual([]);
    });

    it('lays concepts out at positive integer coordinates, deterministically', () => {
        const first = importCSV(rows).concepts;
        const second = importCSV(rows).concepts;
        expect(first.map(({ x, y }) => [x, y])).toEqual(second.map(({ x, y }) => [x, y]));
        first.forEach(({ x, y }) => {
            expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true);
            expect(x).toBeGreaterThanOrEqual(40);
            expect(y).toBeGreaterThanOrEqual(40);
        });
    });

    it('returns an empty model for empty input', () => {
        expect(importCSV([])).toEqual({ info: { name: '' }, concepts: [] });
    });

    it('keeps relationships on the right concepts when a header cell and its row are blank', () => {
        const withBlank = [
            ['M', 'A', '', 'C'],
            ['A', '', '', '0.5'],
            ['', '', '', ''],
            ['C', '1', '', ''],
        ];
        const { concepts } = importCSV(withBlank);
        expect(concepts.map(({ name }) => name)).toEqual(['A', 'C']);
        expect(concepts[0].relationships).toEqual([{ id: 2, name: 'C', influence: 0.5 }]);
        expect(concepts[1].relationships).toEqual([{ id: 0, name: 'A', influence: 1 }]);
    });
});
