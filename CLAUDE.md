# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

`mm-modules` is a small collection of ES6 modules used by MentalModeler apps to load, parse,
analyze, and compare Fuzzy Cognitive Map (FCM) models (`.mmp` files). It is a library with no
build step, no bundler config, no linter, and no test suite — `index.js` re-exports the public
API directly from `src/`, and consuming apps import the ES6 source as-is.

There are no npm scripts defined in `package.json` (no build/lint/test commands exist in this
repo). Dependencies: `mathjs` (matrix operations in `src/scenario.js`) and `d3-force` (graph
layout in `src/csvImport.js`).

## Domain model

An MMP model is JSON (or legacy XML) shaped like:

```
{ info: { id }, concepts: [ { id, name, relationships: [ { id, name, influence } ] } ] }
```

Each concept is a node; each `relationship` entry on a concept is a directed, signed, weighted
edge to another concept (`id` = target concept id, `influence` = edge weight as a string, often
fuzzy values like `"H+"`/`"M-"` that get converted to numbers).

## Module responsibilities (src/)

- **loader.js** — `loadFile`/`loadURL`: read raw MMP content from a browser `File` (via
  `FileReader`) or a URL (via `fetch`). Browser-only APIs (`FileReader`, `fetch`); no Node fs.
- **parser.js** — `parseMMP`: detects XML vs JSON input and normalizes both into the same JSON
  shape described above. XML parsing uses `DOMParser` (browser-only). Converts fuzzy influence
  codes (`L+/M+/H+/L-/M-/H-`) to numeric strings via `replaceFuzzyInfluence`. Generates a model
  `info.id` via a local `makeId()` if one isn't present (duplicated in `index.js` as the exported
  `makeId`, and these two implementations have diverged — be aware of which one is in scope).
- **scenario.js** — `runScenario`: simulates an FCM by iterating `weightMatrix × stateVector`
  to convergence (`converge`, epsilon-based fixed point) with a squashing function (`sigm` or
  `tanh`), once at baseline and once with scenario concepts clamped to fixed influence values.
  Returns the delta per concept between the clamped and baseline steady states, excluding
  concepts that were themselves clamped as scenario inputs. `sigm` and `tanh` (the two squashing
  functions `runScenario` accepts as its `clampFn` argument) are also exported directly from
  `index.js`, for consumers that need to let a user pick between them by name.
- **compare.js** — `compareModels`/`compareModel`: diffs a set of student/candidate models
  against a canonical model. Computes extra/missing/present nodes, extra/missing relationships,
  then detects **reversed** relationships (an edge present in both models but with endpoints
  swapped) and nets those out of the extra/missing counts before computing sign-correctness and
  an overall `score`. Node/relationship identity for diffing is by normalized (lowercased,
  trimmed) name, not by id — ids are not assumed stable across models being compared.
  `compareModels` merges in `getMetrics(...)` for each compared model. Scenario-comparison logic
  (`compareScenario`) was deliberately disabled (see comment "not comparing scenarios anymore")
  — don't resurrect it without checking why it was removed.
- **metrics.js** — `getMetrics`: structural graph metrics for a model — indegree/outdegree,
  centrality, concept classification (`driver` = outdegree only, `receiver` = indegree only,
  `ordinary` = both, `none` = neither), density, complexity (receivers/drivers ratio), and
  top-N rankings by centrality/indegree/outdegree. `getConceptsWithMetrics` is the unfiltered
  building block behind those rankings — every concept annotated with
  `indegree`/`outdegree`/`centrality`/`type`, with no top-N truncation or type filtering; use it
  when a consumer needs the full per-concept list (e.g. a sortable table) rather than `getMetrics`'
  summary/ranking shape.
- **csvImport.js** — `importCSV`: builds a model from the same adjacency-matrix shape
  `getMatrixRows`/CSV export produces in consuming apps (header row = model name + concept names;
  one data row per concept, in the same order, with influence values in the matching columns),
  then lays out the concepts with a `d3-force` simulation (repulsion + edges-as-springs,
  run synchronously for a fixed tick count) rather than a hierarchical/layered layout like `dagre`.
  FCMs are built around feedback loops, so a DAG-oriented layout has to fake-reverse edges to
  impose a hierarchy on a cyclic graph, producing tangled backward edges; a force simulation has
  no notion of hierarchy or edge direction, so cycles settle naturally instead of fighting the
  algorithm. Positions are normalized (translated) after simulation so all coordinates are
  positive, since consuming apps' canvases start at the origin.

## Working in this repo

- This is browser-targeted code (`FileReader`, `fetch`, `DOMParser`, `alert`) — do not introduce
  Node-only APIs into `src/`.
- `index.js` is the only public surface; if you add a new exported function to a module, also
  export it from `index.js`.
- Name-based matching (via `normalize`/`normalizeName` in compare.js) is load-bearing for model
  comparison — concepts are matched across models by normalized name, not id. Keep this in mind
  when touching comparison or scenario-lookup logic.
- There's a history of commented-out, superseded implementations left in place as a trail (e.g.
  the old `loadURL` XHR version, the disabled `compareScenario`/scenario-scoring path in
  compare.js). When modifying these areas, check the surrounding comments for why the prior
  approach was abandoned before changing behavior.
