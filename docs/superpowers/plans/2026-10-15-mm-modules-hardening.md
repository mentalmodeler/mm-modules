# mm-modules Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `mm-modules` a test suite, then use it to fix the bugs found while reading the code (broken ID helper, hang-prone scenario loop, name-matching in `compareModels`, `importCSV` column misalignment, parser/loader edge cases) and remove dead code.

**Architecture:** Add Vitest (plus jsdom for the browser-API modules). Each task is test-first: write a test that pins the behavior, watch it fail (or, for characterization tests, pass), fix the code, commit. Public export shapes in `index.js` do not change, so `mentalmodeler-suite` and `mm-compare` keep working unmodified.

**Tech Stack:** Vitest ^5.0.3 and jsdom ^30.1.2 (same versions as `mentalmodeler-js`), existing runtime deps `mathjs` and `d3-force`.

**Spec:** None. Scope was agreed in conversation on 2026-10-15 (items 1, 2, 4, 5 of the `mm-modules` review, plus the extra bugs listed under "Findings" below). Out of scope: moving `toCompareRefModel`/`getMatrixRows` into `mm-modules`, `package.json` `exports`/`files`/version changes, a `.mmp` XML writer.

## Global Constraints

- `src/` is browser-targeted: no Node-only APIs (`fs`, `path`, `process`, `Buffer`) in `src/` or `index.js`.
- `index.js` is the only public surface. Do not rename or remove any existing export; new exports must also be added to `index.js`.
- Name-based matching (`normalize` in `compare.js`) is load-bearing: concepts/relationships are matched across models by normalized name, never by id.
- No new runtime dependencies. New dev dependencies are limited to `vitest` and `jsdom`.
- Match surrounding style: 4-space indent, single quotes, semicolons, ES module `import`/`export` with extensionless relative paths.
- Return shapes of `parseMMP`, `compareModels`, `getMetrics`, `getConceptsWithMetrics`, `runScenario`, `importCSV` must not change (consumers: `mentalmodeler-suite`, `mm-compare`).
- Every commit message ends with the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Findings (what this plan fixes, found by reading the code)

| # | Where | Problem |
|---|---|---|
| F1 | `index.js`, `parser.js` | Two diverged `makeId`s. `getChars(n)` does `slice(-(n - 15))`, which for n=8 is `slice(7)`, so segments are *not* n characters long. |
| F2 | `scenario.js` `converge` | `while (diff > epsilon)` has no iteration cap. A feedback loop with weights whose product is ±1 under `tanh` shrinks only like 1/√n, so it effectively never converges and freezes the UI. (By analysis, not yet observed; Task 2 confirms it.) |
| F3 | `compare.js` | Relationship identity is `normalize(from.name + to.name)`. Trailing space or case in one name breaks the match (`' water '+'Fish'` ≠ `'water'+'Fish'`), and `'ab'+'c'` collides with `'a'+'bc'`. `correctlySigned` also builds its key from the *relationship's* `name` for both sides. `.mmp` influences are strings, so the intended `x === 0 && y === 0` branch never fires and a 0-vs-0 edge is wrongly "incorrectly signed" (decided 2026-10-15: fix it, 0-vs-0 counts as correct; this raises scores by 1 per such edge, so mention it in the release note). |
| F10 | `scenario.js`, `compare.js`, `metrics.js` | Influence strings are converted in three different ways: `parseFloat` in `scenario.js`/`metrics.js` (metrics falls back to 0 on NaN, scenario does not), implicit coercion (`x > 0`) plus strict `=== 0` in `compare.js`. In `scenario.js`, one relationship with a blank or missing influence makes the weight `NaN`; `converge` then exits after one pass (`NaN > epsilon` is false) and every result is `NaN`. Task 2 adds one `toInfluence()` helper used by all three. |
| F4 | `compare.js` | A concept with no `relationships` key (which `parseMMP` produces for XML concepts with no relationships) makes `getRelationships` return `undefined`, and `compareModel` then throws a `TypeError`. |
| F5 | `metrics.js` | `rank` sorts the shared `concepts` array in place, so each ranking depends on the previous call's ordering for ties. `density` and `relationshipsPerNode` are `NaN` for 0 or 1 concepts. |
| F6 | `csvImport.js` | Blank header cells are filtered out *before* rows/columns are indexed, so one blank header shifts every later row and column onto the wrong concept. |
| F7 | `parser.js` | JSON with no `info` key throws inside `parseMMP`'s try block, which alerts "Parsing of mmp failed!" for an otherwise valid model. `parseXML` has a leftover `console.log`. |
| F8 | `loader.js` | `loadURL` ignores `response.ok`, so a 404 page body is returned as if it were a model. Async promise executor anti-pattern. |
| F9 | `scenario.js` | `converge` computes `W × v` (`multiply(weightMat, previousVec)`). The legacy `mentalmodeler-scenario` computes `v × W` (`math.multiply(prevStateVec, weightMatrix)`) from the same row-per-source matrix. That is the transpose, so scenario influence may flow against the arrow direction. Decided 2026-10-15 with the original engineer: fix (Task 7). |

