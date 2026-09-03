/**
 * The sheet templates, read as text.
 *
 * `BaseItemSheet` sets `tag: 'form'`, so the application element already is a
 * form. A template that opens its own `<form>` puts every field inside a
 * nested one, and a nested form owns its fields: `new FormData(outer)` then
 * returns nothing and the submit saves nothing. That is what shipped, and it
 * lost every edit on close without a word.
 *
 * A test cannot render Foundry here, but it can read the file, and the file
 * is where the mistake lives.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// From the package root, which is where Vitest runs. `import.meta.url` is
// rewritten by the transform and does not resolve back to a real path here.
const templatesDir = join(process.cwd(), 'templates');

function everyTemplate(): { name: string; source: string }[] {
  const out: { name: string; source: string }[] = [];
  for (const dir of readdirSync(templatesDir, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    for (const file of readdirSync(join(templatesDir, dir.name))) {
      if (!file.endsWith('.hbs')) continue;
      const name = `${dir.name}/${file}`;
      out.push({ name, source: readFileSync(join(templatesDir, dir.name, file), 'utf8') });
    }
  }
  return out;
}

describe('the sheet templates', () => {
  it('has some to check', () => {
    expect(everyTemplate().length).toBeGreaterThan(0);
  });

  for (const { name, source } of everyTemplate()) {
    it(`${name} does not open a form the application already is`, () => {
      // Comments may mention one; markup may not contain one.
      const withoutComments = source.replace(/\{\{!--[\s\S]*?--\}\}/g, '');
      expect(withoutComments).not.toMatch(/<form[\s>]/);
    });
  }
});
