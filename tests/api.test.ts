/**
 * The public API, and what it does with an item nobody has pointed at a file.
 *
 * Since a PDF item is creatable before a file is chosen, every entry point
 * that needs the file has to say so. Opening a viewer on an empty url shows
 * an empty window and no reason for it.
 */
import { withMockFoundry } from '@vttforge/testing/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const shared: unknown[] = [];
const preloaded: unknown[] = [];
const rendered: unknown[] = [];

vi.mock('../scripts/socket.js', () => ({
  shareView: (payload: unknown, userIds: unknown) => shared.push({ payload, userIds }),
  requestPreload: (url: unknown, userIds: unknown) => preloaded.push({ url, userIds }),
}));

vi.mock('../scripts/apps/pdf-viewer.js', () => ({
  PdfViewer: class {
    constructor(options: unknown) {
      rendered.push(options);
    }
    render() {
      return Promise.resolve(this);
    }
  },
}));

/** Two items: one with a file, one created and never pointed anywhere. */
function items() {
  return [
    { id: 'a', name: 'Player Handbook', type: 'pdf-character-sheet.pdf', system: { url: 'pdfs/phb.pdf', code: 'PHB', offset: 7 } },
    { id: 'b', name: 'Empty Sheet', type: 'pdf-character-sheet.pdf', system: { url: '', code: 'EMPTY', offset: 0 } },
    { id: 'c', name: 'A Sword', type: 'weapon', system: {} },
  ];
}

let restore: () => void;

/** Rebuild the globals with the current user a GM or not. */
function asUser({ isGM }: { isGM: boolean }): void {
  restore?.();
  const all = items();
  restore = withMockFoundry({
    game: {
      user: { isGM },
      // An array plus `get`: the code under test walks the collection, and a
      // stub with only `filter` is not something you can walk.
      items: Object.assign(all, {
        get: (id: string) => all.find((item) => item.id === id),
      }),
    },
  }).restore;
}

beforeEach(() => {
  shared.length = 0;
  preloaded.length = 0;
  rendered.length = 0;
  const all = items();
  // Foundry's collection is not an array; it exposes `filter` and `get`.
  // Building it out of a plain object keeps `Array.prototype.filter` reachable
  // instead of recursing into the mock's own.
  restore = withMockFoundry({
    game: {
      user: { isGM: true },
      // An array plus `get`: the code under test walks the collection, and a
      // stub with only `filter` is not something you can walk.
      items: Object.assign(all, {
        get: (id: string) => all.find((item) => item.id === id),
      }),
    },
  }).restore;
});

afterEach(() => {
  restore();
  vi.resetModules();
});

async function loadApi() {
  const { api } = await import('../scripts/api.js');
  return api;
}

describe('the PDF API', () => {
  it('lists only this module\'s items', async () => {
    const api = await loadApi();
    expect(api.all().map((item) => item.name)).toEqual(['Player Handbook', 'Empty Sheet']);
  });

  it('finds by code, then by name', async () => {
    const api = await loadApi();
    expect(api.find('phb')?.id).toBe('a');
    expect(api.find('Player Handbook')?.id).toBe('a');
    expect(api.find('nothing')).toBeUndefined();
  });

  it('opens on the page the offset maps to', async () => {
    const api = await loadApi();
    await api.open('PHB', 1);
    expect(rendered).toEqual([{ url: 'pdfs/phb.pdf', title: 'Player Handbook', page: 8 }]);
  });

  it('says which of the two things went wrong', async () => {
    const api = await loadApi();
    // A code nobody has.
    await expect(api.open('nope')).rejects.toThrow('No PDF found matching "nope"');
    // A real item with no file yet. Different mistake, different message.
    await expect(api.open('EMPTY')).rejects.toThrow('has no file chosen yet');
    expect(rendered).toEqual([]);
  });

  it('refuses to share or preload an item with no file', async () => {
    const api = await loadApi();
    expect(() => api.share('EMPTY')).toThrow('has no file chosen yet');
    expect(() => api.preload('EMPTY')).toThrow('has no file chosen yet');
    expect(shared).toEqual([]);
    expect(preloaded).toEqual([]);
  });

  it('shares and preloads the one that has a file', async () => {
    const api = await loadApi();
    api.share('PHB', 3);
    api.preload('PHB', ['user-1']);
    expect(shared).toEqual([
      { payload: { url: 'pdfs/phb.pdf', title: 'Player Handbook', page: 10 }, userIds: null },
    ]);
    expect(preloaded).toEqual([{ url: 'pdfs/phb.pdf', userIds: ['user-1'] }]);
  });

  it('tells a player why share and preload will not work for them', async () => {
    asUser({ isGM: false });
    const api = await loadApi();

    // Receivers drop a message a player sent, so without this the call would
    // succeed, do nothing, and say nothing.
    expect(() => api.share('PHB')).toThrow('Only a Gamemaster can call share()');
    expect(() => api.preload('PHB')).toThrow('Only a Gamemaster can call preload()');
    expect(shared).toEqual([]);
    expect(preloaded).toEqual([]);
  });

  it('still lets a player open a PDF on their own screen', async () => {
    asUser({ isGM: false });
    const api = await loadApi();
    await api.open('PHB', 1);
    expect(rendered).toEqual([{ url: 'pdfs/phb.pdf', title: 'Player Handbook', page: 8 }]);
  });
});
