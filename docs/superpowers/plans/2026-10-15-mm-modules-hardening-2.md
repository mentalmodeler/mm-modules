# mm-modules Hardening, Part 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Work through the Minor findings deferred from the part 1 whole-branch review, one decision at a time, so the remaining edge-case crashes and silent mismatches in `mm-modules` are closed.

**Architecture:** Same approach as part 1: each task is test-first (write the failing test, watch it fail, make the smallest fix, commit), on top of the `test-harness-and-fixes` branch. Public export shapes in `index.js` do not change.

**Tech Stack:** Vitest ^5 and jsdom (already installed), `mathjs`, `d3-force`.

**Spec:** None. Scope is agreed item by item in conversation. Part 1 is `docs/superpowers/plans/2026-10-15-mm-modules-hardening.md` (executed). Source of the items: the part 1 final review, findings #3-#8.

## Status of this plan

All six deferred Minors are decided and written up as Tasks 1-6, ready to execute. "Backlog candidates" at the end are NOT decided and must not be executed.

## Global Constraints

- `src/` is browser-targeted: no Node-only APIs (`fs`, `path`, `process`, `Buffer`) in `src/` or `index.js`.
- `index.js` is the only public surface. Do not rename or remove any existing export; new exports must also be added to `index.js`.
- Return shapes of `parseMMP`, `compareModels`, `getMetrics`, `getConceptsWithMetrics`, `runScenario`, `importCSV` must not change (consumers: `mentalmodeler-suite`, `mm-compare`). Adding a field is a shape change; don't.
- Name-based matching (`normalize` in `compare.js`) is load-bearing: concepts/relationships are matched across models by normalized name, never by id.
- Influences are read as numbers only through `toInfluence()` (`src/influence.js`).
- No new runtime dependencies.
- Match surrounding style: 4-space indent, single quotes, semicolons, ES module `import`/`export` with extensionless relative paths.
- Every commit message ends with the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A student file with a nameless concept, `relationships: null`, or no `concepts` key must not stop the comparison of the other files. [Task 1]
2. An edge pointing at a concept id that doesn't exist must not score for, or against, a student. [Task 2]
3. A student who duplicates a concept (same name twice) must not score more than one canonical edge is worth. [Task 3]
4. A bad `?demo` URL must tell the user and must not add a junk model. [Task 4]
5. A CSV cell like `1abc` or `Infinity` must not become an influence. [Task 5]
6. XML with no `<info>`, and JSON that is not an object, must behave like the other inputs. [Task 6]

## Tasks

### Task 1: Make compare and metrics tolerant of malformed models (review finding #3)

**Files:**
- Modify: `src/compare.js` (`normalize`, `getRelationships`, concept lists, `compareModels`), `src/metrics.js` (`getInfluencees`, `getOutdegree`)
- Test: `test/compare.test.js`, `test/metrics.test.js`

**Interfaces:**
- Consumes: `compareModels` from `src/compare`, `getMetrics` from `src/metrics`, `concept`/`rel` from `test/fixtures`.
- Produces: no signature or return-shape change. `compareModels`/`getMetrics` stop throwing on: a concept with a missing, `null` or non-string `name`; `relationships: null`; a model with no `concepts` key.

**Known and accepted:** two unnamed concepts both normalize to `''`, so an unnamed concept in the canonical model and one in a student model match each other. Rare, and not worth special cases.

- [ ] **Step 1: Branch check**

Run: `git rev-parse --abbrev-ref HEAD`
Expected: `test-harness-and-fixes` (or a branch created from it). If on `main` with part 1 already merged, that is fine too; just don't branch from anything older.

- [ ] **Step 2: Write the failing tests (append to `test/compare.test.js`)**

