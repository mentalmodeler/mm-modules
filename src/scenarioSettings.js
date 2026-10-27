// Settings for running a scenario, saved on each scenario as `settings` in the model JSON.
// Anything missing or invalid falls back, field by field, to the default (today's behavior), so
// older files, and hand-edited ones, always give a runnable set of settings.

export const INFERENCE_RULES = ['kosko', 'modified kosko', 'rescaled kosko'];
export const SQUASH_FUNCTIONS = ['sigmoid', 'hyperbolic tangent', 'bivalent', 'trivalent'];

export const DEFAULT_SCENARIO_SETTINGS = Object.freeze({
    rule: 'kosko',
    squash: 'sigmoid',
    lambda: 1,
    noiseThreshold: 0,
});

// Numbers and numeric strings (influences in .mmp files are strings) only; everything else is NaN.
const toNumber = (value) => {
    if (typeof value === 'number') {
        return value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
        return Number(value);
    }
    return NaN;
};

const pickOption = (value, options, fallback) => (options.includes(value) ? value : fallback);

const pickNumber = (value, isValid, fallback) => {
    const number = toNumber(value);
    return Number.isFinite(number) && isValid(number) ? number : fallback;
};

export const normalizeScenarioSettings = (settings) => {
    const { rule, squash, lambda, noiseThreshold } = settings && typeof settings === 'object' ? settings : {};
    return {
        rule: pickOption(rule, INFERENCE_RULES, DEFAULT_SCENARIO_SETTINGS.rule),
        squash: pickOption(squash, SQUASH_FUNCTIONS, DEFAULT_SCENARIO_SETTINGS.squash),
        lambda: pickNumber(lambda, (n) => n > 0 && n <= 10, DEFAULT_SCENARIO_SETTINGS.lambda),
        noiseThreshold: pickNumber(noiseThreshold, (n) => n >= 0 && n <= 1, DEFAULT_SCENARIO_SETTINGS.noiseThreshold),
    };
};
