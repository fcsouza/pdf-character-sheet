/**
 * Sharing a page with the table.
 *
 * The GM turns to a page and everyone follows. Two messages: `setView` moves
 * viewers to a page, `preload` warms a client's cache before a session so the
 * first open is not a download.
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

type Message = (SetView | Preload) & {
  /** Who should act on it. `null` means everyone. */
  userIds: string[] | null;
};

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

export function registerSocket(): void {
  game.socket?.on(CHANNEL, (message: Message) => {
    // A message for named users is ignored by everyone else. The GM's own
    // client receives its own broadcast too, which is why `setView` has to be
    // safe to apply to a viewer that is already on that page.
    if (message.userIds !== null && !message.userIds.includes(game.userId ?? '')) return;

    if (message.type === 'setView') {
      onSetView(message);
    } else if (message.type === 'preload') {
      // Deliberately unawaited: warming a cache must not hold up the socket.
      void fetchPdf(message.url, cacheBudget()).catch(() => {
        // A failed preload just means the first open pays for the download.
      });
    }
  });
}

/** Send everyone (or the named users) to a page. */
export function shareView(view: Omit<SetView, 'type'>, userIds: string[] | null = null): void {
  const message: Message = { type: 'setView', ...view, userIds };
  game.socket?.emit(CHANNEL, message);
  onSetView(message);
}

/** Ask clients to warm their cache for a file. */
export function requestPreload(url: string, userIds: string[] | null = null): void {
  game.socket?.emit(CHANNEL, { type: 'preload', url, userIds } satisfies Message);
}
