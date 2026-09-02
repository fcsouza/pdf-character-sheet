/**
 * `@PDF[code|page=12]{Player's Handbook}` in any rich text field becomes a
 * link that opens the PDF at that page.
 *
 * The v10 version registered the pattern and then, separately, bound click
 * handlers with jQuery every time a chat message rendered. v13's enricher
 * config takes an `onRender` callback that fires when the enriched content
 * enters the DOM, so the link and its behaviour are declared in one place
 * and the jQuery pass disappears.
 */
import type { EnricherRegistration } from '@vttforge/core';
import { PDF_TYPE } from './constants.js';
import { PdfViewer } from './apps/pdf-viewer.js';

/** `@PDF[reference]{display text}` */
const PATTERN = /@PDF\[(.+?)\]\{(.+?)\}/g;

interface PdfItemLike {
  name: string;
  system: { url: string; code: string };
  testUserPermission?: (user: unknown, level: string) => boolean;
}

/** Find a PDF item by its name or its shorthand code. */
function findPdf(reference: string): PdfItemLike | undefined {
  const items = game.items?.filter(
    (item: { type: string }) => item.type === PDF_TYPE,
  ) as PdfItemLike[] | undefined;
  return items?.find((item) => item.name === reference || item.system.code === reference);
}

/** Page number out of `page=12`, or 1 when absent or malformed. */
function parsePage(query: string | undefined): number {
  if (!query) return 1;
  const [, value] = query.split('=');
  const page = Number.parseInt(value ?? '', 10);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export const pdfEnricher: EnricherRegistration = {
  // Registered as `pdf-character-sheet.link`. The prefix is what keeps this
  // from colliding with any other package that also names its enricher `link`.
  id: 'link',
  pattern: PATTERN,

  enricher: async (match: RegExpMatchArray) => {
    const [, reference, displayText] = match;
    const [nameOrCode, query] = (reference ?? '').split('|');
    const item = nameOrCode ? findPdf(nameOrCode) : undefined;

    // No such PDF, or the reader is not allowed to see it: render the text
    // without a link rather than advertising a document they cannot open.
    const visible = item?.testUserPermission?.(game.user, 'LIMITED') ?? Boolean(item);
    if (!item || !visible) {
      const span = document.createElement('span');
      span.textContent = displayText ?? '';
      return span;
    }

    const page = parsePage(query);
    const anchor = document.createElement('a');
    anchor.className = 'pdf-character-sheet-link';
    anchor.dataset.reference = nameOrCode ?? '';
    anchor.dataset.page = String(page);
    anchor.textContent = displayText ?? '';
    anchor.title = game.i18n.format('PDF_CHARACTER_SHEET.Enricher.open', {
      name: item.name,
      page,
    });
    return anchor;
  },

  onRender: (element: HTMLElement) => {
    for (const anchor of element.querySelectorAll<HTMLAnchorElement>(
      'a.pdf-character-sheet-link',
    )) {
      anchor.addEventListener('click', (event) => {
        event.preventDefault();
        const reference = anchor.dataset.reference ?? '';
        const item = findPdf(reference);
        if (!item?.system.url) {
          ui.notifications?.error(
            game.i18n.format('PDF_CHARACTER_SHEET.Enricher.notFound', { reference }),
          );
          return;
        }
        void new PdfViewer({
          url: item.system.url,
          title: item.name,
          page: Number(anchor.dataset.page ?? '1'),
        }).render({ force: true });
      });
    }
  },
};
