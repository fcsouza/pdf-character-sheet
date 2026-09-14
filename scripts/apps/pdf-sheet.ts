/**
 * The PDF item sheet — where the file, code and page offset are set, and
 * where the PDF is opened from.
 */
import { BaseItemSheet, type ItemLike } from '@vttforge/core';
import { MODULE_ID } from '../constants.js';
import { PDF_TYPES, type PdfSystem } from '../data/pdf-data.js';
import { PdfViewer } from './pdf-viewer.js';

export class PdfSheet extends BaseItemSheet<ItemLike<PdfSystem>>() {
  static DEFAULT_OPTIONS = foundry.utils.mergeObject(
    super.DEFAULT_OPTIONS,
    {
      id: 'pdf-character-sheet-item',
      classes: [MODULE_ID, 'sheet', 'item', 'pdf'],
      window: {
        title: 'PDF_CHARACTER_SHEET.Sheet.pdf.title',
        icon: 'fa-solid fa-file-pdf',
      },
      position: { width: 520, height: 420 },
      actions: { openPdf: PdfSheet._onOpenPdf },
    },
    { inplace: false },
  );

  static PARTS = {
    sheet: { template: `modules/${MODULE_ID}/templates/item/pdf-sheet.hbs` },
  };

  /**
   * The PDF item this sheet is for.
   *
   * The base takes the document type as a parameter, so `this.document`
   * already carries the schema and this is a name, not a cast.
   */
  get item(): ItemLike<PdfSystem> {
    return this.document;
  }

  async _prepareContext(options: Record<string, unknown>): Promise<Record<string, unknown>> {
    const context = await super._prepareContext(options);
    const item = this.item;
    return Object.assign(context, {
      item,
      system: item.system,
      isEditable: this.isEditable,
      kinds: PDF_TYPES.map((value) => ({
        value,
        label: game.i18n.localize(`PDF_CHARACTER_SHEET.Kind.${value}`),
      })),
    });
  }

  static async _onOpenPdf(this: PdfSheet): Promise<void> {
    const { url } = this.item.system;
    if (!url) {
      ui.notifications?.warn(game.i18n.localize('PDF_CHARACTER_SHEET.Viewer.noUrl'));
      return;
    }
    await new PdfViewer({ url, title: this.item.name }).render({ force: true });
  }
}
