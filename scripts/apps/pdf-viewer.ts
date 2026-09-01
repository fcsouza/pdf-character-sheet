/**
 * The PDF window.
 *
 * The v10 version reached into a vendored copy of pdf.js and drove its
 * viewer's private event bus. This renders into a canvas with the npm
 * package instead: fewer moving parts, and the bundler owns the worker.
 */
import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';

// pdf.js parses in a worker. Vite rewrites this to the emitted asset, which
// Foundry then serves from the module's own folder.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href;

const { ApplicationV2 } = foundry.applications.api;

export interface PdfViewerOptions {
  /** Where the PDF lives, as Foundry serves it. */
  url: string;
  /** Window title. */
  title: string;
  /** Page to open on, 1-based. */
  page?: number;
}

export class PdfViewer extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    classes: ['pdf-character-sheet', 'pdf-viewer'],
    window: { resizable: true, icon: 'fa-solid fa-file-pdf' },
    position: { width: 860, height: 900 },
  };

  #url: string;
  #page: number;
  #doc: PDFDocumentProxy | null = null;

  constructor(options: PdfViewerOptions & Record<string, unknown>) {
    super({ ...options, window: { title: options.title } });
    this.#url = options.url;
    this.#page = options.page ?? 1;
  }

  /** Renders the current page into a fresh canvas. */
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

  _replaceHTML(result: HTMLElement, content: HTMLElement): void {
    content.replaceChildren(result);
  }

  /** Release the parsed document when the window closes. */
  async close(options?: Record<string, unknown>): Promise<this> {
    await this.#doc?.destroy();
    this.#doc = null;
    return super.close(options) as Promise<this>;
  }
}
