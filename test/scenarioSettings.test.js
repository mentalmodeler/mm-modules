import { describe, expect, it } from 'vitest';
import {
    DEFAULT_SCENARIO_SETTINGS,
    INFERENCE_RULES,
    SQUASH_FUNCTIONS,
    normalizeScenarioSettings,
} from '../src/scenarioSettings';

describe('normalizeScenarioSettings', () => {
    it.each([undefined, null, {}, 'x', 5])('returns the defaults for %j', (input) => {
        expect(normalizeScenarioSettings(input)).toEqual(DEFAULT_SCENARIO_SETTINGS);
    });

    it('keeps a complete valid object as it is', () => {
        const settings = { rule: 'rescaled kosko', squash: 'trivalent', lambda: 2.5, noiseThreshold: 0.15 };
        expect(normalizeScenarioSettings(settings)).toEqual(settings);
    });

    it('falls back per field, not for the whole object', () => {
        expect(normalizeScenarioSettings({ rule: 'nope', squash: 'bivalent' })).toEqual({
            ...DEFAULT_SCENARIO_SETTINGS,
            rule: 'kosko',
            squash: 'bivalent',
        });
    });

    it.each([0, -1, 11, NaN, Infinity, 'abc', null, undefined, {}])('falls back to 1 for lambda %j', (lambda) => {
        expect(normalizeScenarioSettings({ lambda }).lambda).toBe(1);
    });

    it('accepts a numeric string for lambda, and the upper bound', () => {
        expect(normalizeScenarioSettings({ lambda: '2.5' }).lambda).toBe(2.5);
        expect(normalizeScenarioSettings({ lambda: 10 }).lambda).toBe(10);
    });

    it.each([-0.1, 1.5, NaN, 'x', null, undefined])('falls back to 0 for noiseThreshold %j', (noiseThreshold) => {
        expect(normalizeScenarioSettings({ noiseThreshold }).noiseThreshold).toBe(0);
    });

    it('accepts a numeric string for noiseThreshold, and both bounds', () => {
        expect(normalizeScenarioSettings({ noiseThreshold: '0.2' }).noiseThreshold).toBe(0.2);
        expect(normalizeScenarioSettings({ noiseThreshold: 1 }).noiseThreshold).toBe(1);
        expect(normalizeScenarioSettings({ noiseThreshold: 0 }).noiseThreshold).toBe(0);
    });

    it('returns a new object each call, and the defaults are frozen', () => {
        const result = normalizeScenarioSettings({});
        result.lambda = 9;
        expect(DEFAULT_SCENARIO_SETTINGS.lambda).toBe(1);
        expect(normalizeScenarioSettings({}).lambda).toBe(1);
        expect(Object.isFrozen(DEFAULT_SCENARIO_SETTINGS)).toBe(true);
    });

    it('lists the valid rules and squash functions, and every one survives normalization', () => {
        expect(INFERENCE_RULES).toEqual(['kosko', 'modified kosko', 'rescaled kosko']);
        expect(SQUASH_FUNCTIONS).toEqual(['sigmoid', 'hyperbolic tangent', 'bivalent', 'trivalent']);
        INFERENCE_RULES.forEach((rule) => expect(normalizeScenarioSettings({ rule }).rule).toBe(rule));
        SQUASH_FUNCTIONS.forEach((squash) => expect(normalizeScenarioSettings({ squash }).squash).toBe(squash));
    });
});