## Review Focus

Failure modes the code implies but a happy-path test would not catch, most likely first. Each has a test in the task named in brackets.

1. A model whose concepts lack a `relationships` key (every XML model with a leaf concept) must not crash comparison. [Task 3, `compare.test.js`]
2. A feedback-loop model run with `tanh` must return instead of hanging. [Task 2, `scenario.test.js`]
3. Concept names with stray whitespace or different case must still match across models. [Task 3, `compare.test.js`]
4. Empty and single-concept models must give `0`, not `NaN`, for density and relationships-per-node. [Task 3, `metrics.test.js`]
5. A CSV with a blank header cell and a blank row must keep every other relationship attached to the right concepts. [Task 4, `csvImport.test.js`]

## File Structure

| File | Responsibility |
|---|---|
| `package.json` | Add `test` / `test:watch` scripts and two dev dependencies |
| `test/fixtures.js` (new) | `concept()` and `rel()` builders shared by tests |
| `test/scenario.test.js` (new) | `getWeightMatrix`, `runScenario` |
| `test/metrics.test.js` (new) | `getConceptsWithMetrics`, `getMetrics` |
| `test/compare.test.js` (new) | `compareModels` |
| `test/csvImport.test.js` (new) | `importCSV` |
| `test/id.test.js` (new) | `makeId` |
| `test/parser.test.js` (new, jsdom) | `parseMMP` JSON and XML paths |
| `test/loader.test.js` (new, jsdom) | `loadFile`, `loadURL` |
| `src/id.js` (new) | The single `makeId` implementation |
| `src/scenario.js`, `src/compare.js`, `src/metrics.js`, `src/csvImport.js`, `src/parser.js`, `src/loader.js`, `index.js` | Fixes listed per task |
| `CLAUDE.md`, `README.md` | Document the test setup and the behavior changes |

---

### Task 1: Test harness and scenario baseline

**Files:**
- Modify: `package.json`
- Create: `test/fixtures.js`, `test/scenario.test.js`

**Interfaces:**
- Produces: `concept(id, name, relationships)` and `rel(id, influence)` from `test/fixtures.js`, used by every later test file. `rel` always stores `influence` as a string (that is the on-disk shape).

- [ ] **Step 1: Create a branch and install the test tooling**

```bash
cd /Users/jonathan/Workspace/jonathanelbom/mentalmodeler/mm-modules
git checkout -b test-harness-and-fixes
npm install --save-dev vitest@^5.0.3 jsdom@^30.1.2
```

- [ ] **Step 2: Add the scripts to `package.json`**

Add this block after `"homepage"` (keep the rest unchanged):

```json
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
```

- [ ] **Step 3: Create `test/fixtures.js`**

```js
export const rel = (id, influence) => ({ id, influence: `${influence}` });
export const concept = (id, name, relationships = []) => ({ id, name, relationships });
```

- [ ] **Step 4: Write `test/scenario.test.js` (baseline, expected to pass against current code)**

```js
import { describe, expect, it } from 'vitest';
import { getWeightMatrix, runScenario } from '../src/scenario';
import { concept, rel } from './fixtures';

describe('getWeightMatrix', () => {
    it("puts each concept's outgoing influences in its own row, as numbers", () => {
        const concepts = [concept('a', 'A', [rel('b', '0.5')]), concept('b', 'B')];
        expect(getWeightMatrix(concepts)).toEqual([
            [0, 0.5],
            [0, 0],
        ]);
    });

    it('treats a concept with no relationships key as a row of zeros', () => {
        const concepts = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
        expect(getWeightMatrix(concepts)).toEqual([
            [0, 0],
            [0, 0],
        ]);
    });
});

describe('runScenario', () => {
    const cyclic = {
        concepts: [concept('a', 'A', [rel('b', 1)]), concept('b', 'B', [rel('a', -1)]), concept('c', 'C')],
    };

    it('returns a zero delta for every concept when nothing is clamped', () => {
        const result = runScenario(cyclic, { concepts: [] });
        expect(result.map(({ id }) => id)).toEqual(['a', 'b', 'c']);
        result.forEach(({ influence }) => expect(influence).toBeCloseTo(0, 10));
    });

    it('excludes clamped concepts, and treats an influence of 0 as "not clamped"', () => {
        const scenario = { concepts: [{ influence: 1 }, { influence: 0 }, { influence: 0 }] };
        expect(runScenario(cyclic, scenario).map(({ id }) => id)).toEqual(['b', 'c']);
    });

    it('excludes by position, not name, when two concepts share a name', () => {
        const model = { concepts: [concept('x1', 'X'), concept('x2', 'X')] };
        const scenario = { concepts: [{ influence: 1 }, { influence: 0 }] };
        expect(runScenario(model, scenario).map(({ id }) => id)).toEqual(['x2']);
    });

    it('labels each result with the concept id and name', () => {
        const [first] = runScenario(cyclic, { concepts: [{ influence: 1 }, { influence: 0 }, { influence: 0 }] });
        expect(first).toMatchObject({ id: 'b', name: 'B' });
        expect(typeof first.influence).toBe('number');
    });
});
```

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: all 6 PASS. These pin current behavior; a failure here means the plan's reading of the code is wrong, so stop and investigate.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json test/fixtures.js test/scenario.test.js
git commit -m "Add Vitest and baseline scenario tests" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Scenario hardening: iteration cap (F2) and `toInfluence` helper (F10)