```js
describe('compareModels with malformed models', () => {
    const compare = (canon, student) =>
        compareModels({ modelsJSON: [{ id: 'c', ...canon }, { id: 's', ...student }], canonicalId: 'c' }).s;

    it('does not throw on a concept with a missing, null or non-string name', () => {
        const canon = { concepts: [{ id: 'a', name: 'A' }, { id: 'b' }] };
        const student = { concepts: [{ id: 'a', name: 'A' }, { id: 'b', name: null }, { id: 'c', name: 5 }] };
        const result = compare(canon, student);
        expect(result.nodes.present.map(({ id }) => id)).toEqual(['a', 'b']);
        expect(result.nodes.extra.map(({ id }) => id)).toEqual(['c']);
        expect(result.numNodes).toBe(3);
    });

    it('treats relationships: null as no relationships', () => {
        const canon = { concepts: [{ id: 'a', name: 'A', relationships: null }] };
        const student = { concepts: [{ id: 'a', name: 'A', relationships: null }] };
        const result = compare(canon, student);
        expect(result.score).toBe(0);
        expect(result.numRelationships).toBe(0);
    });

    it('treats a missing concepts key on the student as an empty model', () => {
        const result = compare({ concepts: [{ id: 'a', name: 'A' }] }, {});
        expect(result.nodes.missing.map(({ name }) => name)).toEqual(['A']);
        expect(result.nodes.present).toEqual([]);
        expect(result.numNodes).toBe(0);
    });

    it('treats a missing concepts key on the canonical model as an empty model', () => {
        const result = compare({}, { concepts: [{ id: 'a', name: 'A' }] });
        expect(result.nodes.extra.map(({ name }) => name)).toEqual(['A']);
        expect(result.nodes.missing).toEqual([]);
    });
});
```

- [ ] **Step 3: Write the failing metrics test (append to `test/metrics.test.js`)**

```js
describe('getMetrics with null relationships', () => {
    it('treats relationships: null as none', () => {
        const result = getMetrics({
            concepts: [{ id: 'a', name: 'A', relationships: null }, concept('b', 'B', [rel('a', 1)])],
        });
        expect(result.numRelationships).toBe(1);
        expect(result.numDrivers).toBe(1);
        expect(result.numReceivers).toBe(1);
    });
});
```

- [ ] **Step 4: Run to see them fail**

Run: `npm test`
Expected: the 4 compare tests and the metrics test FAIL with `TypeError`s (`Cannot read properties of undefined (reading 'toLowerCase')`, `... of null (reading 'map')` / `'filter'` / `'reduce'`, `... of undefined (reading 'map')`). Everything else passes. If any of them passes, the premise is wrong for that case: stop and report.

- [ ] **Step 5: Fix `src/compare.js`**

Change `normalize`:

```js
const normalize = name => String(name ?? '').toLowerCase().trim(); 
```

In `compareModel`, make `getRelationships` null-safe. Replace its parameter list so a `null` list is handled (the default `= []` only covers `undefined`):

```js
    const getRelationships = ({name: fromName, id: fromId, relationships}, _, nodes) => (
        (relationships || []).map(({name, id, influence}) => ({
```

(keep the object-literal body and closing exactly as they are.) Then replace the four concept-list lines near the end of the setup block:

```js
    const canonicalConcepts = canonical.concepts || [];
    const modelConcepts = model.concepts || [];
    const canonicalNodes = canonicalConcepts.map(getNode);
    const modelNodes = modelConcepts.map(getNode);
    const canonicalRelationships = canonicalConcepts.flatMap(getRelationships);
    const modelRelationships = modelConcepts.flatMap(getRelationships);
```

In `compareModels`, pass a safe list to `getMetrics`:

```js
                ...getMetrics({concepts: model.concepts || []}),
```

- [ ] **Step 6: Fix `src/metrics.js`**

```js
const getInfluencees = ({id = '', concepts = []}) => 
    concepts.flatMap(
        ({relationships}) => (relationships || []).filter((relationship) => relationship.id === id)
    );
```

and

```js
const getOutdegree = (relationships) =>
    (relationships || []).reduce(
        (acc, {influence}) => acc + parseInfluence(influence)    
    , 0);
```

- [ ] **Step 7: Run all tests**

Run: `npm test`
Expected: all PASS (48 tests: the 43 existing plus the 5 added here).

- [ ] **Step 8: Commit**

