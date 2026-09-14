/**
 * Getting your PDFs out before the module goes.
 *
 * A module's document subtypes belong to the module. Uninstall it and every
 * Item of type `pdf-character-sheet.pdf` becomes a type Foundry no longer
 * knows. The documents are not deleted and the data underneath is not
 * destroyed, but nothing can read them: no sheet opens, and the Items sit in
 * the sidebar as an unavailable type until the module comes back.
 *
 * So the conversion has to run while the module is still installed. It writes
 * each PDF to a JournalEntry page of type `pdf`, which is a core type: it
 * keeps working with this module gone, on any system, in any world.
 *
 * Nothing is deleted here. The Items stay where they are, and deleting them
 * is a decision left to whoever reads the journal afterwards and agrees it
 * came out right.
 */
import type { JournalEntryLike } from '@vttforge/core';
import { MODULE_ID } from './constants.js';
import { isPdfItem } from './data/pdf-data.js';

/** The journal this module writes to, by name. */
const JOURNAL_NAME = 'PDFs';

export interface ExportResult {
  /** The JournalEntry the pages were written to. `id` is null until it saves. */
  journal: { id: string | null; name: string };
  /** How many pages were written. */
  written: number;
  /** Items skipped because no file was ever chosen for them. */
  skipped: string[];
}

/**
 * Copy every PDF item into a journal of core-typed pages.
 *
 * Running it twice replaces the pages it wrote before rather than doubling
 * them, so it is safe to run again after adding a PDF.
 */
export async function exportToJournal(): Promise<ExportResult> {
  if (game.user?.isGM !== true) {
    throw new Error('Only a Gamemaster can export the PDF library.');
  }

  const items = [...game.items].filter(isPdfItem);

  const skipped: string[] = [];
  const pages = [];
  for (const item of items) {
    if (!item.system.url) {
      skipped.push(item.name);
      continue;
    }
    pages.push({
      name: item.name,
      type: 'pdf',
      src: item.system.url,
      // The code and the page offset have nowhere to live on a core page, and
      // they are the two things a reader would otherwise have to work out
      // again. Flags survive this module's removal.
      flags: {
        [MODULE_ID]: { code: item.system.code, offset: item.system.offset, itemId: item.id },
      },
    });
  }

  const existing = game.journal.find((entry) => entry.name === JOURNAL_NAME);
  if (existing) {
    // Replace what a previous run wrote, and leave pages someone added by
    // hand alone.
    const ours = existing.pages
      .filter((page) => Boolean(page.flags?.[MODULE_ID]))
      .map((page) => page.id)
      .filter((id): id is string => id !== null);
    if (ours.length > 0) await existing.deleteEmbeddedDocuments('JournalEntryPage', ours);
    if (pages.length > 0) await existing.createEmbeddedDocuments('JournalEntryPage', pages);
    return { journal: { id: existing.id, name: existing.name }, written: pages.length, skipped };
  }

  // `create` on a document class is declared as returning `unknown`: which
  // document it makes is the caller's to know. This one makes a journal.
  const created = (await JournalEntry.create({ name: JOURNAL_NAME, pages })) as JournalEntryLike;
  return { journal: { id: created.id, name: created.name }, written: pages.length, skipped };
}
