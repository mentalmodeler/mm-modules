// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseMMP } from '../src/parser';

beforeEach(() => {
    vi.stubGlobal('alert', vi.fn());
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('parseMMP (JSON)', () => {
    it('returns the model unchanged when info.id is present', () => {
        const model = { info: { id: 'x', name: 'M' }, concepts: [] };
        expect(parseMMP(JSON.stringify(model))).toEqual(model);
    });

    it('backfills info.id when it is missing', () => {
        const result = parseMMP(JSON.stringify({ info: { name: 'M' }, concepts: [] }));
        expect(result.info.name).toBe('M');
        expect(result.info.id).toMatch(ID);
    });

    it('accepts a model with no info object at all', () => {
        const result = parseMMP(JSON.stringify({ concepts: [] }));
        expect(result.info.id).toMatch(ID);
        expect(alert).not.toHaveBeenCalled();
    });

    it('alerts and returns undefined for malformed input', () => {
        expect(parseMMP('{not json')).toBeUndefined();
        expect(alert).toHaveBeenCalledTimes(1);
    });
});

describe('parseMMP (XML)', () => {
    const xml = `<?xml version="1.0"?>
<mentalmodeler>
  <info><name>Pond</name></info>
  <concepts>
    <concept>
      <id>a</id><name>Algae</name>
      <relationships><relationship><id>b</id><influence>M+</influence></relationship></relationships>
    </concept>
    <concept><id>b</id><name>Fish</name></concept>
  </concepts>
</mentalmodeler>`;

    it('normalizes info, concepts, relationships and fuzzy influence codes', () => {
        const result = parseMMP(xml);
        expect(result.info.name).toBe('Pond');
        expect(result.info.id).toMatch(ID);
        expect(result.concepts.map(({ id, name }) => [id, name])).toEqual([['a', 'Algae'], ['b', 'Fish']]);
        expect(result.concepts[0].relationships).toEqual([{ id: 'b', influence: '.67' }]);
    });

    it('leaves out the relationships key for a concept that has none', () => {
        // Documents why compareModels has to tolerate a missing relationships list.
        expect(parseMMP(xml).concepts[1]).not.toHaveProperty('relationships');
    });
});