```bash
git add src/compare.js src/metrics.js test/compare.test.js test/metrics.test.js
git commit -m "Make compare and metrics tolerate nameless concepts, null relationships and missing concepts" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 2: Ignore dangling relationships in compare (review finding #4)

A relationship whose target id doesn't exist in its own model is not a real relationship. Today `compare` resolves such a target to a placeholder named `[not found]`, so a dangling edge in the canonical model and one in a student model match each other and score +1. Decided with the user: drop these edges from the comparison on both sides.

**Files:**
- Modify: `src/compare.js` (`getRelationships`)
- Test: `test/compare.test.js`

**Interfaces:**
- Consumes: `compareModels` from `src/compare`, `concept`/`rel` from `test/fixtures`.
- Produces: no signature or return-shape change. Dangling edges never appear in `extra`, `missing`, `reversed`, `correctlySigned` or `incorrectlySigned`. They still count in `numRelationships` from `getMetrics` (unchanged: that is a count of the stored edges).

- [ ] **Step 1: Write the failing tests (append to `test/compare.test.js`)**

```js
describe('compareModels with dangling relationships', () => {
    const compare = (canon, student) =>
        compareModels({ modelsJSON: [{ id: 'c', ...canon }, { id: 's', ...student }], canonicalId: 'c' }).s;

    it('does not match a dangling edge in one model with a dangling edge in the other', () => {
        const canon = { concepts: [concept('a', 'A', [rel('zzz', 1)])] };
        const student = { concepts: [concept('a', 'A', [rel('yyy', 1)])] };
        const result = compare(canon, student);
        expect(result.relationships.correctlySigned).toEqual([]);
        expect(result.relationships.extra).toEqual([]);
        expect(result.relationships.missing).toEqual([]);
        expect(result.score).toBe(0);
    });

    it('does not count a dangling student edge as extra', () => {
        const canon = { concepts: [concept('a', 'A', [rel('b', 1)]), concept('b', 'B')] };
        const student = { concepts: [concept('a', 'A', [rel('b', 1), rel('ghost', 1)]), concept('b', 'B')] };
        const result = compare(canon, student);
        expect(result.relationships.extra).toEqual([]);
        expect(result.score).toBe(1);
    });

    it('does not count a dangling canonical edge as missing', () => {
        const canon = { concepts: [concept('a', 'A', [rel('b', 1), rel('ghost', 1)]), concept('b', 'B')] };
        const student = { concepts: [concept('a', 'A', [rel('b', 1)]), concept('b', 'B')] };
        const result = compare(canon, student);
        expect(result.relationships.missing).toEqual([]);
        expect(result.score).toBe(1);
    });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test`
Expected: the 3 new tests FAIL. First: `correctlySigned` has 1 entry and score is 1 (both edges resolve to `A -> [not found]`). Second: `extra` has the `A -> [not found]` edge and score is 0. Third: `missing` has the `A -> [not found]` edge and score is 0. All other tests pass.

- [ ] **Step 3: Fix `getRelationships` in `src/compare.js`**

After Task 1 it reads `(relationships || []).map(...)`. Filter first, so only edges whose target exists in the same model are kept (`nodes` is the third argument `flatMap` passes: the model's concept array):

```js
    const getRelationships = ({name: fromName, id: fromId, relationships}, _, nodes) => (
        (relationships || [])
            .filter(({id}) => nodes.some((node) => node.id === id))
            .map(({name, id, influence}) => ({
```

Keep the object-literal body and closing exactly as they are (re-indent the `({ ... })` body one level if your formatter requires it). Leave `findNode`'s `'[not found]'` fallback in place; it is now unreachable from here but harmless, and removing it is not part of this task.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: all PASS (51 tests: 48 after Task 1 plus the 3 added here).

- [ ] **Step 5: Commit**

```bash
git add src/compare.js test/compare.test.js
git commit -m "Ignore relationships whose target concept doesn't exist when comparing models" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 3: Count each relationship once per model in compare (review finding #5)

Concepts are matched by normalized name, so two concepts in one model named `A` and `'a '` produce the same relationship key. Today each copy matches the canonical edge separately (score inflation), and a conflicting-sign duplicate shows up in no bucket. Decided with the user (option A): within each model, a relationship key counts at most once; the first occurrence in model order wins and later duplicates are ignored. Nodes are unchanged: both duplicates stay in `nodes.present`.

**Files:**
- Modify: `src/compare.js` (add `uniqueRelationships`, apply it to both relationship lists)
- Test: `test/compare.test.js`

**Interfaces:**
- Consumes: `relationshipKey(fromNode, toNode)` already in `src/compare.js`; `compareModels`, `concept`, `rel`.
- Produces: no signature or return-shape change. In the result, no relationship key appears twice within `extra`, `missing`, `reversed`, `correctlySigned` or `incorrectlySigned`.

**Known and accepted:** if a student draws the same edge twice with conflicting signs, only the first (in model order) is scored. The second is not flagged.

- [ ] **Step 1: Write the failing tests (append to `test/compare.test.js`)**

```js
describe('compareModels with duplicate concept names', () => {
    const compare = (canon, student) =>
        compareModels({ modelsJSON: [{ id: 'c', ...canon }, { id: 's', ...student }], canonicalId: 'c' }).s;

    const canonAtoB = { concepts: [concept('a', 'A', [rel('b', 1)]), concept('b', 'B')] };

    it('scores a duplicated student edge once, not once per copy', () => {
        const student = {
            concepts: [concept('a1', 'A', [rel('b', 1)]), concept('a2', 'a ', [rel('b', 1)]), concept('b', 'B')],
        };
        const result = compare(canonAtoB, student);
        expect(result.relationships.correctlySigned).toHaveLength(1);
        expect(result.score).toBe(1);
        expect(result.nodes.present).toHaveLength(3);
    });

    it('lets the first duplicate in model order decide the sign', () => {
        const student = {
            concepts: [concept('a1', 'A', [rel('b', -1)]), concept('a2', 'a ', [rel('b', 1)]), concept('b', 'B')],
        };
        const result = compare(canonAtoB, student);
        expect(result.relationships.correctlySigned).toHaveLength(0);
        expect(result.relationships.incorrectlySigned).toHaveLength(1);
        expect(result.score).toBe(0);
    });

    it('counts a duplicated canonical edge as missing once', () => {
        const canon = {
            concepts: [concept('a1', 'A', [rel('b', 1)]), concept('a2', 'a ', [rel('b', 1)]), concept('b', 'B')],
        };
        const student = { concepts: [concept('a', 'A'), concept('b', 'B')] };
        const result = compare(canon, student);
        expect(result.relationships.missing).toHaveLength(1);
        expect(result.score).toBe(-1);
    });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test`
Expected: all 3 new tests FAIL. First: `correctlySigned` has 2 entries and score is 2. Second: `correctlySigned` has 1 entry (the second copy, `+1`, matches) and `incorrectlySigned` has 0. Third: `missing` has 2 entries and score is -2. Everything else passes.

- [ ] **Step 3: Add `uniqueRelationships` and use it in `src/compare.js`**

Add next to `relationshipKey` at the top of the file:

```js
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
```

and wrap the two relationship lists in `compareModel` (the lines Task 1 left reading `canonicalConcepts.flatMap(getRelationships)` and `modelConcepts.flatMap(getRelationships)`):

```js
    const canonicalRelationships = uniqueRelationships(canonicalConcepts.flatMap(getRelationships));
    const modelRelationships = uniqueRelationships(modelConcepts.flatMap(getRelationships));
```

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: all PASS (54 tests: 51 after Task 2 plus the 3 added here).

- [ ] **Step 5: Commit**

```bash
git add src/compare.js test/compare.test.js
git commit -m "Count each relationship once per model when comparing, so duplicate concept names can't inflate scores" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 4: Tell the user when a `?demo` model fails to load (review finding #6, in `mentalmodeler-suite`)

Part 1 made `loadURL` reject on a non-2xx response (before, a 404 page body was handed to the parser, which alerted and produced a junk model). `-suite`'s `loadInitFile` has no `try/catch`, so a failed `?demo=<url>` is now an unhandled rejection with no message. Decided with the user: alert, matching how `-suite` reports other failures, and add no model. The logic moves into a small testable function.

**This task runs in the `mentalmodeler-suite` repo, not `mm-modules`.** It touches no `mm-modules` code and its test mocks `mm-modules`, so it does not depend on the part 1 branch being merged. Use its own branch there and do not commit to `mentalmodeler-suite`'s `main`.

**Files (all under `/Users/jonathan/Workspace/jonathanelbom/mentalmodeler/mentalmodeler-suite`):**
- Create: `src/services/loadDemoModel.js`, `src/services/loadDemoModel.test.js`
- Modify: `src/App.jsx` (the `import { loadAndParseURL } from 'mm-modules';` line and `loadInitFile`)

**Interfaces:**
- Consumes: `loadAndParseURL(url): Promise<model | undefined>` from `mm-modules` (rejects with a `DOMException` if the request fails or returns non-2xx; resolves to `undefined` after alerting if the content can't be parsed).
- Produces: `loadDemoModel(url): Promise<model | null>`. Resolves to `{...model, filename}` on success, or `null` after the user has been told what went wrong (it alerts on a failed request; on unparseable content `parseMMP` has already alerted, so it does not alert again).

- [ ] **Step 1: Branch**

```bash
cd /Users/jonathan/Workspace/jonathanelbom/mentalmodeler/mentalmodeler-suite
git status -sb   # expect a clean tree on main
git checkout -b demo-load-errors
```

- [ ] **Step 2: Write the failing tests: `src/services/loadDemoModel.test.js`**

```js
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadAndParseURL } from 'mm-modules';
import { loadDemoModel } from './loadDemoModel';

vi.mock('mm-modules', () => ({ loadAndParseURL: vi.fn() }));

beforeEach(() => {
    vi.stubGlobal('alert', vi.fn());
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    loadAndParseURL.mockReset();
});

describe('loadDemoModel', () => {
    it('returns the parsed model with a filename taken from the url', async () => {
        loadAndParseURL.mockResolvedValue({ info: { name: 'Fire' }, concepts: [] });
        const model = await loadDemoModel('/models/fire_model.mmp');
        expect(model).toEqual({ info: { name: 'Fire' }, concepts: [], filename: 'fire_model' });
        expect(alert).not.toHaveBeenCalled();
    });

    it('alerts and returns null when the request fails', async () => {
        loadAndParseURL.mockRejectedValue(new DOMException('MMP url loading failed!'));
        await expect(loadDemoModel('/models/missing.mmp')).resolves.toBeNull();
        expect(alert).toHaveBeenCalledTimes(1);
        expect(alert.mock.calls[0][0]).toContain('/models/missing.mmp');
    });

    it('returns null without a second alert when the content could not be parsed', async () => {
        // parseMMP has already alerted by the time it resolves to undefined.
        loadAndParseURL.mockResolvedValue(undefined);
        await expect(loadDemoModel('/models/bad.mmp')).resolves.toBeNull();
        expect(alert).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 3: Run to see them fail**

Run: `npx vitest run src/services/loadDemoModel.test.js`
Expected: FAIL, `Failed to resolve import "./loadDemoModel"` (the module does not exist yet).

- [ ] **Step 4: Create `src/services/loadDemoModel.js`**

```js
import { loadAndParseURL } from 'mm-modules';

// Loads the model named by the `?demo` query param. Resolves to the model (with a `filename`),
// or null when it couldn't be loaded -- in which case the user has already been told why.
export const loadDemoModel = async (url) => {
    const filename = url.substring(url.lastIndexOf('/') + 1, url.indexOf('.'));
    let model;
    try {
        model = await loadAndParseURL(url);
    } catch (error) {
        console.error('loadDemoModel failed:', error);
        alert(`Could not load a model from ${url}`);
        return null;
    }
    if (!model) {
        // parseMMP already alerted that the content couldn't be parsed.
        return null;
    }
    return { ...model, filename };
};
```

(The `filename` expression is copied unchanged from `App.jsx`. Note it cuts at the first `.` in the whole URL, so a URL with a dot in its host gives a wrong name. That is pre-existing and out of scope here.)

- [ ] **Step 5: Run the new tests**

Run: `npx vitest run src/services/loadDemoModel.test.js`
Expected: 3 PASS.

- [ ] **Step 6: Use it in `src/App.jsx`**

Change the import:

```js
import { loadDemoModel } from './services/loadDemoModel';
```

(replacing `import { loadAndParseURL } from 'mm-modules';`), and inside `loadInitFile` replace everything from `const filename = ...` through the `dispatch(...)` call with:

```js
                const url = _url ? _url : altUrl;
                const model = await loadDemoModel(url);
                if (!model) {
                    return;
                }
                dispatch({
                    type: 'models/addModel',
                    payload: {
                        field: '',
                        value: model,
                    },
                });
```

Keep the existing comment above `altUrl` and the `altUrl` line itself. `loadDemoModel` already adds `filename`, so the old `...model, filename` spread goes away.

- [ ] **Step 7: Verify the whole app**

```bash
npx vitest run
npm run lint
npm run build 2>&1 | tail -4
```

Expected: all tests PASS (the 19 existing plus 3), lint reports no errors for the touched files, build succeeds (the chunk-size warning is pre-existing).

- [ ] **Step 8: Commit (in the `mentalmodeler-suite` repo)**

```bash
git add src/services/loadDemoModel.js src/services/loadDemoModel.test.js src/App.jsx
git commit -m "Alert and skip adding a model when the ?demo model fails to load" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

Do not push or merge. Report the branch name to the user.

---

### Task 5: Read CSV cells strictly in `importCSV` (review finding #7)

`importCSV` uses `parseFloat`, which stops at the first non-numeric character and accepts `Infinity`. So `1abc` imports as `1`, and `Infinity` is stored as `Infinity`, which every downstream `toInfluence()` read then treats as 0. Decided with the user (option A, no clamp): a cell counts only if its whole trimmed text is a finite number. Anything else (`1abc`, `Infinity`, `H+`) is skipped like a blank cell, zero is still skipped, and out-of-range numbers such as `5` are imported as written. Fuzzy codes in CSV are not supported (no such CSV found).

**Files:**
- Modify: `src/csvImport.js` (the `parseFloat` lines in `importCSV`)
- Test: `test/csvImport.test.js` (append inside the existing `describe`)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `importCSV(rows)` with the same return shape; only which cells become relationships changes. `influence` stays a number.

- [ ] **Step 1: Write the failing tests** (append before the final `});` of `test/csvImport.test.js`)

```js
    it('skips cells that are not wholly a finite number', () => {
        const messy = [
            ['M', 'A', 'B', 'C', 'D'],
            ['A', '', '1abc', 'Infinity', 'H+'],
            ['B', '', '', '', ''],
            ['C', '', '', '', ''],
            ['D', '', '', '', ''],
        ];
        const { concepts } = importCSV(messy);
        expect(concepts[0].relationships).toEqual([]);
    });

    it('imports plain numeric cells as written, trimmed and unclamped', () => {
        const numeric = [
            ['M', 'A', 'B', 'C'],
            ['A', '', ' 0.5 ', '5'],
            ['B', '-2', '', ''],
            ['C', '', '', ''],
        ];
        const { concepts } = importCSV(numeric);
        expect(concepts[0].relationships).toEqual([
            { id: 1, name: 'B', influence: 0.5 },
            { id: 2, name: 'C', influence: 5 },
        ]);
        expect(concepts[1].relationships).toEqual([{ id: 0, name: 'A', influence: -2 }]);
    });
```

- [ ] **Step 2: Run to verify RED**

Run: `npx vitest run test/csvImport.test.js`
Expected: the first new test FAILS (`1abc` and `Infinity` produce relationships); the second passes already (it pins behavior that must survive the fix). Total 2 new tests, 1 failing.

- [ ] **Step 3: Implement.** In `src/csvImport.js`, add above `layoutConcepts`'s caller (after the `MARGIN` constant):

```js
// A cell is an influence only if its whole trimmed text is a finite number; parseFloat would
// accept "1abc" as 1 and "Infinity" as Infinity. Anything else reads as 0 (skipped).
const parseCell = (value) => {
    const text = `${value ?? ''}`.trim();
    const parsed = text === '' ? NaN : Number(text);
    return Number.isFinite(parsed) ? parsed : 0;
};
```

and replace

```js
            const influence = parseFloat(value);
            if (relatedConcept && !isNaN(influence) && influence) {
```

with

```js
            const influence = parseCell(value);
            if (relatedConcept && influence) {
```

- [ ] **Step 4: Run to verify GREEN, then the whole suite**

Run: `npx vitest run`
Expected: all pass, 56 tests (54 + 2).

- [ ] **Step 5: Commit**

```bash
git add src/csvImport.js test/csvImport.test.js
git commit -m "Read CSV influence cells strictly: whole-cell finite numbers only" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Make `parseMMP` consistent across inputs (review finding #8)

Decided with the user: (1) XML with no `<info>` element gets `info: {id}` like the JSON path; (2) JSON that parses to something other than a plain object (`null`, a number, a string, an array) takes the existing alert-and-return-`undefined` path. Not fixing `"info": "x"` (a string `info`): nothing produces it.

**Files:**
- Modify: `src/parser.js` (`parseMMP`, `parseXML`)
- Test: `test/parser.test.js`

**Interfaces:**
- Consumes: `makeId` (already imported in `parser.js`).
- Produces: `parseMMP(text)` returns a model with `info.id` for both XML and JSON, or `undefined` after one `alert` for unparseable input or a non-object JSON value. Return shape otherwise unchanged.

- [ ] **Step 1: Write the failing tests**

In `describe('parseMMP (JSON)')`, after the "malformed input" test:

```js
    it.each(['null', '5', '"x"', '[]'])('alerts and returns undefined for non-object JSON %s', (text) => {
        expect(parseMMP(text)).toBeUndefined();
        expect(alert).toHaveBeenCalledTimes(1);
    });
```

In `describe('parseMMP (XML)')`, after the last test:

```js
    it('backfills info.id when the XML has no info element', () => {
        const noInfo = `<?xml version="1.0"?><mentalmodeler><concepts><concept><id>a</id><name>Algae</name></concept></concepts></mentalmodeler>`;
        const result = parseMMP(noInfo);
        expect(result.info.id).toMatch(ID);
        expect(result.concepts).toHaveLength(1);
    });
```

- [ ] **Step 2: Run to verify RED**

Run: `npx vitest run test/parser.test.js`
Expected: FAIL. `null` alerts but with a TypeError (that case may already pass; the `5`, `"x"` and `[]` cases fail because a value is returned and nothing is alerted; `[]` and strings hit `js.info = ...` oddities), and the XML test fails with `info` undefined. At least the `5`, `"x"` and XML tests must fail; if one of them passes, stop and investigate.

- [ ] **Step 3: Implement**

In `parseMMP`, directly after `const js = JSON.parse(mmp);`:

```js
            if (!js || typeof js !== 'object' || Array.isArray(js)) {
                throw new Error('Not a model object.');
            }
```

In `parseXML`, directly before `return json;`:

```js
    if (!json.info && excludeArray.indexOf('info') === -1) {
        json.info = {id: makeId()};
    }
```

- [ ] **Step 4: Run to verify GREEN, then the whole suite**

Run: `npx vitest run`
Expected: all pass, 61 tests (56 + 5: four `it.each` cases and one XML test).

- [ ] **Step 5: Commit**

```bash
git add src/parser.js test/parser.test.js
git commit -m "parseMMP: backfill info on XML without it; reject non-object JSON" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Backlog candidates (noticed during part 1, not review findings)

Not decided; do not execute.

- Fuzzy codes (`M+`, `H-`) are only converted on the XML path; a JSON model containing them reads as 0 everywhere. Possible fix: move the code map into `influence.js` so `toInfluence('M+')` returns `.67` on every path. Only worth doing if JSON models with fuzzy codes exist (none found in the repos).
- `parseFloat('1,5')` is 1 (decimal-comma locales). `Number()` would be stricter but changes odd-input behavior.
- `test/scenario.test.js`'s tanh "does not settle" test now prints a `console.warn` line during runs; silence it with a `vi.spyOn(console, 'warn')`.
- Reviewer's "declined to judge" items: internal-whitespace names (`"Water  quality"` vs `"Water quality"`) don't match; density can exceed 1 with self-loops; rankings include concepts of other types; an edge with a blank influence counts in `numRelationships` but leaves the concept's type as `none`.
- Long-term: scenario calculation is planned to move to a web service, which would make `runScenario`'s cap and averaging a stopgap for the remaining client-side cases.
