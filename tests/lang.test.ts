/**
 * The strings Foundry looks up on its own.
 *
 * A document subtype has a label under `TYPES.<Document>.<key>`, and for a
 * module the key carries the module id. Without it Foundry shows the raw
 * path: the sheet was titled `TYPES.Item.pdf-character-sheet.pdf: tete`, and
 * the Create Item dropdown offered `pdf-character-sheet.pdf`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// From the package root, which is where Vitest runs.
const read = (name: string) => readFileSync(join(process.cwd(), name), 'utf8');

const lang = JSON.parse(read('lang/en.json')) as Record<
  string,
  Record<string, Record<string, Record<string, string>>>
>;

const manifest = JSON.parse(read('module.json')) as {
  id: string;
  documentTypes: Record<string, Record<string, unknown>>;
};

describe('the English strings', () => {
  it('names every subtype the manifest declares', () => {
    for (const [document, subtypes] of Object.entries(manifest.documentTypes)) {
      for (const subtype of Object.keys(subtypes)) {
        // Foundry reads TYPES.<Document>.<module id>.<subtype>.
        const label = lang.TYPES?.[document]?.[manifest.id]?.[subtype];
        expect(label, `TYPES.${document}.${manifest.id}.${subtype} is missing`).toBeTruthy();
      }
    }
  });
});