Part A (steps 1-5) caps `converge`; Part B (steps 6-11) adds the shared helper that Tasks 3+ use.

**Files:**
- Modify: `src/scenario.js:21-42`
- Test: `test/scenario.test.js`

**Interfaces:**
- Consumes: `runScenario`, `tanh` from `src/scenario`; `concept`, `rel` from `test/fixtures`.
- Produces: no signature change. `runScenario` now always returns.

- [ ] **Step 1: Add the test (append to `test/scenario.test.js`)**

Change the import line to `import { getWeightMatrix, runScenario, tanh } from '../src/scenario';`, then append:

```js
describe('runScenario convergence', () => {
    it('returns instead of looping forever on a tanh feedback loop that does not settle', () => {
        const model = { concepts: [concept('a', 'A', [rel('b', 1)]), concept('b', 'B', [rel('a', -1)])] };
        const result = runScenario(model, { concepts: [] }, tanh);
        expect(result).toHaveLength(2);
        result.forEach(({ influence }) => expect(Number.isFinite(influence)).toBe(true));
    });
});
```

- [ ] **Step 2: Confirm the hang on the unfixed code (this test cannot fail safely, because the failure is an endless loop)**

```bash
perl -e 'alarm 20; exec @ARGV' npx vitest run test/scenario.test.js -t "does not settle"; echo "exit: $?"; pkill -f vitest
```

Expected: the command is killed by the alarm (exit 142 or similar non-zero, no PASS line). If instead it passes quickly, F2's analysis was wrong. Report that and skip the rest of this task.

- [ ] **Step 3: Add the cap in `src/scenario.js`**

Replace the `converge` function's opening and loop condition:

```js
const MAX_ITERATIONS = 10000;

const converge = (initVec, weightMat, clampFn, influences = []) => {
    const epsilon = 0.00001;
    let previousVec = initVec;
    let currentVec;
    let diff = 1;
    let iterations = 0;

    // Some feedback loops (e.g. tanh with weights whose product is +/-1) approach their
    // fixed point only like 1/sqrt(n), so epsilon alone is not a safe stopping rule.
    while (diff > epsilon && iterations < MAX_ITERATIONS) {
        iterations += 1;
        const intermediateVec = multiply(weightMat, previousVec);
```

Leave the rest of the loop body unchanged.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: all PASS (7 tests), finishing in well under a second for the new one.

- [ ] **Step 5: Commit**

```bash
git add src/scenario.js test/scenario.test.js
git commit -m "Cap converge iterations so non-settling models cannot hang" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

#### Part B: one `toInfluence()` helper (F10)

**Files:**
- Create: `src/influence.js`, `test/influence.test.js`
- Modify: `src/scenario.js:5-16,46`
- Test: `test/scenario.test.js`

**Interfaces:**
- Produces: `toInfluence(influence): number` from `src/influence.js`. Always a finite number: strings and numbers are parsed with `parseFloat`; blank, missing, non-numeric and non-finite values become `0`. Fuzzy codes like `'H+'` are *not* handled here (the XML parser converts them), so they also become `0`. Tasks 3 and onward import it.

- [ ] **Step 6: Write `test/influence.test.js`**

```js
import { describe, expect, it } from 'vitest';
import { toInfluence } from '../src/influence';

