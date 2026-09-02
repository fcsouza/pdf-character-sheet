/**
 * The PDF item — a PDF file registered in the world, with the metadata needed
 * to open it at the right page.
 *
 * Ported from the v10 `PDFData` interface, which was a plain TypeScript type
 * with no runtime validation: `offset` was declared `number | string` and the
 * code coerced it at every read. A data model states the shape once and
 * Foundry enforces it.
 */
import { BaseTypeDataModel, fields } from '@vttforge/core';

/** What kind of PDF this is, which decides how the viewer opens it. */
export const PDF_TYPES = ['static', 'fillable', 'actor'] as const;
export type PdfType = (typeof PDF_TYPES)[number];

export const definePdfSchema = () => {
  const f = fields();
  return {
    /**
     * Where the PDF lives on the server.
     *
     * Blank until a file is chosen, and that is not an oversight. Foundry
     * creates an Item before any sheet exists to pick a file in, so the
     * schema has to describe an item that does not have one yet.
     *
     * It did not, and the item could not be created at all. `FilePathField`
     * starts at `null` on its own, `nullable: false` refused that, and the
     * Create Item dialog has nowhere to type a path, so every attempt died
     * on "url: may not be null". The migration hit the other half of it: its
     * own `url ?? ''` fallback was refused by `blank: false`.
     */
    url: new f.FilePathField({
      required: true,
      nullable: false,
      blank: true,
      initial: '',
      categories: ['TEXT'],
    }),
    /**
     * Shorthand used to reference the PDF from chat, e.g. `@PDF[PHB|page=10]`.
     */
    code: new f.StringField({ required: true, nullable: false, blank: true, initial: '' }),
    /**
     * Difference between the PDF's own page numbering and the book's printed
     * numbering. A book whose page 1 is the PDF's page 5 has an offset of 4.
     */
    offset: new f.NumberField({
      required: true,
      nullable: false,
      integer: true,
      initial: 0,
    }),
    /**
     * Static, fillable, or bound to an actor.
     *
     * Named `pdfType` rather than `type`: `type` is the document's own
     * discriminator, and a schema field of that name collides with it.
     */
    pdfType: new f.StringField({
      required: true,
      nullable: false,
      blank: false,
      choices: PDF_TYPES,
      initial: 'static',
    }),
    /** Whether the user asked for this PDF to be cached locally. */
    cache: new f.BooleanField({ required: true, nullable: false, initial: false }),
  };
};

export class PdfData extends BaseTypeDataModel(definePdfSchema) {
  /** The page to open on, once the book's own numbering is accounted for. */
  declare printedPage: (bookPage: number) => number;

  override prepareDerivedData(): void {
    const offset = this.offset;
    this.printedPage = (bookPage: number) => bookPage + offset;
  }
}

/** The shape of `item.system` for a PDF item. */
export type PdfSystem = PdfData['$inferData'];
