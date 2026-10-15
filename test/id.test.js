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
