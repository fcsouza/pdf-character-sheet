/**
 * The three small dialogs: pick a sheet, pick players, read an actor's paths.
 *
 * The v10 versions were three `Application` subclasses over a shared abstract
 * `SelectApp` base, because v10 had no primitive for "ask a question and get an
 * answer". v13 does — `DialogV2.input` plus `foundry.applications.fields` —
 * so these are functions that return a value. Nothing to register, nothing to
 * name, no persisted key.
 *
 * The trap they all share: a dialog dismissed with the X resolves `undefined`,
 * not a rejection and not an empty answer. A caller that does not separate
 * "dismissed" from "answered with nothing" clears a setting the reader never
 * meant to touch. Every function here returns `undefined` for dismissal and
 * something concrete otherwise, and says so at the call site.
 */
import { MODULE_ID, PDF_TYPE } from '../constants.js';
import { actorPaths } from '../paths.js';

const { DialogV2 } = foundry.applications.api;
const { createFormGroup, createMultiSelectInput, createSelectInput } =
  foundry.applications.fields;

interface PdfItemLike {
  id: string;
  name: string;
  system: { url: string; code: string; pdfType: string };
}

interface ActorLike {
  id: string;
  name: string;
  system: unknown;
  flags?: Record<string, unknown>;
  getFlag(scope: string, key: string): unknown;
  setFlag(scope: string, key: string, value: unknown): Promise<unknown>;
  unsetFlag(scope: string, key: string): Promise<unknown>;
}

function localize(key: string, data?: Record<string, unknown>): string {
  return data ? game.i18n.format(key, data) : game.i18n.localize(key);
}

/**
 * Every PDF item, in name order.
 *
 * Deliberately not filtered by `pdfType`. That field defaults to `static`, so
 * filtering on it makes the picker empty on a fresh install — it would tell
 * someone to create a PDF item while looking straight at the one they made.
 * The kind is a hint about how a file is meant to be used, not a rule about
 * what an actor may point at; the sheet renders whatever it is given.
 */
