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
