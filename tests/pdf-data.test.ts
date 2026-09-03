/**
 * The PDF item has to be creatable before anyone has chosen a file.
 *
 * Foundry creates the document first and the sheet is where you pick the
 * PDF, so a schema that demands a path at creation makes the item impossible
 * to create at all. It did, for one release: `FilePathField` starts at `null`
 * on its own, `nullable: false` refused that, and every attempt from the
 * Create Item dialog died on "url: may not be null".
 *
 * These read the declared options rather than running Foundry's validator,
 * which does not exist outside Foundry. That is enough to catch the mistake,
 * because the mistake was in the declaration.
 */
import { withMockFoundry } from '@vttforge/testing/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** A field constructor that records what it was given. */
class RecordingField {
  readonly options: Record<string, unknown>;
  constructor(options: Record<string, unknown> = {}) {
    this.options = options;
  }
}

const fieldClasses = {
  FilePathField: RecordingField,
  StringField: RecordingField,
  NumberField: RecordingField,
  BooleanField: RecordingField,
  HTMLField: RecordingField,
  SchemaField: RecordingField,
  ArrayField: RecordingField,
};

let restore: (() => void) | undefined;

afterEach(() => {
  restore?.();
  restore = undefined;
  vi.resetModules();
});

/** Load the schema against a Foundry whose field classes only record. */
async function declaredSchema(): Promise<Record<string, RecordingField>> {
  const mock = withMockFoundry({ foundry: { data: { fields: fieldClasses } } });
  restore = mock.restore;
  const { definePdfSchema } = await import('../scripts/data/pdf-data.js');
  return definePdfSchema() as unknown as Record<string, RecordingField>;
}

describe('the PDF item schema', () => {
  it('lets an item exist before a file is chosen', async () => {
    const schema = await declaredSchema();
    const url = schema.url.options;

    // The regression: any of these three back the item into being
    // uncreatable from the Create Item dialog, which cannot supply a path.
    expect(url.nullable).toBe(false);
    expect(url.blank).toBe(true);
    expect(url.initial).toBe('');
  });

  it('still asks for a text file when one is chosen', async () => {
    const schema = await declaredSchema();
    expect(schema.url.options.required).toBe(true);
    expect(schema.url.options.categories).toEqual(['TEXT']);
  });

  it('accepts the empty url the migration falls back to', async () => {
    // migrations.ts builds `url: legacy.url ?? ''` for a legacy entry that
    // never had one. `blank: false` used to refuse exactly that value.
    const schema = await declaredSchema();
    expect(schema.url.options.blank).toBe(true);
  });

  it('starts every other field at a usable value', async () => {
    const schema = await declaredSchema();
    expect(schema.code.options.initial).toBe('');
    expect(schema.offset.options.initial).toBe(0);
    expect(schema.pdfType.options.initial).toBe('static');
    expect(schema.cache.options.initial).toBe(false);
  });
});
