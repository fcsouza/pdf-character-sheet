/**
 * The PDF window.
 *
 * The v10 version reached into a vendored copy of pdf.js and drove its
 * viewer's private event bus. This renders into a canvas with the npm
 * package instead: fewer moving parts, and the bundler owns the worker.
 */
import * as pdfjs from 'pdfjs-dist';
import { BaseApplication } from '@vttforge/core';
import { themeClass } from '../settings.js';
import { pickPlayers } from './pickers.js';
import { shareView } from '../socket.js';
import type { PDFDocumentProxy } from 'pdfjs-dist';

// pdf.js parses in a worker. Vite rewrites this to the emitted asset, which
// Foundry then serves from the module's own folder.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href;

export interface PdfViewerOptions {
  /** Where the PDF lives, as Foundry serves it. */
  url: string;
  /** Window title. */
  title: string;
  /** Page to open on, 1-based. */
  page?: number;
}

export class PdfViewer extends BaseApplication() {
  static DEFAULT_OPTIONS = {
    classes: ['pdf-character-sheet', 'pdf-viewer'],
    window: {
      resizable: true,
      icon: 'fa-solid fa-file-pdf',
      // Sharing a page was API-only. The GM turning the page is the whole
      // point of the socket, and it had no way in.
      controls: [
        {
          action: 'sharePage',
          icon: 'fa-solid fa-users',
          label: 'PDF_CHARACTER_SHEET.Controls.share',
          ownership: 'OWNER',
        },
      ],
    },
    position: { width: 860, height: 900 },
    actions: { sharePage: PdfViewer._onSharePage },
  };

  /** Send the page currently open to the players who ask for it. */
  static async _onSharePage(this: PdfViewer): Promise<void> {
    const userIds = await pickPlayers();
    // Dismissed. Sending to the whole table would be the opposite of what
    // closing the dialog means.
    if (userIds === undefined) return;
    if (userIds.length === 0) {
      ui.notifications?.info(game.i18n.localize('PDF_CHARACTER_SHEET.Pick.sentNobody'));
      return;
    }
    shareView({ url: this.url, title: this.title, page: this.page }, userIds);
    ui.notifications?.info(
      game.i18n.format('PDF_CHARACTER_SHEET.Pick.sent', {
        page: this.page,
        count: userIds.length,
      }),
    );
  }

  #url: string;
  #page: number;
  #doc: PDFDocumentProxy | null = null;

  constructor(options: PdfViewerOptions & Record<string, unknown>) {
    super({ ...options, window: { title: options.title } });
    this.#url = options.url;
    this.#page = options.page ?? 1;
  }

  /** The file this viewer is showing. Read by the socket to find it again. */
  get url(): string {
    return this.#url;
  }

  /** The page currently drawn. */
  get page(): number {
    return this.#page;
  }

  /**
   * Turn to a page and redraw.
   *
   * Clamped to the document, and a no-op when already there — the socket
   * broadcasts reach the sender too, so this is called with the current page
   * more often than not.
   */
  async goToPage(page: number): Promise<void> {
    const target = Math.max(1, Math.trunc(page));
    if (target === this.#page) return;
    this.#page = target;
    await this.render();
  }

  /** Renders the current page into a fresh canvas. */
  /** Publish the reader's chosen palette on the window element. */
  _onFirstRender(context: unknown, options: unknown): void {
    const theme = themeClass();
    if (theme) this.element?.classList.add(theme);
    super._onFirstRender?.(context as never, options as never);
  }

  async _renderHTML(): Promise<HTMLElement> {
    const container = document.createElement('div');
    container.className = 'pdf-viewer-body';

    this.#doc ??= await pdfjs.getDocument(this.#url).promise;
    const page = await this.#doc.getPage(Math.min(this.#page, this.#doc.numPages));

    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext('2d');
    if (context) {
      await page.render({ canvas, canvasContext: context, viewport }).promise;
    }
    container.appendChild(canvas);
    return container;
  }

  /** Release the parsed document when the window closes. */
  async close(options?: Record<string, unknown>): Promise<this> {
    await this.#doc?.destroy();
    this.#doc = null;
    return super.close(options) as Promise<this>;
  }
}
