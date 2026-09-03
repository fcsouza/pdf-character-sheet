/**
 * The module's public API, on `game.modules.get('pdf-character-sheet').api`.
 *
 * Other modules and macros call this, so it is the one surface here that
 * cannot change casually. It is deliberately smaller than the v10 API: that
 * one exposed theme registration and a `DEBUG` bag alongside the useful
 * parts, and those described a viewer this port no longer embeds.
 *
 * Lookups are by code or name because that is what a macro has to hand. The
 * item id would be more precise and nobody types one.
 */
import { PdfViewer } from './apps/pdf-viewer.js';
import { PDF_TYPE } from './constants.js';
import { type ExportResult, exportToJournal } from './export.js';
import { requestPreload, shareView } from './socket.js';

interface PdfItem {
  id: string;
  name: string;
  system: { url: string; code: string; offset: number };
}

/**
 * Refuse a call that would reach across to other people's clients.
 *
 * Both `share` and `preload` are dropped on arrival unless a GM sent them, so
 * a player calling either would see nothing happen and have nothing to read.
 * Saying so here turns silence into a message.
 */
function requireGm(method: string): void {
  if (game.user?.isGM !== true) {
    throw new Error(`Only a Gamemaster can call ${method}().`);
  }
}

/**
 * Find the item, and refuse the ones that have no file yet.
 *
 * A PDF item is creatable before a file is chosen, because Foundry makes the
 * document first and the sheet is where you pick one. Every call below needs
 * a file, so the two failures are named separately: a macro that mistyped a
 * code and a macro that found a real item nobody has pointed at a PDF are
 * different mistakes.
 */
function requirePdf(codeOrName: string): PdfItem {
  const item = api.find(codeOrName);
  if (!item) throw new Error(`No PDF found matching "${codeOrName}".`);
  if (!item.system.url) {
    throw new Error(`The PDF item "${item.name}" has no file chosen yet.`);
  }
  return item;
}

function allPdfs(): PdfItem[] {
  return (game.items?.filter((item: { type: string }) => item.type === PDF_TYPE) ??
    []) as PdfItem[];
}

export interface PdfApi {
  /** Every PDF item in the world. */
  all(): PdfItem[];
  /** Find one by its shorthand code, then by name. */
  find(codeOrName: string): PdfItem | undefined;
  /** Open a PDF locally. The page is the printed one; the item's offset applies. */
  open(codeOrName: string, page?: number): Promise<void>;
  /** Open it for everyone, or for the named users. */
  share(codeOrName: string, page?: number, userIds?: string[] | null): void;
  /** Ask clients to cache the file now rather than on first open. */
  preload(codeOrName: string, userIds?: string[] | null): void;
  /**
   * Copy every PDF into a journal of core-typed pages, so the library keeps
   * working once this module is gone. Run it before uninstalling. Nothing is
   * deleted, and running it twice replaces what the last run wrote.
   */
  exportToJournal(): Promise<ExportResult>;
}

export const api: PdfApi = {
  all: allPdfs,

  find(codeOrName) {
    const wanted = codeOrName.toLowerCase();
    const items = allPdfs();
    return (
      items.find((item) => item.system.code.toLowerCase() === wanted) ??
      items.find((item) => item.name.toLowerCase() === wanted)
    );
  },

  async open(codeOrName, page = 1) {
    const item = requirePdf(codeOrName);
    // The offset maps the page printed on the paper to the page in the file:
    // a rulebook whose page 1 is the eighth sheet has an offset of 7.
    await new PdfViewer({
      url: item.system.url,
      title: item.name,
      page: page + item.system.offset,
    }).render({ force: true });
  },

  share(codeOrName, page = 1, userIds = null) {
    requireGm('share');
    const item = requirePdf(codeOrName);
    shareView(
      { url: item.system.url, title: item.name, page: page + item.system.offset },
      userIds,
    );
  },

  preload(codeOrName, userIds = null) {
    requireGm('preload');
    const item = requirePdf(codeOrName);
    requestPreload(item.system.url, userIds);
  },

  exportToJournal,
};