describe('toInfluence', () => {
    it('parses numeric strings and numbers', () => {
        expect(toInfluence('0.5')).toBe(0.5);
        expect(toInfluence('-1')).toBe(-1);
        expect(toInfluence('.34')).toBe(0.34);
        expect(toInfluence('-.67')).toBe(-0.67);
        expect(toInfluence(0.25)).toBe(0.25);
        expect(toInfluence('0')).toBe(0);
    });

    it('treats blank, missing and non-numeric values as 0, never NaN', () => {
        [undefined, null, '', ' ', 'abc', 'H+', NaN, Infinity].forEach((value) => {
            expect(toInfluence(value)).toBe(0);
        });
    });
});
```

- [ ] **Step 7: Run to see it fail**

Run: `npx vitest run test/influence.test.js`
Expected: FAIL, cannot resolve `../src/influence`.

- [ ] **Step 8: Create `src/influence.js`**

```js
// Influences are strings in .mmp files ('0.5', '-1', sometimes '' for a connection with no
// value) but can be numbers (importCSV). Anything that does math or sign checks on an
// influence goes through this so strings, numbers and blanks all behave the same way.
export const toInfluence = (influence) => {
    const parsed = parseFloat(influence);
    return Number.isFinite(parsed) ? parsed : 0;
};
```

- [ ] **Step 9: Add the scenario NaN tests (append to `test/scenario.test.js`)**

```js
describe('blank influences', () => {
    it('reads a blank or missing influence as a weight of 0, not NaN', () => {
        const concepts = [
            concept('a', 'A', [rel('b', ''), { id: 'c' }]),
            concept('b', 'B'),
            concept('c', 'C'),
        ];
        expect(getWeightMatrix(concepts)).toEqual([
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
        ]);
    });

    it('still returns finite results when one relationship has no value', () => {
        const model = { concepts: [concept('a', 'A', [rel('b', '')]), concept('b', 'B', [rel('a', 1)])] };
        const result = runScenario(model, { concepts: [{ influence: '' }, { influence: 1 }] });
        result.forEach(({ influence }) => expect(Number.isFinite(influence)).toBe(true));
    });
});
```

Run: `npx vitest run test/scenario.test.js -t "blank influences"`
Expected: both FAIL (`NaN` in the matrix and in the results).

- [ ] **Step 10: Use the helper in `src/scenario.js`**

Add `import {toInfluence} from './influence';` under the mathjs import. In `getWeightMatrix` change `parseFloat(relationship.influence)` to `toInfluence(relationship.influence)`. In `runScenario` change `parseFloat(influence)` to `toInfluence(influence)`:

```js
    const influences = scenarioConcepts.map(({influence}) => toInfluence(influence));
```

- [ ] **Step 11: Run all tests and commit**

Run: `npm test`
Expected: all PASS.

```bash
git add src/influence.js src/scenario.js test/influence.test.js test/scenario.test.js
git commit -m "Add toInfluence helper; stop blank influences turning scenario results into NaN" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Metrics and compare (F3, F4, F5)

**Files:**
- Modify: `src/metrics.js:68-83,90-107`, `src/compare.js:4-5,7-70`
- Create: `test/metrics.test.js`, `test/compare.test.js`

**Interfaces:**
- Consumes: `concept`, `rel` from `test/fixtures`.
- Produces: `compare.js` internal `relationshipKey(fromNode, toNode)`. Exports unchanged (`compareModels`, `compareModel`, `normalizeName`).

- [ ] **Step 1: Write `test/metrics.test.js`**

```js
import { describe, expect, it } from 'vitest';
import { getConceptsWithMetrics, getMetrics } from '../src/metrics';
import { concept, rel } from './fixtures';

const model = {
    concepts: [
        concept('a', 'A', [rel('b', 1), rel('c', -0.5)]),
        concept('b', 'B', [rel('c', 0.5)]),
        concept('c', 'C'),
    ],
};

describe('getConceptsWithMetrics', () => {
    it('annotates every concept with degrees, centrality and type', () => {
        const byId = Object.fromEntries(getConceptsWithMetrics(model).map((c) => [c.id, c]));
        expect(byId.a).toMatchObject({ indegree: 0, outdegree: 1.5, centrality: 1.5, type: 'driver' });
        expect(byId.b).toMatchObject({ indegree: 1, outdegree: 0.5, centrality: 1.5, type: 'ordinary' });
        expect(byId.c).toMatchObject({ indegree: 1, outdegree: 0, centrality: 1, type: 'receiver' });
    });
});

describe('getMetrics', () => {
    it('summarises structure', () => {
        expect(getMetrics(model)).toMatchObject({
            numNodes: 3,
            numRelationships: 3,
            numDrivers: 1,
            numReceivers: 1,
            numOrdinary: 1,
            density: 0.5,
            relationshipsPerNode: 1,
            complexity: 1,
        });
    });

    it('computes each ranking independently of the others (ties keep model order)', () => {
        const result = getMetrics(model);
        expect(result.driversRanked.map(({ id }) => id)).toEqual(['a', 'b', 'c']);
        expect(result.receiversRanked.map(({ id }) => id)).toEqual(['b', 'c', 'a']);
        expect(result.centralityRanked.map(({ id }) => id)).toEqual(['a', 'b', 'c']);
    });

    it('returns 0, not NaN, for density and relationships-per-node on tiny models', () => {
        [{ concepts: [] }, { concepts: [concept('a', 'A')] }].forEach((tiny) => {
            const { density, relationshipsPerNode } = getMetrics(tiny);
            expect(density).toBe(0);
            expect(relationshipsPerNode).toBe(0);
        });
    });
});
```

- [ ] **Step 2: Run to see the expected failures**

Run: `npx vitest run test/metrics.test.js`
Expected: `getConceptsWithMetrics` and `summarises structure` PASS. `computes each ranking independently` FAILS (centralityRanked comes back `['b','a','c']` because earlier in-place sorts reordered the array). `returns 0, not NaN` FAILS (`NaN`).

