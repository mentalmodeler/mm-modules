A collection of ES6 modules for use in MentalModeler apps.

## Scenarios

`runInference` runs a scenario with the options offered by
[PyFCM](https://github.com/payamaminpour/PyFCM) (Payam Aminpour, Michigan State University, MIT
license): three inference rules (Kosko, modified Kosko, rescaled Kosko), four squashing functions
(sigmoid, hyperbolic tangent, bivalent, trivalent), a steepness parameter (lambda) and a noise
threshold that drops weak links. Its results are tested against PyFCM's own output.

    import { runInference, normalizeScenarioSettings } from 'mm-modules';

    const changes = runInference(model, {
        clamps: [{ id: 'water', value: 0.5 }],
        settings: { rule: 'modified kosko', squash: 'sigmoid', lambda: 1, noiseThreshold: 0.15 },
    });
    // [{ id, name, influence }] for every concept that was not clamped

Settings that are missing or invalid fall back, field by field, to the defaults (Kosko, sigmoid,
lambda 1, no threshold), which match the older `runScenario`.

## Development

    npm install
    npm test          # one run
    npm run test:watch
