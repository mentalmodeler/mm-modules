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