function sheetPdfs(): PdfItemLike[] {
  const items = (game.items?.filter((item: { type: string }) => item.type === PDF_TYPE) ??
    []) as PdfItemLike[];
  return [...items].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Ask which PDF backs this actor's sheet.
 *
 * Resolves the chosen item id, `null` to mean "none — go back to the system's
 * own sheet", or `undefined` when the reader dismissed the dialog. The three
 * are different answers and the caller has to tell them apart: treating a
 * dismissal as `null` would silently unset a sheet someone spent an evening
 * filling in.
 */
export async function pickActorSheet(actor: ActorLike): Promise<string | null | undefined> {
  const options = sheetPdfs();
  if (options.length === 0) {
    ui.notifications?.warn(localize('PDF_CHARACTER_SHEET.Pick.noSheets'));
    return undefined;
  }

  const current = actor.getFlag(MODULE_ID, 'sheetItemId');
  const select = createSelectInput({
    name: 'itemId',
    options: options.map((item) => ({
      value: item.id,
      label: item.system.code ? `${item.name} (${item.system.code})` : item.name,
    })),
    value: typeof current === 'string' ? current : '',
    blank: localize('PDF_CHARACTER_SHEET.Pick.none'),
  });

  const group = createFormGroup({
    label: localize('PDF_CHARACTER_SHEET.Pick.sheetLabel'),
    hint: localize('PDF_CHARACTER_SHEET.Pick.sheetHint'),
    input: select,
  });

  const result = (await DialogV2.input({
    window: { title: localize('PDF_CHARACTER_SHEET.Pick.sheetTitle', { name: actor.name }) },
    content: group.outerHTML,
    ok: { label: localize('PDF_CHARACTER_SHEET.Pick.choose') },
  })) as { itemId?: string } | null | undefined;

  // Dismissed. Say nothing and change nothing.
  if (!result) return undefined;
  // The blank option submits an empty string, which is the reader asking for
  // no PDF sheet at all.
  return result.itemId === '' ? null : (result.itemId ?? undefined);
}

/** Apply what `pickActorSheet` returned, and report what happened. */
export async function chooseActorSheet(actor: ActorLike): Promise<void> {
  const choice = await pickActorSheet(actor);
  if (choice === undefined) return;

  if (choice === null) {
    await actor.unsetFlag(MODULE_ID, 'sheetItemId');
    ui.notifications?.info(localize('PDF_CHARACTER_SHEET.Pick.cleared', { name: actor.name }));
    return;
  }

  await actor.setFlag(MODULE_ID, 'sheetItemId', choice);
  const item = game.items?.get(choice) as PdfItemLike | undefined;
  ui.notifications?.info(
    localize('PDF_CHARACTER_SHEET.Pick.chosen', { name: item?.name ?? choice }),
  );
}

/**
 * Ask which players to send a page to.
 *
 * Resolves the chosen user ids, or `undefined` when dismissed. An empty array
 * is a real answer — "nobody" — and deliberately not the same as `null`, which
 * the socket reads as everyone. Sending to nobody is almost certainly a
 * mistake, so the caller checks rather than broadcasting.
 */
export async function pickPlayers(): Promise<string[] | undefined> {
  const users = (game.users?.filter((user: { isSelf: boolean }) => !user.isSelf) ?? []) as Array<{
    id: string;
    name: string;
    active: boolean;
  }>;

  if (users.length === 0) {
    ui.notifications?.warn(localize('PDF_CHARACTER_SHEET.Pick.noPlayers'));
    return undefined;
  }

  const input = createMultiSelectInput({
    name: 'userIds',
    type: 'checkboxes',
    options: users.map((user) => ({
      value: user.id,
      // Whether someone is logged in decides whether they see the page now or
      // never, so it belongs on the label rather than in a tooltip.
      label: user.active
        ? user.name
        : localize('PDF_CHARACTER_SHEET.Pick.offline', { name: user.name }),
    })),
  });

  const group = createFormGroup({
    label: localize('PDF_CHARACTER_SHEET.Pick.playersLabel'),
    hint: localize('PDF_CHARACTER_SHEET.Pick.playersHint'),
    input,
  });

  const result = (await DialogV2.input({
    window: { title: localize('PDF_CHARACTER_SHEET.Pick.playersTitle') },
    content: group.outerHTML,
    ok: { label: localize('PDF_CHARACTER_SHEET.Pick.send') },
  })) as { userIds?: string[] } | null | undefined;

  if (!result) return undefined;
  return result.userIds ?? [];
}

/**
 * Show the paths this actor exposes, so a sheet author can name PDF fields.
 *
 * The whole contract of a fillable sheet is that a field named for a document
 * path writes to it. Without this the author guesses at what those paths are,
 * which is how the v10 module ended up with a browser of its own.
 *
 * Read-only, and a dialog rather than a window: it is something you consult
 * while naming fields in a PDF editor, not something you keep open.
 */
export async function browseActorPaths(actor: ActorLike): Promise<void> {
  const rows = Object.entries(actorPaths(actor))
    // Flags are the module's own storage, not something a sheet author names
    // a field after, so they stay out of the reference.
    .filter(([path]) => !path.startsWith('flags.'))
    .filter(([, value]) => value === null || typeof value !== 'object')
    .sort(([a], [b]) => a.localeCompare(b));

  const table = document.createElement('table');
  table.className = 'pdf-path-browser';
  const head = table.createTHead().insertRow();
  for (const key of ['path', 'value']) {
    const th = document.createElement('th');
    th.textContent = localize(`PDF_CHARACTER_SHEET.Paths.${key}`);
    head.appendChild(th);
  }
  const body = table.createTBody();
  for (const [path, value] of rows) {
    const row = body.insertRow();
    // textContent, not innerHTML: these values come from the actor, and an
    // actor's name is whatever someone typed.
    row.insertCell().textContent = path;
    row.insertCell().textContent = String(value);
  }

  const filter = document.createElement('input');
  filter.type = 'search';
  filter.className = 'pdf-path-filter';
  filter.placeholder = localize('PDF_CHARACTER_SHEET.Paths.filter');

  const wrapper = document.createElement('div');
  wrapper.className = 'pdf-path-browser-body';
  wrapper.append(filter, table);

  await DialogV2.wait({
    window: { title: localize('PDF_CHARACTER_SHEET.Paths.title', { name: actor.name }) },
    position: { width: 560, height: 620 },
    content: wrapper.outerHTML,
    buttons: [{ action: 'close', label: localize('PDF_CHARACTER_SHEET.Paths.close'), default: true }],
    render: (_event: unknown, dialog: { element: HTMLElement }) => {
      const search = dialog.element.querySelector<HTMLInputElement>('.pdf-path-filter');
      const tbody = dialog.element.querySelector('tbody');
      search?.addEventListener('input', () => {
        const needle = search.value.trim().toLowerCase();
        for (const row of tbody?.rows ?? []) {
          const path = row.cells[0]?.textContent?.toLowerCase() ?? '';
          row.hidden = needle !== '' && !path.includes(needle);
        }
      });
    },
  });
}
