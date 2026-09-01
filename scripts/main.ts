/**
 * PDF Character Sheet — entry point.
 *
 * A port of the v10 module onto Foundry v13 and the VTTForge SDK. The old
 * entry wired everything by hand across five files; this declares what the
 * module contributes and lets the SDK apply it in the right hook.
 */
import './foundry-globals.js';
import { moduleSubType, registerModule } from '@vttforge/core';
import { PdfSheet } from './apps/pdf-sheet.js';
import { PdfViewer } from './apps/pdf-viewer.js';
import { PdfData } from './data/pdf-data.js';

const MODULE_ID = 'pdf-character-sheet';

/** The Item subtype key Foundry files this module's PDFs under. */
export const PDF_TYPE = moduleSubType(MODULE_ID, 'pdf');

export interface PdfApi {
  /** Open a PDF item's file in a viewer window. */
  open(itemId: string, page?: number): Promise<void>;
}

registerModule({
  id: MODULE_ID,
  itemDataModels: { pdf: PdfData },

  onAfterInit: () => {
    const { Items } = foundry.documents.collections;
    Items.registerSheet(MODULE_ID, PdfSheet, {
      types: [PDF_TYPE],
      makeDefault: true,
      label: 'PDF_CHARACTER_SHEET.Sheet.pdf.title',
    });

    const api: PdfApi = {
      async open(itemId, page) {
        const item = game.items?.get(itemId);
        if (item?.type !== PDF_TYPE) return;
        const { url } = item.system;
        if (!url) return;
        await new PdfViewer({ url, title: item.name, page }).render({ force: true });
      },
    };
    const handle = game.modules.get(MODULE_ID);
    if (handle) handle.api = api;
  },
});
