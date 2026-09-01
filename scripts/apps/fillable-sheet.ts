/**
 * A form-fillable PDF used as an actor sheet.
 *
 * The contract is the one PDFoundry established and it is worth restating,
 * because nothing about it is obvious: **the name of a field in the PDF is
 * the path of the property it writes on the document.** A text field named
 * `system.health.value` reads and writes `actor.system.health.value`. The
 * author draws the sheet in a PDF editor and names the fields; no code here
 * knows anything about any particular game system.
 *
 * pdf.js draws two layers. The canvas is the page as ink. The annotation
 * layer above it is real `<input>`, `<select>` and `<textarea>` elements —
 * that is what makes the page fillable, and what this reads and writes.
 *
 * The v10 version bound a handler to every input on every render and used
 * jQuery to tell the input types apart. This listens once, on the container,
 * and lets events bubble.
 */
import * as pdfjs from 'pdfjs-dist';
import { MODULE_ID } from '../constants.js';
import { themeClass } from '../settings.js';

const { ApplicationV2 } = foundry.applications.api;

/**
 * A link service that does nothing.
 *
 * The annotation layer insists on one, but a character sheet has no reason to
 * follow links out of itself, and pdf.js does not export a no-op version from
 * its main entry.
 */
const NO_LINKS = {
  externalLinkTarget: 0,
  externalLinkRel: 'noopener noreferrer nofollow',
  addLinkAttributes() {},
  getDestinationHash: () => '',
  getAnchorUrl: () => '',
} as never;

/** Where the chosen PDF is remembered, per actor. */
export const SHEET_FLAG = 'sheetItemId';

/**
 * Paths a PDF is allowed to write.
 *
 * Without this a field named `_id` or `items` would let a drawing tool
 * corrupt the document. Only the system data and the name are in scope.
 */
function writablePath(path: string): boolean {
  return path === 'name' || path.startsWith('system.');
}

interface FillableOptions {
  document: { name: string; system: object; update(delta: object): Promise<unknown> };
  url: string;
  title?: string;
}

export class FillablePdfSheet extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    classes: [MODULE_ID, 'fillable-pdf'],
    window: { resizable: true },
    position: { width: 860, height: 1000 },
  };

  #url: string;
  #doc?: pdfjs.PDFDocumentProxy;
  #document: FillableOptions['document'];

  constructor(options: FillableOptions) {
    super(options as never);
    this.#url = options.url;
    this.#document = options.document;
  }

  /** The document's current values, flattened to the paths a PDF field names. */
  #flatten(): Record<string, unknown> {
    return foundry.utils.flattenObject({
      name: this.#document.name,
      system: this.#document.system,
    });
  }

  /** Publish the reader's chosen palette on the window element. */
  _onFirstRender(context: unknown, options: unknown): void {
    const theme = themeClass();
    if (theme) this.element?.classList.add(theme);
    super._onFirstRender?.(context as never, options as never);
  }

  async _renderHTML(): Promise<HTMLElement> {
    const container = document.createElement('div');
    container.className = 'pdf-pages';

    this.#doc ??= await pdfjs.getDocument(this.#url).promise;
    const page = await this.#doc.getPage(1);
    const viewport = page.getViewport({ scale: 1.5 });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext('2d');

    const layer = document.createElement('div');
    layer.className = 'annotation-layer';

    if (context) {
      // ENABLE_FORMS is what turns annotations into real form controls. Without
      // it the fields render as flat ink and nothing is editable.
      await page.render({
        canvas,
        canvasContext: context,
        viewport,
        annotationMode: pdfjs.AnnotationMode.ENABLE_FORMS,
      }).promise;

      const annotations = await page.getAnnotations({ intent: 'display' });
      // The constructor wants every collaborator the full viewer would pass.
      // We render form fields and nothing else, so the ones that drive links,
      // editing and accessibility are deliberately absent.
      const layerRenderer = new pdfjs.AnnotationLayer({
        div: layer,
        page,
        viewport,
        accessibilityManager: undefined,
        annotationCanvasMap: undefined,
        annotationEditorUIManager: undefined,
        structTreeLayer: undefined,
        commentManager: undefined,
        linkService: NO_LINKS,
        annotationStorage: this.#doc.annotationStorage,
      });
      await layerRenderer.render({
        annotations,
        viewport: viewport.clone({ dontFlip: true }),
        div: layer,
        page,
        linkService: NO_LINKS,
        renderForms: true,
      } as never);
    }

    container.append(canvas, layer);
    this.#seed(layer);
    return container;
  }

  /** Copy the document's values into the freshly rendered fields. */
  #seed(layer: HTMLElement): void {
    const values = this.#flatten();
    for (const field of layer.querySelectorAll<HTMLInputElement>('input, select, textarea')) {
      const path = field.name;
      if (!path || !writablePath(path)) continue;
      const value = values[path];
      if (value === undefined) continue;
      if (field.type === 'checkbox' || field.type === 'radio') {
        field.checked = Boolean(value);
      } else {
        field.value = String(value);
      }
    }
  }

  _onRender(context: unknown, options: unknown): void {
    // One listener on the container rather than one per field: the annotation
    // layer is rebuilt on every page render, and per-field listeners would be
    // re-bound each time (and leak the old ones).
    this.element?.addEventListener('change', (event: Event) => {
      void this.#onFieldChange(event);
    });
    super._onRender?.(context as never, options as never);
  }

  async #onFieldChange(event: Event): Promise<void> {
    const field = event.target as HTMLInputElement | null;
    if (!field?.name) return;

    const path = field.name;
    if (!writablePath(path)) {
      ui.notifications?.warn(
        game.i18n.format('PDF_CHARACTER_SHEET.Fillable.rejectedPath', { path }),
      );
      return;
    }

    const value =
      field.type === 'checkbox' || field.type === 'radio' ? field.checked : field.value;

    // Only write when it actually differs. A PDF fires change events on
    // fields the user merely tabbed through, and each one would otherwise be
    // a document update and a re-render.
    if (this.#flatten()[path] === value) return;

    await this.#document.update(foundry.utils.expandObject({ [path]: value }));
  }
}
