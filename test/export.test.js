import { describe, expect, it } from 'vitest';
import { findRelationship, getMatrixRows, toCompareRefModel } from '../src/export';
import * as publicApi from '../index';

const a = { id: 'a', name: 'A', x: 10, y: 20, relationships: [{ id: 'b', influence: 0.5 }] };
const b = { id: 'b', name: 'B', x: 30, y: 40, relationships: [{ id: 'a', influence: '-0.25' }] };
const c = { id: 'c', name: 'C', x: 50, y: 60, relationships: [] };

describe('findRelationship', () => {
    it('finds the influencer relationship that targets the influencee', () => {
        expect(findRelationship(a, b)).toEqual({ id: 'b', influence: 0.5 });
    });

    it('returns undefined when there is no such relationship', () => {
        expect(findRelationship(a, c)).toBeUndefined();
    });

    it('tolerates a missing influencer or relationships list', () => {
        expect(findRelationship(undefined, a)).toBeUndefined();
        expect(findRelationship({ id: 'z' }, a)).toBeUndefined();
    });
});

describe('getMatrixRows', () => {
    it('builds a header row of concept names and one row per concept', () => {
        expect(getMatrixRows([a, b, c])).toEqual([
            ['', 'A', 'B', 'C'],
            ['A', '', 0.5, ''],
            ['B', '-0.25', '', ''],
            ['C', '', '', ''],
        ]);
    });

    it('keeps a zero influence as 0, not a blank cell', () => {
        const zero = { id: 'z', name: 'Z', relationships: [{ id: 'z', influence: 0 }] };
        expect(getMatrixRows([zero])[1]).toEqual(['Z', 0]);
    });

    it('returns just the empty header for no concepts, and defaults to none', () => {
        expect(getMatrixRows([])).toEqual([['']]);
        expect(getMatrixRows()).toEqual([['']]);
    });
});

describe('toCompareRefModel', () => {
    const model = { info: { name: 'M' }, groupNames: { 0: '' }, scenarios: [], concepts: [a, b] };

    it('flags the model as a compare ref', () => {
        expect(toCompareRefModel(model).compareRef).toBe(true);
    });

    it('strips x/y layout from every concept and keeps everything else', () => {
        const out = toCompareRefModel(model);
        expect(out.concepts).toEqual([
            { id: 'a', name: 'A', relationships: [{ id: 'b', influence: 0.5 }] },
            { id: 'b', name: 'B', relationships: [{ id: 'a', influence: '-0.25' }] },
        ]);
        expect(out.info).toEqual(model.info);
        expect(out.groupNames).toEqual(model.groupNames);
    });

    it('does not mutate the input model', () => {
        toCompareRefModel(model);
        expect(model.compareRef).toBeUndefined();
        expect(model.concepts[0].x).toBe(10);
        expect(model.concepts[0].y).toBe(20);
    });

    it('handles a missing model or concepts list', () => {
        expect(toCompareRefModel(undefined)).toEqual({ compareRef: true, concepts: [] });
        expect(toCompareRefModel({ info: {} }).concepts).toEqual([]);
    });
});

describe('public API', () => {
    it('exports the same functions from index.js', () => {
        expect(publicApi.findRelationship).toBe(findRelationship);
        expect(publicApi.getMatrixRows).toBe(getMatrixRows);
        expect(publicApi.toCompareRefModel).toBe(toCompareRefModel);
    });
});