- [ ] **Step 3: Fix `src/metrics.js`**

Add `import {toInfluence} from './influence';` at the top and replace `parseInfluence` with `const parseInfluence = (influence) => Math.abs(toInfluence(influence));` (same results as before; one shared parser). Then replace `rank` so it sorts a copy:

```js
const rank = ({concepts = [], indegree = true, outdegree = true}) => 
    [...concepts].sort((a, b) => {
        const valueA = (indegree ? a.indegree : 0) + (outdegree ? a.outdegree : 0);
        const valueB = (indegree ? b.indegree : 0) + (outdegree ? b.outdegree : 0);
        if (valueA === valueB) {
            return 0
        }
        return valueA > valueB ? -1 : 1;
    });
```

In `getMetrics`, add `const possibleLinks = getPossibleNumberOfConnections(concepts);` after `const numLinks = ...`, and change the two fields:

```js
        density: possibleLinks > 0 ? round(numLinks / possibleLinks, precision) : 0,
        relationshipsPerNode: numNodes > 0 ? numLinks / numNodes : 0,
```

- [ ] **Step 4: Run metrics tests**

Run: `npx vitest run test/metrics.test.js`
Expected: all 5 PASS.

- [ ] **Step 5: Write `test/compare.test.js`**

```js
import { describe, expect, it } from 'vitest';
import { compareModels } from '../src/compare';
import { concept, rel } from './fixtures';

const canonical = {
    id: 'c',
    concepts: [concept('w', 'Water', [rel('f', 1)]), concept('f', 'Fish', [rel('b', 1)]), concept('b', 'Birds')],
};

const run = (student) => compareModels({ modelsJSON: [canonical, student], canonicalId: 'c' })[student.id];

describe('compareModels', () => {
    it('matches concepts by normalized name (case and stray whitespace), not by id', () => {
        const student = {
            id: 's',
            concepts: [
                concept('s1', ' water ', [rel('s2', 0.5)]),
                concept('s2', 'FISH', [rel('s3', -1)]),
                concept('s3', 'Birds'),
                concept('s4', 'Algae', [rel('s2', 1)]),
            ],
        };
        const result = run(student);
        expect(result.nodes.extra.map(({ name }) => name)).toEqual(['Algae']);
        expect(result.nodes.missing).toEqual([]);
        expect(result.nodes.present).toHaveLength(3);
        expect(result.relationships.extra.map(({ fromNode }) => fromNode.name)).toEqual(['Algae']);
        expect(result.relationships.missing).toEqual([]);
        expect(result.relationships.correctlySigned).toHaveLength(1);
        expect(result.relationships.incorrectlySigned).toHaveLength(1);
        expect(result.score).toBe(0);
        expect(result.numNodes).toBe(4);
    });

    it('does not confuse "ab"->"c" with "a"->"bc"', () => {
        const left = { id: 'c', concepts: [concept('1', 'ab', [rel('2', 1)]), concept('2', 'c')] };
        const right = { id: 's', concepts: [concept('1', 'a', [rel('2', 1)]), concept('2', 'bc')] };
        const result = compareModels({ modelsJSON: [left, right], canonicalId: 'c' }).s;
        expect(result.relationships.extra).toHaveLength(1);
        expect(result.relationships.missing).toHaveLength(1);
    });

    it('treats an edge drawn the wrong way round as reversed, not extra + missing', () => {
        const canon = { id: 'c', concepts: [concept('a', 'A', [rel('b', 1)]), concept('b', 'B')] };
        const student = { id: 's', concepts: [concept('a', 'A'), concept('b', 'B', [rel('a', 1)])] };
        const result = compareModels({ modelsJSON: [canon, student], canonicalId: 'c' }).s;
        expect(result.relationships.reversed).toHaveLength(1);
        expect(result.relationships.extra).toEqual([]);
        expect(result.relationships.missing).toEqual([]);
        expect(result.score).toBe(-1);
    });

    it('judges sign on numeric value: same sign is correct, a zero (or blank) matches a zero, anything else is not', () => {
        const targets = ['B', 'C', 'D', 'E', 'F'];
        const targetConcepts = () => targets.map((name) => concept(name.toLowerCase(), name));
        const canon = {
            id: 'c',
            concepts: [
                concept('a', 'A', [rel('b', 1), rel('c', 1), rel('d', 0), rel('e', 0), rel('f', 1)]),
                ...targetConcepts(),
            ],
        };
        const student = {
            id: 's',
            concepts: [
                // B: 0.5 vs 1 -> same sign; C: -1 vs 1 -> opposite; D: 0 vs 0 -> both zero;
                // E: blank vs 0 -> both zero (a connection with no value is a zero); F: 0 vs 1 -> mismatch
                concept('a', 'A', [rel('b', 0.5), rel('c', -1), rel('d', 0), rel('e', ''), rel('f', 0)]),
                ...targetConcepts(),
            ],
        };
        const result = compareModels({ modelsJSON: [canon, student], canonicalId: 'c' }).s;
        expect(result.relationships.correctlySigned.map(({ toNode }) => toNode.name)).toEqual(['B', 'D', 'E']);
        expect(result.relationships.incorrectlySigned.map(({ toNode }) => toNode.name)).toEqual(['C', 'F']);
        expect(result.score).toBe(3);
    });

    it('does not throw when concepts have no relationships key (as produced by XML parsing)', () => {
        const canon = { id: 'c', concepts: [{ id: 'a', name: 'A' }] };
        const student = { id: 's', concepts: [{ id: 'a', name: 'A' }] };
        const result = compareModels({ modelsJSON: [canon, student], canonicalId: 'c' }).s;
        expect(result.score).toBe(0);
        expect(result.nodes.present).toHaveLength(1);
    });
});
```

