/**
 * The Foundry globals this module reaches for.
 *
 * The types come from the SDK, so a wrong namespace path stops compiling.
 * `foundry.data.feilds.StringField` is the mistake that survives review and
 * fails in front of a player, and six `any` stubs caught none of it.
 *
 * `var`, not `const`. Two `declare global` blocks naming the same global have
 * to merge, and only `var` merges. `@vttforge/testing` declares the same set
 * for tests, and a `const` on either side stops `tsc` with TS2451.
 */
import type {
  DocumentConstructor,
  FoundryConfig,
  FoundryNamespace,
  Game,
  HooksApi,
  UiApi,
} from '@vttforge/core';

declare global {
  var game: Game;
  var CONFIG: FoundryConfig;
  var Hooks: HooksApi;
  var ui: UiApi;
  var foundry: FoundryNamespace;
  /** The export command creates journal entries through it. */
  var JournalEntry: DocumentConstructor;
}

export {};
