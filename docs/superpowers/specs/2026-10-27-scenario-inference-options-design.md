# Scenario inference options (PyFCM parity) — Design

Date: 2026-10-27. Status: draft for the user's approval. Covers `mm-modules` (engine) and `mentalmodeler-suite` (UI + persistence).

## Intent and why

One of the biggest complaints about Mental Modeler is that its scenario calculation is basic: one inference rule (Kosko), two squashing functions, no tuning. PyFCM (Payam Aminpour, MIT, `../PyFCM`) offers more: three inference rules, four squashing functions, a steepness parameter (lambda), and a noise threshold that drops weak links. A spike (2026-10-24, scratchpad only) showed:

- PyFCM's scenario math runs unchanged in Python or Pyodide, and a refactor of it matches the original scripts exactly (48 parameter combinations, max difference 0).
- `mm-modules` `runScenario` equals PyFCM's `k` rule with sigmoid/tanh at lambda = 1 to 1e-16. It differs only where features are missing: modified Kosko (up to 0.03) and rescaled Kosko (up to 0.33).

So the work is to add the missing options to `mm-modules` in JS, verify them against PyFCM's own output, expose all of them in the Scenario tab, and save the choice with each scenario so results are reproducible.

## Goals

- `mm-modules` computes scenarios with: inference rule (Kosko, modified Kosko, rescaled Kosko), squash function (sigmoid, hyperbolic tangent, bivalent, trivalent), lambda, and noise threshold. Results match PyFCM to 1e-9.
- The Scenario tab surfaces all of these (rule as a top-level segmented control, the rest as dependent inputs).
- Settings are saved on each scenario in the model JSON. Loading a scenario without settings, or with invalid ones, behaves exactly as the app does today.
- The app-facing call stays async and JSON-shaped, so the engine can later move behind a worker, Pyodide or a server without touching callers.

## Non-goals

- Aggregation, sensitivity, uncertainty, clustering (separate follow-ups; aggregation is next).
- Running Python in the browser or on a server. Python is only the test oracle.
- Changing `runScenario`, `converge`, `sigm` or `tanh`, or any existing export. They stay as they are (`mm-compare` and `-suite` use them).
- Exposing "clamp a concept to exactly 0" in the UI. The engine supports it; the UI keeps today's meaning (influence 0 = not clamped). Backlog item.
- Writing XML. The legacy XML parser does not learn the new field.
- Guaranteeing the legacy `mentalmodeler-scenario` app opens files saved with the new field (unverified; see Risks).

## Anti-goals (failures even if tests pass)

- Existing scenarios giving different numbers than today after upgrade.
- Saving a model silently rewriting old scenarios with settings the user never chose.
- A hand-edited or corrupt `settings` object crashing the engine or the tab.
- A non-settling feedback loop hanging the browser.

## Design

### Settings shape (stored on each scenario, JSON only)

```json
{ "name": "win game", "concepts": [ ... ],
  "settings": { "rule": "kosko", "squash": "sigmoid", "lambda": 1, "noiseThreshold": 0 } }
```