- [ ] **Step 6: Run to see the expected failures**

Run: `npx vitest run test/compare.test.js`
Expected: the "reversed" test PASSES (characterization). These FAIL: "matches concepts by normalized name" (the `' water '` edge is wrongly extra), "does not confuse" (the two edges collide so extra and missing are empty), "judges sign on numeric value" (D and E are wrongly incorrect, so `correctlySigned` is `['B']`), "does not throw" (`TypeError`).

- [ ] **Step 7: Fix `src/compare.js`**

Add `import {toInfluence} from './influence';` under the existing `import {getMetrics}` line. Then add under `normalize`:

```js
// Relationships are matched by their (from, to) names, each normalized on its own, so
// stray whitespace/case in one name can't bleed into the other and "ab"+"c" can't
// collide with "a"+"bc".
const relationshipKey = (fromNode, toNode) => `${normalize(fromNode.name)}\u0000${normalize(toNode.name)}`;
```

In `compareModel`, change `getRelationships` to tolerate a missing list:

```js
    const getRelationships = ({name: fromName, id: fromId, relationships = []}, _, nodes) => (
        relationships.map(({name, id, influence}) => ({
```

(keep the object literal body and closing as it is, replacing only the `relationships && relationships.map(` start and the destructured parameter).

Replace `differenceRelationships`, `intersectionRelationships`, `correctlySigned` and `findReversedRelationships` with:

```js
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
```

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add src/metrics.js src/compare.js test/metrics.test.js test/compare.test.js
git commit -m "Fix compareModels name matching and missing relationships; make metrics rankings independent and NaN-free" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `importCSV` column alignment (F6)

**Files:**
- Modify: `src/csvImport.js:50-75`
- Create: `test/csvImport.test.js`

**Interfaces:**
- Consumes: `importCSV(rows)` from `src/csvImport`. Signature unchanged.
- Produces: concept `id` values remain the 0-based header column index (so ids may skip a number when a header cell is blank).

- [ ] **Step 1: Write `test/csvImport.test.js`**

```js
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
```

- [ ] **Step 2: Run to see the expected failure**

