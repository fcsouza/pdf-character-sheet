/**
 * What the module does inside a real Foundry.
 *
 * The unit tests run against a mocked `foundry` global, so they prove the
 * module calls the right things. Only a running world proves Foundry accepted
 * them: that the Item sub-type is filed under the module-prefixed key, that
 * the sheets are registered against that key, that an item of the type can
 * actually be created, and that the enricher and the API are reachable.
 *
 * Nothing here opens a PDF. Rendering one needs a file, the repository ships
 * none, and a test that quietly skips the part it claims to cover is worse
 * than one that never claimed it.
 */
import { expect, test } from '@playwright/test';
import { baseUrl } from '../scripts/foundry.mjs';

const MODULE_ID = 'pdf-character-sheet';
/** Foundry files a module's sub-types under `<module id>.<type>`. */
const PDF_TYPE = `${MODULE_ID}.pdf`;

/** Foundry refuses to lay out below 1024x700 and says so in a banner. */
test.use({ viewport: { width: 1600, height: 1000 } });

/** Console errors are collected for the whole file: a stray one fails the run. */
const consoleErrors = [];

/**
 * So are deprecation warnings. Foundry names the replacement and prints the
 * stack, so a warning whose stack runs through this module means it is on
 * borrowed time, and that should fail here rather than in v16.
 */
const deprecations = [];

test.beforeEach(async ({ page }) => {
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error') consoleErrors.push(text);
    if (/deprecated since/i.test(text)) deprecations.push(text);
  });
  page.on('pageerror', (error) => consoleErrors.push(String(error)));
});

/** Join as the Gamemaster the world created on launch, and wait for `ready`. */
async function joinWorld(page) {
  await page.goto(`${baseUrl()}/join`);
  await page.waitForSelector('form[name=join] input[name=username]');
  await page.fill('form[name=join] input[name=username]', 'Gamemaster');
  await page.click('form[name=join] button[name=join]');
  await page.waitForURL('**/game');
  await page.waitForFunction(() => globalThis.game?.ready === true, null, { timeout: 60_000 });
}

/**
 * Join with the module on. Foundry reads `moduleConfiguration` at boot, so
 * turning it on needs a second join. Only the first test pays for that.
 */
async function joinWithModule(page) {
  await joinWorld(page);
  if (await page.evaluate((id) => game.modules.get(id)?.active === true, MODULE_ID)) return;
  await page.evaluate(async (id) => {
    const configuration = game.settings.get('core', 'moduleConfiguration');
    await game.settings.set('core', 'moduleConfiguration', { ...configuration, [id]: true });
  }, MODULE_ID);
  await joinWorld(page);
  expect(await page.evaluate((id) => game.modules.get(id)?.active, MODULE_ID)).toBe(true);
}

test('the module registers everything registerModule was given', async ({ page }) => {
  await joinWithModule(page);

  const registered = await page.evaluate(
    ({ moduleId, pdfType }) => ({
      itemModels: Object.keys(CONFIG.Item.dataModels ?? {}),
      itemSheets: Object.keys(CONFIG.Item.sheetClasses?.[pdfType] ?? {}),
      actorSheets: Object.keys(CONFIG.Actor.sheetClasses?.base ?? {}),
      enrichers: (CONFIG.TextEditor.enrichers ?? []).map((entry) => entry.id).filter(Boolean),
      settings: [...game.settings.settings.keys()]
        .filter((key) => key.startsWith(`${moduleId}.`))
        .sort(),
      api: Object.keys(game.modules.get(moduleId)?.api ?? {}).sort(),
    }),
    { moduleId: MODULE_ID, pdfType: PDF_TYPE },
  );

  // The prefixed key, never the bare one. A world where nothing registered
  // would still pass a check for `pdf`.
  expect(registered.itemModels).toContain(PDF_TYPE);
  expect(registered.itemModels).not.toContain('pdf');

  expect(registered.itemSheets.join(' ')).toContain(`${MODULE_ID}.pdf`);
  // The fillable sheet is offered for an actor of any type, never as default.
  expect(registered.actorSheets.join(' ')).toContain(`${MODULE_ID}.fillable`);

  expect(registered.enrichers).toContain(`${MODULE_ID}.link`);
  // `schemaVersion` is registered by the migration runner, not by hand.
  expect(registered.settings).toEqual([
    `${MODULE_ID}.cacheSize`,
    `${MODULE_ID}.reuseViewer`,
    `${MODULE_ID}.schemaVersion`,
    `${MODULE_ID}.theme`,
  ]);
  expect(registered.api).toEqual([
    'all',
    'exportToJournal',
    'find',
    'open',
    'preload',
    'share',
  ]);
});

