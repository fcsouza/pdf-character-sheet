/**
 * Getting the library out before the module goes.
 *
 * A module's subtypes stop resolving when the module is uninstalled, so the
 * conversion has to happen while it is still installed, and it has to land on
 * something core. These tests hold that shape: pages of the core `pdf` type,
 * nothing deleted, and a second run that replaces rather than doubles.
 */
import { withMockFoundry } from '@vttforge/testing/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Page {
  id: string;
  name: string;
  type: string;
  src: string;
  flags?: Record<string, unknown>;
}

const created: unknown[] = [];
let journal: {
  id: string;
  name: string;
  pages: Page[];
  deleteEmbeddedDocuments: (type: string, ids: string[]) => Promise<void>;
  createEmbeddedDocuments: (type: string, data: Page[]) => Promise<void>;
} | null = null;

const ITEMS = [
  {
    id: 'a',
    name: 'Player Handbook',
    type: 'pdf-character-sheet.pdf',
    system: { url: 'pdfs/phb.pdf', code: 'PHB', offset: 7 },
  },
  {
    id: 'b',
    name: 'Empty Sheet',
    type: 'pdf-character-sheet.pdf',
    system: { url: '', code: 'EMPTY', offset: 0 },
  },
  { id: 'c', name: 'A Sword', type: 'weapon', system: {} },
];

let restore: () => void;

function mount({ isGM = true, existing = null as typeof journal } = {}): void {
  restore?.();
  journal = existing;
  restore = withMockFoundry({
    game: {
      user: { isGM },
      items: { filter: (fn: (i: (typeof ITEMS)[number]) => boolean) => ITEMS.filter(fn) },
      journal: { find: (fn: (e: unknown) => boolean) => (journal && fn(journal) ? journal : undefined) },
    },
    globals: {
      // Document classes live on the global scope too, and are not part of
      // the fixed set the helper installs.
      JournalEntry: {
        create: (data: { name: string; pages: unknown[] }) => {
          created.push(data);
          return Promise.resolve({ id: 'j1', name: data.name });
        },
      },
    },
  }).restore;
}

beforeEach(() => {
  created.length = 0;
  mount();
});

afterEach(() => {
  restore();
  vi.resetModules();
});

async function run() {
  const { exportToJournal } = await import('../scripts/export.js');
  return exportToJournal();
}

describe('exporting before uninstall', () => {
  it('writes each PDF as a core-typed journal page', async () => {
    const result = await run();
    const data = created[0] as { name: string; pages: Page[] };

    expect(data.name).toBe('PDFs');
    expect(data.pages).toHaveLength(1);
    // `pdf` is a core JournalEntryPage type, which is the whole point: it
    // keeps resolving with this module gone.
    expect(data.pages[0]?.type).toBe('pdf');
    expect(data.pages[0]?.src).toBe('pdfs/phb.pdf');
    expect(result.written).toBe(1);
  });

  it('carries the code and the page offset in flags, which outlive the module', async () => {
    await run();
    const data = created[0] as { pages: Page[] };
    expect(data.pages[0]?.flags?.['pdf-character-sheet']).toEqual({
      code: 'PHB',
      offset: 7,
      itemId: 'a',
    });
  });

  it('names what it left out rather than writing a page with no file', async () => {
    const result = await run();
    expect(result.skipped).toEqual(['Empty Sheet']);
  });

  it('ignores items belonging to the system', async () => {
    await run();
    const data = created[0] as { pages: Page[] };
    expect(data.pages.map((p) => p.name)).not.toContain('A Sword');
  });

  it('replaces what a previous run wrote instead of doubling it', async () => {
    const deleted: string[][] = [];
    const added: Page[][] = [];
    mount({
      existing: {
        id: 'j1',
        name: 'PDFs',
        pages: [
          { id: 'p1', name: 'Player Handbook', type: 'pdf', src: 'old.pdf', flags: { 'pdf-character-sheet': {} } },
          { id: 'p2', name: 'Notes by hand', type: 'text', src: '' },
        ],
        deleteEmbeddedDocuments: (_t: string, ids: string[]) => {
          deleted.push(ids);
          return Promise.resolve();
        },
        createEmbeddedDocuments: (_t: string, data: Page[]) => {
          added.push(data);
          return Promise.resolve();
        },
      },
    });

    await run();
    // Only the page this module wrote is replaced. A page someone added by
    // hand is left where it is.
    expect(deleted).toEqual([['p1']]);
    expect(added[0]?.map((p) => p.name)).toEqual(['Player Handbook']);
    expect(created).toEqual([]);
  });

  it('refuses a player, who cannot create world documents anyway', async () => {
    mount({ isGM: false });
    await expect(run()).rejects.toThrow('Only a Gamemaster');
    expect(created).toEqual([]);
  });
});
