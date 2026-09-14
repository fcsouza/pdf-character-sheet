/**
 * Sharing a page with the table.
 *
 * The GM turns to a page and everyone follows. Two messages: `setView` moves
 * viewers to a page, `preload` warms a client's cache before a session so the
 * first open is not a download.
 *
 * Both take over someone else's screen or spend their bandwidth, so both are
 * GM-only, and the check is on the receiving end.
 *
 * **Who sent it.** Foundry's server appends the sender's user id to every
 * message it relays on a module channel, as a second argument after the
 * payload. That id comes from the authenticated session, not from anything
 * the sender wrote, so it is the one part of an incoming message worth
 * trusting. A sender id inside the payload would prove nothing: whoever
 * built the payload chose it.
 *
 * **Who receives it.** The server also routes: pass `recipients` alongside the
 * payload and only those users' clients are sent it. Filtering on arrival
 * would work too, but it means every client in the world receives a message
 * addressed to one player.
 *
 * v13 removed `ui.windows`; open applications live in
 * `foundry.applications.instances` now, keyed by id.
 */
import { fetchPdf } from './cache.js';
import { MODULE_ID } from './constants.js';
import { PdfViewer } from './apps/pdf-viewer.js';
import { cacheBudget, reuseViewer } from './settings.js';

const CHANNEL = `module.${MODULE_ID}`;

interface SetView {
  type: 'setView';
  url: string;
  title: string;
  page: number;
}

interface Preload {
  type: 'preload';
  url: string;
}

type Message = SetView | Preload;

/** Every open viewer already showing this file. */
function openViewersFor(url: string): PdfViewer[] {
  const open: PdfViewer[] = [];
  for (const app of foundry.applications.instances.values()) {
    if (app instanceof PdfViewer && app.url === url) open.push(app);
  }
  return open;
}

function onSetView(message: SetView): void {
  const existing = reuseViewer() ? openViewersFor(message.url) : [];
  if (existing.length > 0) {
    for (const viewer of existing) viewer.goToPage(message.page);
    return;
  }
  void new PdfViewer({ url: message.url, title: message.title, page: message.page }).render({
    force: true,
  });
}

/**
 * Is this a message we are willing to act on?
 *
 * Fails closed. An id the server did not send, or one naming a user who is
 * gone or is not a GM, is dropped without a notification: a player should not
 * learn anything from a message that was not meant to reach them.
 */
function senderMayCommand(senderId: unknown): boolean {
  if (typeof senderId !== 'string' || senderId === '') return false;
  return game.users?.get(senderId)?.isGM === true;
}

/**
 * Is this one of ours?
 *
 * What arrives on a socket is whatever the other end sent, so the type is
 * `unknown` and the shape is checked rather than assumed. A malformed message
 * is dropped.
 */
function isMessage(value: unknown): value is Message {
  if (typeof value !== 'object' || value === null) return false;
  // Read as loose fields, not as `Partial<SetView & Preload>`: intersecting
  // the two literal `type` values gives `never` and the checks below stop
  // compiling.
  const candidate = value as Record<string, unknown>;
  if (candidate.type === 'setView') {
    return (
      typeof candidate.url === 'string' &&
      typeof candidate.title === 'string' &&
      typeof candidate.page === 'number'
    );
  }
  return candidate.type === 'preload' && typeof candidate.url === 'string';
}

export function registerSocket(): void {
  game.socket?.on(CHANNEL, (message, senderId) => {
    if (!senderMayCommand(senderId)) return;
    if (!isMessage(message)) return;

    if (message.type === 'setView') {
      onSetView(message);
    } else if (message.type === 'preload') {
      onPreload(message.url);
    }
  });
}

/**
 * Emit to named users, or broadcast when `userIds` is null.
 *
 * The server excludes the sender from a broadcast and does not exclude them
 * from a routed send, so `recipients` is stripped of our own id and the local
 * call below is the single path that acts on this client. Without that, a GM
 * who names themselves opens the page twice.
 */
function emit(message: Message, userIds: string[] | null): void {
  if (userIds === null) {
    game.socket?.emit(CHANNEL, message);
    return;
  }
  const others = userIds.filter((id) => id !== game.userId);
  if (others.length > 0) game.socket?.emit(CHANNEL, message, { recipients: others });
}

/** Send everyone (or the named users) to a page. */
export function shareView(view: Omit<SetView, 'type'>, userIds: string[] | null = null): void {
  const message: SetView = { type: 'setView', ...view };
  emit(message, userIds);
  if (userIds === null || userIds.includes(game.userId ?? '')) onSetView(message);
}

/** Warm this client's cache, without letting a failure surface. */
function onPreload(url: string): void {
  // Deliberately unawaited and swallowed: a failed preload only means the
  // first open pays for the download.
  void fetchPdf(url, cacheBudget()).catch(() => {});
}

/**
 * Ask clients to warm their cache for a file.
 *
 * Acts locally as well as emitting, the same way `shareView` does. Foundry
 * does not deliver a socket message back to whoever sent it. A GM alone in a
 * world would otherwise see nothing happen at all: no cache, no error, and no
 * way to tell that apart from a bug.
 */
export function requestPreload(url: string, userIds: string[] | null = null): void {
  emit({ type: 'preload', url }, userIds);
  if (userIds === null || userIds.includes(game.userId ?? '')) onPreload(url);
}
