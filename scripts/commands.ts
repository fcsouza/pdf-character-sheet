/**
 * Chat commands.
 *
 * Foundry has no command registry, so the convention is to read chat
 * messages before they are sent and swallow the ones that are commands.
 * Returning false from `chatMessage` stops the message from posting.
 */
import { purge, size } from './cache.js';
import { exportToJournal } from './export.js';
import { MODULE_ID } from './constants.js';

/** Bytes rendered the way a person reads them. */
function humanBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

const COMMANDS: Record<string, () => Promise<string>> = {
  async purge() {
    const freed = await size();
    await purge();
    return game.i18n.format('PDF_CHARACTER_SHEET.Commands.purged', { size: humanBytes(freed) });
  },
  async size() {
    return game.i18n.format('PDF_CHARACTER_SHEET.Commands.size', {
      size: humanBytes(await size()),
    });
  },
  async export() {
    const result = await exportToJournal();
    if (result.skipped.length > 0) {
      ui.notifications?.warn(
        game.i18n.format('PDF_CHARACTER_SHEET.Commands.exportSkipped', {
          names: result.skipped.join(', '),
        }),
      );
    }
    return game.i18n.format('PDF_CHARACTER_SHEET.Commands.exported', {
      count: result.written,
      journal: result.journal.name,
    });
  },
};

export function registerCommands(): void {
  Hooks.on('chatMessage', (_log: unknown, message: string) => {
    const match = /^\/pdf\s+(\w+)\s*$/.exec(message.trim());
    if (!match) return;

    const command = COMMANDS[match[1] ?? ''];
    if (!command) {
      ui.notifications?.warn(
        game.i18n.format('PDF_CHARACTER_SHEET.Commands.unknown', { command: match[1] ?? '' }),
      );
      return false;
    }

    void command().then((result) => ui.notifications?.info(result));
    // Swallow it: the command was handled, and posting `/pdf purge` to chat
    // would tell the table nothing.
    return false;
  });
}

/** Exposed so the module API can list what `/pdf` accepts. */
export const COMMAND_NAMES = Object.keys(COMMANDS);
export { MODULE_ID };