- `rule`: `"kosko"` | `"modified kosko"` | `"rescaled kosko"` (PyFCM `k`, `mk`, `r`).
- `squash`: `"sigmoid"` | `"hyperbolic tangent"` | `"bivalent"` | `"trivalent"`. The first two are the strings `-suite` already uses.
- `lambda`: number, 0 < lambda <= 10 (PyFCM prompts for "a number between (0,10)"). Ignored by bivalent and trivalent.
- `noiseThreshold`: number, 0 <= t <= 1. A link is dropped when `abs(weight) <= t` (PyFCM's rule, inclusive).
- Default (`DEFAULT_SCENARIO_SETTINGS`): `{ rule: 'kosko', squash: 'sigmoid', lambda: 1, noiseThreshold: 0 }`. This is today's behavior.

### Loading and fallback

`normalizeScenarioSettings(settings)` returns a complete, valid settings object. Each field is validated on its own: a missing, unknown or out-of-range field takes the default for that field only. Numeric strings (`"2.5"`) are accepted. It is applied when settings are read, never written back on load, so old files stay untouched until the user changes a setting.

### Engine (`mm-modules`)

New module `src/inference.js`, exported from `index.js`:

- `DEFAULT_SCENARIO_SETTINGS`, `INFERENCE_RULES`, `SQUASH_FUNCTIONS` (arrays of the valid string values), `normalizeScenarioSettings(settings)`.
- `runInference(model, { clamps, settings })` returns `[{ id, name, influence }]`, the change from baseline for each concept that was not clamped, in model order (the same shape and exclusion rule as `runScenario`).
  - `clamps` is an explicit list `[{ id, value }]`. A clamp with `value: 0` is honored (unlike `runScenario`, where 0 means unclamped). Clamps naming an unknown concept id are ignored.
  - The state vector starts at all ones. Weights come from the existing `getWeightMatrix`, then the noise threshold zeroes weak links.
  - Pre-activation, with `v` the state and `W` the weight matrix (row = source): Kosko `x = v·W`; modified Kosko `x = v + v·W`; rescaled Kosko `u = 2v − 1`, `x = u + u·W`. Then the squash function is applied to `x`.
  - Baseline and scenario runs both iterate to a fixed point (epsilon 1e-5 on the max change), capped at 10,000 iterations. At the cap it warns and returns the mean of the last two states, like `converge` today. This is deliberate and differs from PyFCM, whose loop has no cap and can run forever on oscillating bivalent/trivalent maps.
- `scenario.js` is not modified. The new module has its own small loop; deduplicating it with `converge` is a later cleanup.

### Persistence and state (`-suite`)

- New reducer `models/setScenarioSettings` with payload `{ settings }` (partial). It merges into the selected scenario's `settings`, following `setScenarioConceptOverride`'s pattern. Saving already serializes the whole model, so settings persist with no change to the save path. The editor (`mentalmodeler-js`) passes scenarios through verbatim.
- `runScenarioCalculation({ model, scenario })` keeps its async, JSON-shaped contract. It reads `normalizeScenarioSettings(scenario.settings)` and turns the scenario's non-zero influences into `clamps` (preserving today's "0 = unclamped" meaning), then calls `runInference`. The old `squashFunction` argument goes away.

### UI (`-suite`, Scenario tab header)

Rule is a segmented toggle (three options), with a one-line plain-English description of the selected rule beneath. Next to it: squash dropdown (four options), lambda (hidden for bivalent and trivalent), noise threshold. The second row wraps on narrow widths. Changing any control dispatches `setScenarioSettings` and recalculates through the existing effect.

## Constraints

- `mm-modules` has no build step and no bundler; ES modules only; consumers import only from the package root.
- Additive only to `mm-modules` public API (`mm-compare` links it).
- New `.mmp` writes are JSON only.
- PyFCM is MIT: credit it in the module header and the README.

## Verification approach

PyFCM is the oracle. A Python generator (reference math copied verbatim from PyFCM, with its notice) writes `test/fixtures/pyfcm-golden.json`; JS tests read the JSON, so running tests needs no Python. Cases cover rule × squash × lambda × noise threshold on the 40-concept PyFCM example matrix, plus small hand-built maps.

## Risks

- The legacy `mentalmodeler-scenario` app reads the same `.mmp` files. Unknown scenario keys are probably ignored but unverified. Check by opening a suite-saved file in the legacy app before release.
- PyFCM's own geometric-mean aggregation is broken (NaN on sparse input); relevant to the aggregation follow-up, not this work.

## Decided by the builder (not by the user)

- String values for `rule` and `squash`, the key names `lambda` and `noiseThreshold`, and the export names above.
- Clamps are an explicit list rather than a vector with 0 meaning unclamped.
- Unknown-id clamps are ignored; invalid settings fall back per field.
- The new loop is separate from `converge`.
