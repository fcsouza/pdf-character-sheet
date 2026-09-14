/**
 * Migration from the v10 module.
 *
 * The old version stored each PDF as a JournalEntry carrying
 * `flags.pdf-character-sheet.PDFData`. This one stores them as Items of the
 * module's own subtype, which is the supported way for a module to add a
 * document type and the reason the port happened at all.
 *
 * So a world coming from v10 has its PDFs in a place this version does not
 * look. Without this migration they are simply gone — which is why it runs
 * before anything else and refuses to run twice.
 *
 * The old journal entries are left alone. Deleting a user's documents to
 * tidy up after ourselves is not a trade worth making, and a GM who is happy
 * with the result can remove them by hand.
 */
import { createMigrationRunner } from '@vttforge/core';
import { MODULE_ID, PDF_TYPE } from './constants.js';
import { isPdfItem } from './data/pdf-data.js';

/** The shape the v10 module wrote into its flag. */
interface LegacyPdfData {
  name?: string;
  url?: string;
  code?: string;
  offset?: number | string;
  cache?: boolean;
}

/** The old flag also recorded which PDF an actor used as its sheet. */
const SHEET_FLAG = 'ActorSheet';
const DATA_FLAG = 'PDFData';

/** `offset` was typed `number | string` and really did hold both. */
function toOffset(value: number | string | undefined): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) ? parsed : 0;
}

/**
 * Turn every legacy journal entry into an Item of this module's subtype.
 *
 * Returns how many it converted, so the caller can tell the GM something
 * true rather than "done".
 */
export async function migrateJournalPdfsToItems(): Promise<number> {
  const entries = game.journal?.filter((entry: { getFlag(s: string, k: string): unknown }) =>
    Boolean(entry.getFlag(MODULE_ID, DATA_FLAG)),
  );
  if (!entries?.length) return 0;

  const payloads = entries.map((entry: { name: string; getFlag(s: string, k: string): unknown }) => {
    const legacy = entry.getFlag(MODULE_ID, DATA_FLAG) as LegacyPdfData;
    return {
      name: legacy.name || entry.name,
      type: PDF_TYPE,
      system: {
        url: legacy.url ?? '',
        code: legacy.code ?? '',
        offset: toOffset(legacy.offset),
        cache: legacy.cache ?? true,
      },
    };
  });

  // One create call rather than one per entry: a world with a shelf of
  // rulebooks would otherwise fire dozens of separate document creations,
  // each with its own render and its own socket broadcast.
  await CONFIG.Item.documentClass.createDocuments(payloads);
  return payloads.length;
}

/**
 * Point actors at the Item that replaced their journal entry.
 *
 * The old flag held a journal id, which now means nothing. Matching on the
 * file URL is what survives the move.
 */
export async function relinkActorSheets(): Promise<number> {
  const actors = game.actors ?? [];
  const byUrl = new Map<string, string>();
  for (const item of game.items) {
    if (isPdfItem(item) && item.system.url && item.id) byUrl.set(item.system.url, item.id);
  }

  let relinked = 0;
  for (const actor of actors) {
    const legacyId = actor.getFlag(MODULE_ID, SHEET_FLAG);
    if (typeof legacyId !== 'string') continue;

    const journal = game.journal?.get(legacyId);
    const url = (journal?.getFlag(MODULE_ID, DATA_FLAG) as LegacyPdfData | undefined)?.url;
    const itemId = url ? byUrl.get(url) : undefined;
    if (!itemId) continue;

    await actor.setFlag(MODULE_ID, 'sheetItemId', itemId);
    relinked += 1;
  }
  return relinked;
}

export const migrations = createMigrationRunner({
  systemId: MODULE_ID,
  migrations: [
    {
      version: '1.0.0',
      description: 'move PDFs from journal entries to items, and relink actor sheets',
      async fn() {
        const converted = await migrateJournalPdfsToItems();
        const relinked = await relinkActorSheets();
        ui.notifications?.info(
          game.i18n.format('PDF_CHARACTER_SHEET.Migration.done', { converted, relinked }),
        );
      },
    },
  ],
});
