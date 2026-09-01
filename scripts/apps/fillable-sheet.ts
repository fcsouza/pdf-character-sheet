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

// ActorSheetV2, not bare ApplicationV2. Foundry's sheet machinery builds
// `actor.sheet` from the registered class, and a plain ApplicationV2 is not
// one — it leaves `actor.sheet` null with no error anywhere.
const { ActorSheetV2 } = foundry.applications.sheets;

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
 * Where a PDF field's value is stored.
 *
 * Most sheets in the wild are not drawn for any particular system. A real
 * one — a 422-field Ordem Paranormal sheet, say — names its fields `atr_int`,
 * `Nome do Personagem`, `ajuda_def`: for the human filling it in, not for a
 * document path. Refusing those would make the module useless for every
 * sheet its author did not also write.
 *
 * So there are two destinations. A field named for a system path writes
 * there, which is what makes a PDF drive an actor's real data. Everything
 * else is kept under the module's own flag, so the sheet still remembers
 * what you typed even when nothing maps.
 *
 * `_id` is refused outright. Nothing good comes of letting a drawing tool
 * rewrite a document's identity.
 */
function resolveFieldPath(fieldName: string): string | undefined {
  if (!fieldName || fieldName.includes('_id')) return undefined;
  if (fieldName === 'name' || fieldName.startsWith('system.')) return fieldName;

  // Flag keys cannot contain dots — Foundry reads those as path separators —
  // and a field named "Nome do Personagem" has spaces besides.
  const key = fieldName.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return key ? `flags.${MODULE_ID}.formData.${key}` : undefined;
}

/**
 * The actor this sheet renders. Typed structurally: the Foundry runtime is
 * `@vttforge/types`' job, and this only needs four things from it.
 */
interface SheetActor {
  name: string;
  system: object;
  flags?: object;
  getFlag(scope: string, key: string): unknown;
  update(delta: object): Promise<unknown>;
}

export class FillablePdfSheet extends ActorSheetV2 {
  static DEFAULT_OPTIONS = {
    classes: [MODULE_ID, 'fillable-pdf'],
    window: { resizable: true },
    position: { width: 860, height: 1000 },
  };

  #doc?: pdfjs.PDFDocumentProxy;

  /** ActorSheetV2 already exposes `this.document`; this just names it. */
  get actor(): SheetActor {
    return this.document as SheetActor;
  }

  /**
   * The file this actor's sheet is drawn from.
   *
   * Which PDF an actor uses is a flag on the actor pointing at a PDF item, so
   * one file can back many characters and swapping it is one setting rather
   * than a re-import.
   */
  get url(): string | undefined {
    const itemId = this.actor.getFlag(MODULE_ID, SHEET_FLAG);
    if (typeof itemId !== 'string') return undefined;
    return (game.items?.get(itemId) as { system?: { url?: string } } | undefined)?.system?.url;
  }

  /** The document's current values, flattened to the paths a PDF field names. */
  #flatten(): Record<string, unknown> {
    return foundry.utils.flattenObject({
      name: this.actor.name,
      system: this.actor.system,
      flags: this.actor.flags ?? {},
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

    const url = this.url;
    if (!url) {
      // No PDF chosen yet. Say so rather than rendering an empty window.
      const empty = document.createElement('p');
      empty.className = 'pdf-empty';
      empty.textContent = game.i18n.localize('PDF_CHARACTER_SHEET.Fillable.noPdfChosen');
      container.appendChild(empty);
      return container;
    }

    this.#doc ??= await pdfjs.getDocument(url).promise;
    const page = await this.#doc.getPage(1);
    const scale = 1.5;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext('2d');

    const layer = document.createElement('div');
    layer.className = 'annotationLayer';

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

    // The layer is positioned over the canvas, so the two need a shared
    // positioned parent. Appending both to the scrolling container instead
    // anchors the layer to that container and the fields land off the page.
    const pageEl = document.createElement('div');
    pageEl.className = 'pdf-page';
    // pdf.js lays the annotation layer out with `calc(var(--scale-factor) * Npx)`.
    // Without the variable every field collapses onto the origin, which looks
    // like the layer rendering in the top-left corner instead of over the page.
    pageEl.style.setProperty('--scale-factor', String(scale));
    pageEl.style.width = `${viewport.width}px`;
    pageEl.style.height = `${viewport.height}px`;
    pageEl.append(canvas, layer);
    container.appendChild(pageEl);
    this.#seed(layer);
    return container;
  }

  /**
   * ApplicationV2 needs both halves. `_renderHTML` builds the content and
   * `_replaceHTML` puts it in the window — declaring only the first leaves the
   * class unrenderable, and Foundry says so only when something tries.
   */
  _replaceHTML(result: HTMLElement, content: HTMLElement): void {
    content.replaceChildren(result);
  }

  /** Copy the document's values into the freshly rendered fields. */
  #seed(layer: HTMLElement): void {
    const values = this.#flatten();
    for (const field of layer.querySelectorAll<HTMLInputElement>('input, select, textarea')) {
      const path = resolveFieldPath(field.name);
      if (!path) continue;
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

    const path = resolveFieldPath(field.name);
    // Only `_id` lands here, and a sheet full of them would otherwise be a
    // sheet full of notifications. Staying quiet is the right call.
    if (!path) return;

    const value =
      field.type === 'checkbox' || field.type === 'radio' ? field.checked : field.value;

    // Only write when it actually differs. A PDF fires change events on
    // fields the user merely tabbed through, and each one would otherwise be
    // a document update and a re-render.
    if (this.#flatten()[path] === value) return;

    await this.actor.update(foundry.utils.expandObject({ [path]: value }));
  }
}
