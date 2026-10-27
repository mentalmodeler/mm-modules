# Scenario Inference Engine (PyFCM parity) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a scenario engine to `mm-modules` that supports PyFCM's three inference rules, four squash functions, lambda and noise threshold, verified against PyFCM's own output.

**Architecture:** Two new focused modules, `src/scenarioSettings.js` (constants, validation, defaults) and `src/inference.js` (`runInference`, with its own convergence loop), both exported from `index.js`. `scenario.js` is untouched. A Python script (PyFCM's math, copied) generates a committed JSON of golden results that the Vitest tests compare against, so running tests needs no Python.

**Tech Stack:** ES modules, `mathjs` 9 (already a dependency), Vitest. Python 3 with `numpy` and `openpyxl` only for regenerating the golden file.

**Spec:** `docs/superpowers/specs/2026-10-27-scenario-inference-options-design.md`. The UI half is `mentalmodeler-suite/docs/superpowers/plans/2026-10-27-scenario-settings-ui.md` and depends on this plan being done first.

## Global Constraints

- No build step, no bundler; ES modules only. Consumers import only from the package root (`exports` is `.` -> `index.js`), so every new public name is exported from `index.js`.
- Additive only: do not change `src/scenario.js`, `converge`, `runScenario`, `sigm`, `tanh`, or any existing export (`mm-compare` and `-suite` use them).
- Rules: `'kosko' | 'modified kosko' | 'rescaled kosko'`. Squash: `'sigmoid' | 'hyperbolic tangent' | 'bivalent' | 'trivalent'`. `lambda` is a number with 0 < lambda <= 10. `noiseThreshold` is a number with 0 <= t <= 1; a link is dropped when `Math.abs(weight) <= noiseThreshold`.
- Default settings: `{ rule: 'kosko', squash: 'sigmoid', lambda: 1, noiseThreshold: 0 }`.
- Convergence: initial state all ones, epsilon 0.00001 on the max change, cap 10000 iterations; at the cap, `console.warn` and return the mean of the last two states.
- Golden agreement: `toBeCloseTo(expected, 9)`.
- Credit PyFCM (Payam Aminpour, MIT, https://github.com/payamaminpour/PyFCM) in the header of `src/inference.js` and in the README.
- Match surrounding code style (4-space indent, single quotes, semicolons). Work on a new branch off `main`; do not commit to `main`; do not push or merge.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Default settings give exactly what `runScenario` gives today (the upgrade-compatibility guarantee). [Task 3]
2. A bivalent or trivalent map that oscillates returns finite numbers instead of hanging. [Task 3]
3. A clamp with `value: 0` is honored; a clamp naming an unknown concept id is ignored, not thrown on. [Task 3]
4. Garbage settings (`null`, `NaN`, `0` or `11` lambda, `'2.5'`, unknown rule, wrong types) normalize per field and never throw. [Task 2]
5. Models with no `relationships` key, no concepts, or a threshold that removes every link return sensible results. [Task 3]

---

### Task 1: PyFCM golden fixture

**Files:**
- Create: `test/golden/pyfcm_scenario.py`, `test/golden/generate_golden.py`, `test/golden/README.md`
- Create (generated, committed): `test/fixtures/pyfcm-golden.json`

**Interfaces:**
- Produces: `test/fixtures/pyfcm-golden.json` of shape `{ source: string, names: string[], matrix: number[][], cases: [{ settings: {rule, squash, lambda, noiseThreshold}, clamps: [{name, value}], changes: {[conceptName]: number} }] }`. `matrix[i][j]` is the influence of concept i on concept j (same orientation as `getWeightMatrix`). `changes` holds every concept's change from baseline, with clamped concepts set to 0 (PyFCM's behavior); consumers must skip clamped names.

- [ ] **Step 1: Create `test/golden/pyfcm_scenario.py`** containing PyFCM's `TransformFunc`, `infer_steady` and `infer_scenario` copied verbatim from `Scenario_Analysis.py` (in `../PyFCM/Codes.zip`), with module-level globals turned into parameters (`Lambda`, `AdjmT`, `n`, `init_vec`) and no `input()`, `xlrd`, `matplotlib` or `networkx`. Add `run_scenario(matrix, names, params) -> {"changes": {name: float}}` that applies the noise threshold (`abs(w) <= t` becomes 0), runs steady and scenario states, subtracts, and zeroes clamped concepts. A working version of exactly this exists from the 2026-10-24 spike at `<session scratchpad>/spike/pyfcm_core.py`; if that is gone, derive it from the zip. Keep PyFCM's MIT notice and author line at the top.
- [ ] **Step 2: Create `test/golden/generate_golden.py`**, taking the path to PyFCM's `Adjacency_Matrix_Example.xlsx` as `argv[1]` (read with `openpyxl`, blank cells as 0; header row and first column are names; 40 concepts) and writing `test/fixtures/pyfcm-golden.json`. Cases: every combination of rule in {k, mk, r} × squash in {sig, tanh, biv, triv} × lambda in {1, 2.5} × noiseThreshold in {0, 0.15}, activating "Concept 2" at 0.5 and "Concept 5" at 1.0 (48 cases); plus two cases with sigmoid/Kosko and modified Kosko where "Concept 3" is clamped to exactly 0 alongside "Concept 2" at 0.5. Map PyFCM's codes to the JSON strings (`k`→`kosko`, `mk`→`modified kosko`, `r`→`rescaled kosko`, `sig`→`sigmoid`, `tanh`→`hyperbolic tangent`, `biv`→`bivalent`, `triv`→`trivalent`). Write `source` as `PyFCM <date> Adjacency_Matrix_Example.xlsx`.
- [ ] **Step 3: Create `test/golden/README.md`** (a few lines): what the files are, that the JSON is generated and committed, the regenerate command (`python3 test/golden/generate_golden.py <path to Adjacency_Matrix_Example.xlsx>`), that it needs `numpy` and `openpyxl`, and that tests never run Python.
- [ ] **Step 4: Generate and check.** Run the generator; then
  `node -e "const g=require('./test/fixtures/pyfcm-golden.json'); console.log(g.names.length, g.cases.length)"`.
  Expected: `40 50`.
- [ ] **Step 5: Commit** (`test: add PyFCM golden scenario fixtures`).

---

### Task 2: Scenario settings module

**Files:**
- Create: `src/scenarioSettings.js`
- Test: `test/scenarioSettings.test.js`

**Interfaces:**
- Produces (all named exports of `src/scenarioSettings.js`):
  - `INFERENCE_RULES: string[]` = `['kosko', 'modified kosko', 'rescaled kosko']`
  - `SQUASH_FUNCTIONS: string[]` = `['sigmoid', 'hyperbolic tangent', 'bivalent', 'trivalent']`
  - `DEFAULT_SCENARIO_SETTINGS: { rule, squash, lambda, noiseThreshold }` (frozen)
  - `normalizeScenarioSettings(settings?: unknown): { rule: string, squash: string, lambda: number, noiseThreshold: number }`

- [ ] **Step 1: Write failing tests** in `test/scenarioSettings.test.js`:
  - `normalizeScenarioSettings(undefined)`, `(null)`, `({})` and `('x')` each `toEqual(DEFAULT_SCENARIO_SETTINGS)`.
  - A complete valid object, e.g. `{ rule: 'rescaled kosko', squash: 'trivalent', lambda: 2.5, noiseThreshold: 0.15 }`, comes back `toEqual` the same values.
  - Per-field fallback: `{ rule: 'nope', squash: 'bivalent' }` gives `rule: 'kosko'`, `squash: 'bivalent'`.
  - `lambda`: `0`, `-1`, `11`, `NaN`, `Infinity`, `'abc'`, `null` each give `1`; `'2.5'` gives `2.5`; `10` stays `10`.
  - `noiseThreshold`: `-0.1`, `1.5`, `NaN`, `'x'` each give `0`; `'0.2'` gives `0.2`; `1` stays `1`; `0` stays `0`.
  - The returned object is a new object each call (mutating it does not change `DEFAULT_SCENARIO_SETTINGS`), and `DEFAULT_SCENARIO_SETTINGS` is frozen.
  - Every value in `INFERENCE_RULES` and `SQUASH_FUNCTIONS` survives normalization unchanged.
- [ ] **Step 2: Run** `npx vitest run test/scenarioSettings.test.js`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** the four exports in `src/scenarioSettings.js`. Numbers go through `parseFloat`-style coercion for strings only (reuse the idea of `toInfluence` in `src/influence.js`, but out-of-range or non-finite values fall back to the default, not to 0).
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** (`feat: scenario settings constants and normalizeScenarioSettings`).

---

### Task 3: `runInference` engine

**Files:**
- Create: `src/inference.js`
- Test: `test/inference.test.js`
- Reuse: `getWeightMatrix` from `src/scenario.js`; `normalizeScenarioSettings`, `DEFAULT_SCENARIO_SETTINGS` from `src/scenarioSettings.js`; `concept`, `rel` from `test/fixtures.js`.

**Interfaces:**
- Consumes: Task 1's `pyfcm-golden.json`; Task 2's exports.
- Produces: `runInference(model: { concepts: Concept[] }, options?: { clamps?: { id: string, value: number }[], settings?: unknown }): { id: string, name: string, influence: number }[]`. Returns the change from baseline for every concept that was not clamped, in model order (same shape and exclusion as `runScenario`). `options.settings` goes through `normalizeScenarioSettings`.

- [ ] **Step 1: Write failing tests** in `test/inference.test.js`:
  - **Golden:** `it.each(golden.cases)` builds a model from `golden.names`/`golden.matrix` (concept `id` = the name, a relationship for every non-zero matrix entry, influence as a string), clamps from `case.clamps` (by name as id), runs `runInference`, and for every returned concept asserts `toBeCloseTo(case.changes[name], 9)`; also asserts the clamped names are absent from the result and the result length is `names.length - clamps.length`.
  - **Default compatibility:** on the 40-concept golden model with Concept 2 clamped at 0.5 and Concept 5 at 1, `runInference(model, { clamps })` (no settings) equals `runScenario` with a matching scenario (influences 0.5 and 1 at those positions, 0 elsewhere) and `sigm`, per concept, `toBeCloseTo(…, 10)`. Same with `settings: { squash: 'hyperbolic tangent' }` against `tanh`.
  - **Explicit zero clamp:** on a small map where clamping B to 0 changes A's result versus no clamp (e.g. A→B weight 1, B→A weight −1, C→A weight 0.5), `clamps: [{ id: 'b', value: 0 }]` returns a result for A that differs from `clamps: []`, and B is absent.
  - **Unknown clamp id:** `clamps: [{ id: 'zzz', value: 1 }]` returns the same result as no clamps and does not throw.
  - **Non-settling loop:** a two-concept map (A→B weight 1, B→A weight −1) with `{ rule: 'modified kosko', squash: 'bivalent' }` and `{ rule: 'kosko', squash: 'trivalent' }` each return, with every `influence` finite, within the iteration cap (spy on `console.warn`; it may or may not be called, but the call must return).
  - **Edge models:** `{ concepts: [] }` returns `[]`; concepts with no `relationships` key return all-zero deltas; a `noiseThreshold: 1` run on the golden model returns all zeros (every link has `abs(w) <= 1`); `lambda` changes sigmoid results but not bivalent results.
  - **No mutation:** the model and the `clamps` array are `toEqual` to deep copies taken before the call.
- [ ] **Step 2: Run** `npx vitest run test/inference.test.js`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement `runInference` in `src/inference.js`** per the spec's engine section: weight matrix from `getWeightMatrix`, zero entries with `Math.abs(w) <= noiseThreshold`; pre-activation per rule (Kosko `x = v·W`, modified `x = v + v·W`, rescaled `u = 2v − 1`, `x = u + u·W`); squash per function (sigmoid `1/(1+exp(−λx))`, tanh `tanh(λx)`, bivalent `x > 0 ? 1 : 0`, trivalent `sign(x)`); after each step set clamped concepts to their clamp values; run once without clamps (baseline) and once with; difference, excluding clamped concepts. The loop is a private function in this file (not `converge`), with the cap behavior from Global Constraints. Put the PyFCM credit and the MIT note in the file header. Plain loops over arrays are fine; `mathjs` is optional.
- [ ] **Step 4: Run** the same command. Expected: PASS (all golden cases).
- [ ] **Step 5: Run the full suite** `npm test`. Expected: PASS, with no change in the pre-existing test count except the new files.
- [ ] **Step 6: Commit** (`feat: add runInference with PyFCM-parity rules and squash functions`).

---

### Task 4: Public API and docs

**Files:**
- Modify: `index.js` (add the new exports), `CLAUDE.md` (module list), `README.md` (credit and a short usage example)
- Test: `test/index.test.js` (create if there is no existing test of the package entry point; otherwise add to it)

**Interfaces:**
- Consumes: Tasks 2 and 3.
- Produces: package-root exports `runInference`, `normalizeScenarioSettings`, `DEFAULT_SCENARIO_SETTINGS`, `INFERENCE_RULES`, `SQUASH_FUNCTIONS`. The UI plan imports exactly these names from `'mm-modules'`.

- [ ] **Step 1: Write failing test** `test/index.test.js`: `import * as api from '../index'` and assert `typeof api.runInference === 'function'`, `typeof api.normalizeScenarioSettings === 'function'`, `Array.isArray(api.INFERENCE_RULES)`, `Array.isArray(api.SQUASH_FUNCTIONS)`, `api.DEFAULT_SCENARIO_SETTINGS.rule === 'kosko'`, and that the existing names (`runScenario`, `sigm`, `tanh`) are still exported.
- [ ] **Step 2: Run** `npx vitest run test/index.test.js`. Expected: FAIL.
- [ ] **Step 3: Add the exports to `index.js`**, then add an `inference.js` / `scenarioSettings.js` entry to `CLAUDE.md`'s module list (what each does, the settings shape, the explicit-clamps difference from `runScenario`, the PyFCM oracle and how to regenerate it), and a short README section with the PyFCM credit and one `runInference` example.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** (`feat: export scenario inference API; document it`). Then tell the user that `mentalmodeler-suite` needs `npm install` (or a relink) to pick the new exports up.