test('a PDF item is created with its defaults and its sheet renders', async ({ page }) => {
  await joinWithModule(page);

  // The schema once made its own item impossible to create: `url` starts
  // blank and there is no field in the Create Item dialog to fill it in.
  const created = await page.evaluate(async (type) => {
    const item = await Item.implementation.create({ name: 'Player Handbook', type });
    await item.sheet.render({ force: true });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const element = item.sheet.element;
    return {
      type: item.type,
      system: { ...item.system },
      sheet: item.sheet.constructor.name,
      rendered: item.sheet.rendered,
      fields: [...element.querySelectorAll('[name^="system."]')].map((node) =>
        node.getAttribute('name'),
      ),
    };
  }, PDF_TYPE);

  expect(created.type).toBe(PDF_TYPE);
  expect(created.system).toMatchObject({
    url: '',
    code: '',
    offset: 0,
    pdfType: 'static',
    cache: false,
  });
  expect(created.rendered).toBe(true);
  expect(created.fields).toEqual(
    expect.arrayContaining([
      'system.url',
      'system.code',
      'system.offset',
      'system.pdfType',
      'system.cache',
    ]),
  );
});

test('the derived page offset applies', async ({ page }) => {
  await joinWithModule(page);

  const pages = await page.evaluate(async (type) => {
    const item = await Item.implementation.create({
      name: 'Offset book',
      type,
      system: { code: 'OFF', offset: 7 },
    });
    return { printed: item.system.printedPage(1), code: item.system.code };
  }, PDF_TYPE);

  expect(pages).toEqual({ printed: 8, code: 'OFF' });
});

test('the enricher links a reference by code and leaves an unknown one as text', async ({
  page,
}) => {
  await joinWithModule(page);

  const enriched = await page.evaluate(async (type) => {
    await Item.implementation.create({
      name: 'Monster Manual',
      type,
      system: { code: 'MM', url: 'systems/blank/never-opened.pdf' },
    });
    const enrich = foundry.applications.ux.TextEditor.implementation.enrichHTML;
    return {
      known: await enrich("@PDF[MM|page=12]{the bestiary}"),
      unknown: await enrich('@PDF[NOPE]{missing book}'),
    };
  }, PDF_TYPE);

  expect(enriched.known).toContain('the bestiary');
  expect(enriched.known).toContain('<a');
  // No such PDF: the words survive, the link does not.
  expect(enriched.unknown).toContain('missing book');
  expect(enriched.unknown).not.toContain('<a');
});

test('the API refuses a lookup that has no file, by name', async ({ page }) => {
  await joinWithModule(page);

  const refused = await page.evaluate(async (moduleId) => {
    const api = game.modules.get(moduleId).api;
    const found = api.find('MM');
    try {
      await api.open('Player Handbook');
      return { found: found?.name, error: null };
    } catch (error) {
      return { found: found?.name, error: String(error.message) };
    }
  }, MODULE_ID);

  expect(refused.found).toBe('Monster Manual');
  expect(refused.error).toContain('no file chosen');
});

test('the fillable actor sheet can be chosen and renders', async ({ page }) => {
  await joinWithModule(page);

  const chosen = await page.evaluate(async (moduleId) => {
    const actor = await Actor.implementation.create({ name: 'Smoke', type: 'base' });
    await actor.setFlag('core', 'sheetClass', `${moduleId}.fillable`);
    await actor.sheet.render({ force: true });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return { sheet: actor.sheet.constructor.name, rendered: actor.sheet.rendered };
  }, MODULE_ID);

  // The SDK renames the class to the sheet id before registering it, so the
  // key Foundry writes into the actor survives a minified rebuild. This is
  // that name coming back out of a running world.
  expect(chosen.sheet).toBe('fillable');
  expect(chosen.rendered).toBe(true);
});

test.afterAll(() => {
  // Foundry logs a few of its own errors that have nothing to do with this
  // module (a missing favicon, an audio context the browser blocks).
  const ours = consoleErrors.filter((line) => new RegExp(MODULE_ID, 'i').test(line));
  expect(ours, `console errors naming the module:\n${ours.join('\n')}`).toEqual([]);

  const ourDeprecations = deprecations.filter((line) => new RegExp(MODULE_ID, 'i').test(line));
  expect(
    ourDeprecations,
    `deprecation warnings whose stack runs through the module:\n${ourDeprecations.join('\n')}`,
  ).toEqual([]);
});