Run: `npx vitest run test/csvImport.test.js`
Expected: first three PASS; "blank header cell" FAILS (A's relationship to C is dropped and C gets none, because filtering shifted the indexes).

- [ ] **Step 3: Fix `src/csvImport.js`**

Replace the body of `importCSV` (from `const concepts = names` through `return`) with:

```js
    // Keep a slot per header column (null for blank headers) so row/column positions
    // stay aligned with the CSV; only drop the blanks once the matrix has been read.
    const slots = names.map((conceptName, id) => {
        const trimmed = `${conceptName ?? ''}`.trim();
        return trimmed ? { id, name: trimmed, relationships: [] } : null;
    });

    dataRows.forEach((row, rowIndex) => {
        const concept = slots[rowIndex];
        if (!concept) {
            return;
        }
        row.slice(1).forEach((value, columnIndex) => {
            const relatedConcept = slots[columnIndex];
            const influence = parseFloat(value);
            if (relatedConcept && !isNaN(influence) && influence) {
                concept.relationships.push({ id: relatedConcept.id, name: relatedConcept.name, influence });
            }
        });
    });

    const concepts = slots.filter(Boolean);
    layoutConcepts(concepts);

    return { info: { name }, concepts };
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/csvImport.js test/csvImport.test.js
git commit -m "Fix importCSV mis-aligning rows and columns when a header cell is blank" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Single `makeId`, parser fixes (F1, F7)

**Files:**
- Create: `src/id.js`, `test/id.test.js`, `test/parser.test.js`
- Modify: `index.js:11-14`, `src/parser.js:1-3,26-45,70`

**Interfaces:**
- Produces: `makeId(prefix = '')` from `src/id.js`, returning `<prefix><8>-<4>-<4>-<4>-<12>` lowercase hex. `index.js` re-exports this same function as `makeId`, and `parser.js` imports it.

- [ ] **Step 1: Write `test/id.test.js`**

```js
import { describe, expect, it } from 'vitest';
import { makeId } from '../src/id';
import { makeId as publicMakeId } from '../index';

describe('makeId', () => {
    it('produces fixed-width hex segments', () => {
        for (let i = 0; i < 50; i++) {
            expect(makeId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
        }
    });

    it('prepends the prefix and gives distinct ids', () => {
        expect(makeId('appId-').startsWith('appId-')).toBe(true);
        expect(makeId()).not.toBe(makeId());
    });

    it('is the same function the package exports', () => {
        expect(publicMakeId).toBe(makeId);
    });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run test/id.test.js`
Expected: FAIL, cannot resolve `../src/id`.

- [ ] **Step 3: Create `src/id.js`**

```js
// Builds `length` lowercase hex characters. (Math.random().toString(16) yields a variable
// number of digits, so keep appending until there are enough.)
const hex = (length) => {
    let chars = '';
    while (chars.length < length) {
        chars += Math.random().toString(16).slice(2);
    }
    return chars.slice(0, length);
};

export const makeId = (prefix = '') => `${prefix}${hex(8)}-${hex(4)}-${hex(4)}-${hex(4)}-${hex(12)}`;
```

- [ ] **Step 4: Use it from `index.js` and `src/parser.js`**

In `index.js`: add `import {makeId} from './src/id';` with the other imports; delete the `getChars` line, the `makeId` const, and the commented-out `makeId` line; leave `makeId` in the `export { ... }` list.

In `src/parser.js`: delete the `getChars` and `makeId` consts (lines 2-3) and add `import {makeId} from './id';` as the first line.

- [ ] **Step 5: Run the id tests**

Run: `npx vitest run test/id.test.js`
Expected: 3 PASS.

- [ ] **Step 6: Write `test/parser.test.js`**

```js
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
```

- [ ] **Step 7: Run to see the expected failure**

Run: `npx vitest run test/parser.test.js`
Expected: only "accepts a model with no info object at all" FAILS (`js.info.id` throws, caught, alert called, result undefined). The rest PASS.

- [ ] **Step 8: Fix `parseMMP` and drop the log line in `src/parser.js`**

Replace the JSON branch:

```js
            const js = JSON.parse(mmp);
            if (!js?.info?.id) {
                js.info = {...js.info, id: makeId()};
            }
            return js;
```

Delete the line `console.log('JSON from XML:', json);` in `parseXML`.

- [ ] **Step 9: Run the full suite**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 10: Commit**

```bash
git add index.js src/id.js src/parser.js test/id.test.js test/parser.test.js
git commit -m "Unify makeId into src/id.js with fixed-width segments; accept JSON models without info" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Loader fix and dead-code cleanup (F8)

**Files:**
- Modify: `src/loader.js` (whole file), `src/compare.js` (commented-out blocks), `index.js`
- Create: `test/loader.test.js`

**Interfaces:**
- Produces: `loadFile(file): Promise<string>`, `loadURL(url): Promise<string>` unchanged in signature. `loadURL` now rejects with `DOMException('MMP url loading failed!')` on a non-2xx response as well as on network errors.

- [ ] **Step 1: Write `test/loader.test.js`**

```js
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadFile, loadURL } from '../src/loader';

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('loadFile', () => {
    it('resolves with the text of the file', async () => {
        const file = new File(['{"a":1}'], 'model.mmp');
        await expect(loadFile(file)).resolves.toBe('{"a":1}');
    });
});

describe('loadURL', () => {
    it('resolves with the response text', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => 'hello' }));
        await expect(loadURL('/m.mmp')).resolves.toBe('hello');
    });

    it('rejects when the request itself fails', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
        await expect(loadURL('/m.mmp')).rejects.toMatchObject({ message: 'MMP url loading failed!' });
    });

    it('rejects on a non-2xx response instead of returning the error page as a model', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => 'Not found' }));
        await expect(loadURL('/missing.mmp')).rejects.toMatchObject({ message: 'MMP url loading failed!' });
    });
});
```

- [ ] **Step 2: Run to see the expected failure**

Run: `npx vitest run test/loader.test.js`
Expected: only "rejects on a non-2xx response" FAILS (it resolves with `'Not found'`).

- [ ] **Step 3: Rewrite `loadURL` in `src/loader.js` and delete its commented-out code**

Replace everything from `const loadURL` to the end of the file (including both commented-out blocks) with:

```js
const loadURL = async (url) => {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return await response.text();
    } catch (e) {
        throw new DOMException('MMP url loading failed!');
    }
};

export {loadFile, loadURL};
```

- [ ] **Step 4: Delete dead code in `src/compare.js` and `index.js`**

In `src/compare.js` remove: the `// import {runScenario} from './scenario';` line, the whole commented-out `compareScenario` block (from `// not comapring scenarios anymore` through its closing `// };`), the two `// not running the scenario anymore` comment lines plus their commented statements in `compareModels`, and the trailing commented-out `modelsToCompare.forEach` block. Change the export line to:

```js
export {compareModels, compareModel, normalize as normalizeName};
```

Leave the unused `scenario` parameter in `compareModels`'s argument destructuring (callers may still pass it).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/loader.js src/compare.js index.js test/loader.test.js
git commit -m "Reject loadURL on non-2xx responses; remove commented-out code" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Scenario direction (F9) — decided: fix

Status 2026-10-15: the original engineer confirmed the intended update is `vector × weight matrix`, matching legacy (`mentalmodeler-scenario/scripts/models/scenarioGraph.js:107`). `-suite` does not compensate (`services/scenarioEngine.js` passes the model straight to `runScenario`, its only call site), and `mm-modules`' `runScenario` had no consumer before the `-suite` Scenario tab, so only that tab's numbers change. The standard FCM update is `A(t+1) = f(A(t) · W)` with row = source.

**Files:**
- Modify: `src/scenario.js` (the `multiply` call in `converge`)
- Test: `test/scenario.test.js`

**Interfaces:**
- Consumes: `runScenario` from `src/scenario`.

- [ ] **Step 1: Write the failing direction test (append to `test/scenario.test.js`)**

```js
describe('runScenario direction of influence', () => {
    // a -> b with weight 1: a influences b.
    const chain = { concepts: [concept('a', 'A', [rel('b', 1)]), concept('b', 'B')] };

    it('moves the influenced concept when its influencer is clamped', () => {
        const [b] = runScenario(chain, { concepts: [{ influence: 1 }, { influence: 0 }] });
        expect(b.id).toBe('b');
        expect(b.influence).toBeGreaterThan(0.05);
    });

    it('does not move an influencer when the concept it influences is clamped', () => {
        const [a] = runScenario(chain, { concepts: [{ influence: 0 }, { influence: 1 }] });
        expect(a.id).toBe('a');
        expect(a.influence).toBeCloseTo(0, 10);
    });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run test/scenario.test.js -t "direction"`
Expected: both FAIL (B's delta is 0 and A's delta is non-zero), confirming the transpose.

- [ ] **Step 3: Fix `converge` in `src/scenario.js`**

Change `multiply(weightMat, previousVec)` to `multiply(previousVec, weightMat)` and run `npm test`. Expected: all PASS. Then tell the user the Scenario tab's numbers will change, and suggest eyeballing the Fire model (clamp one concept, compare against the legacy app).

- [ ] **Step 4: Commit**

```bash
git add src/scenario.js test/scenario.test.js
git commit -m "Propagate scenario influence along relationship direction (matches legacy)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Docs and consumer verification

**Files:**
- Modify: `CLAUDE.md`, `README.md`

- [ ] **Step 1: Update `CLAUDE.md`**

- In the **parser.js** bullet: replace the sentence about the two diverged `makeId`s with: "Model ids come from the single `makeId` in `src/id.js` (also exported from `index.js`)." Add that JSON with no `info` is accepted and an `info.id` is backfilled.
- In the **compare.js** bullet: say relationships are matched by `(from name, to name)` with each name normalized separately; concepts without a `relationships` key are treated as having none; sign is judged on numeric value via `toInfluence()` (same sign, or both zero/blank, is correct; this raises scores by 1 per 0-vs-0 edge compared with older versions, so call it out in release notes); delete the "don't resurrect `compareScenario`" sentence and replace it with "scenario comparison was removed in 2021; see git history before `<this branch>` if you need it".
- Add an **influence.js** bullet: `toInfluence()` is the one way to read an influence as a number (strings, numbers and blanks; blank/non-numeric = 0; fuzzy codes are converted by the XML parser, not here). Use it for any new influence math.
- In the **scenario.js** bullet: add that `converge` stops after 10000 iterations. Note that influence is propagated `vector × matrix` (along relationship direction), matching legacy.
- In the **metrics.js** bullet: add that density and relationshipsPerNode are `0` (not `NaN`) for models with too few concepts, and rankings are computed on copies.
- In the **csvImport.js** bullet: add that blank header cells are skipped without shifting other rows/columns, and concept ids are the original column index.
- In **Working in this repo**: add `npm test` (Vitest; `test/*.test.js`; files touching `FileReader`/`DOMParser`/`fetch` use `// @vitest-environment jsdom`) and "add a test with every behavior change".

- [ ] **Step 2: Update `README.md`**

Append:

```markdown
## Development

    npm install
    npm test          # one run
    npm run test:watch
```

- [ ] **Step 3: Verify consumers still work**

```bash
ls -l ../mentalmodeler-suite/node_modules/mm-modules | head -2
cd ../mentalmodeler-suite && npx vitest run && npm run build
```

Expected: `mm-modules` is a symlink to `../mm-modules` (so no reinstall is needed; if it is a real directory instead, run `npm install` in `mentalmodeler-suite` first), suite tests PASS, build succeeds. Then eyeball one comparison in `mm-compare` only if the user wants (`cd ../mm-compare && npm start`).

- [ ] **Step 4: Run the full suite one last time**

Run: `cd ../mm-modules && npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "Document test setup and behavior changes" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
