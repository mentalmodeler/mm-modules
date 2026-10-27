import { describe, expect, it } from 'vitest';
import * as api from '../index';

describe('package entry point', () => {
    it('exports the scenario inference API', () => {
        expect(typeof api.runInference).toBe('function');
        expect(typeof api.normalizeScenarioSettings).toBe('function');
        expect(api.INFERENCE_RULES).toEqual(['kosko', 'modified kosko', 'rescaled kosko']);
        expect(api.SQUASH_FUNCTIONS).toEqual(['sigmoid', 'hyperbolic tangent', 'bivalent', 'trivalent']);
        expect(api.DEFAULT_SCENARIO_SETTINGS).toEqual({
            rule: 'kosko',
            squash: 'sigmoid',
            lambda: 1,
            noiseThreshold: 0,
        });
    });

    it('still exports the existing scenario functions', () => {
        expect(typeof api.runScenario).toBe('function');
        expect(typeof api.sigm).toBe('function');
        expect(typeof api.tanh).toBe('function');
    });
});
