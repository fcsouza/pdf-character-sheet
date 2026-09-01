/**
 * PDF Character Sheet — entry point.
 *
 * A port of the v10 module onto Foundry v13 and the VTTForge SDK. The old
 * entry wired everything by hand across five files; this declares what the
 * module contributes and lets the SDK apply it in the right hook.
 */
import './foundry-globals.js';
import { registerModule } from '@vttforge/core';
import { api } from './api.js';
import { FillablePdfSheet } from './apps/fillable-sheet.js';
import { PdfSheet } from './apps/pdf-sheet.js';
import { PdfViewer } from './apps/pdf-viewer.js';
import { MODULE_ID, PDF_TYPE } from './constants.js';
import { PdfData } from './data/pdf-data.js';
import { registerCommands } from './commands.js';
import { registerPdfEnricher } from './enricher.js';
import { migrations } from './migrations.js';
import { registerSettings } from './settings.js';
import { registerSocket } from './socket.js';

registerModule({
  id: MODULE_ID,
  itemDataModels: { pdf: PdfData },

  onReady: async () => {
    registerSocket();
    // GM only, and before anything reads an item: a world coming from v10
    // has its PDFs somewhere this version does not look.
    if (game.user?.isGM) await migrations.run();
  },

  onAfterInit: () => {
    registerSettings();
    migrations.register();
    registerPdfEnricher();
    registerCommands();

    const { Actors, Items } = foundry.documents.collections;

    // Offered for every actor type, never as the default: a PDF sheet is a
    // choice a GM makes per actor, and hijacking the system's own sheet would
    // be the wrong kind of surprise.
    Actors.registerSheet(MODULE_ID, FillablePdfSheet, {
      makeDefault: false,
      label: 'PDF_CHARACTER_SHEET.Fillable.title',
    });

    Items.registerSheet(MODULE_ID, PdfSheet, {
      types: [PDF_TYPE],
      makeDefault: true,
      label: 'PDF_CHARACTER_SHEET.Sheet.pdf.title',
    });

    const handle = game.modules.get(MODULE_ID);
    if (handle) handle.api = api;
  },
});
