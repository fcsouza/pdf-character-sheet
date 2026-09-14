/**
 * Module settings, through the SDK's typed wrapper.
 *
 * `PackageConfig` refuses a `get` for a key that was never registered, which
 * turns a typo into an error at the call site instead of `undefined` leaking
 * into a calculation.
 */
import { PackageConfig } from '@vttforge/core';
import { MODULE_ID } from './constants.js';

export const settings = new PackageConfig(MODULE_ID);

/** Cache budget in megabytes, as shown in the settings form. */
const DEFAULT_CACHE_MB = 256;

export function registerSettings(): void {
  settings.register('cacheSize', {
    name: 'PDF_CHARACTER_SHEET.Settings.cacheSize.name',
    hint: 'PDF_CHARACTER_SHEET.Settings.cacheSize.hint',
    scope: 'client',
    config: true,
    type: Number,
    default: DEFAULT_CACHE_MB,
    range: { min: 0, max: 4096, step: 64 },
  });

  settings.register('theme', {
    name: 'PDF_CHARACTER_SHEET.Settings.theme.name',
    hint: 'PDF_CHARACTER_SHEET.Settings.theme.hint',
    scope: 'client',
    config: true,
    type: String,
    choices: {
      '': 'PDF_CHARACTER_SHEET.Themes.default',
      'theme-net-runner': 'PDF_CHARACTER_SHEET.Themes.netRunner',
      'theme-fantasy': 'PDF_CHARACTER_SHEET.Themes.fantasy',
      'theme-trans-pride': 'PDF_CHARACTER_SHEET.Themes.transPride',
      'theme-nonbinary-pride': 'PDF_CHARACTER_SHEET.Themes.nonbinaryPride',
      'theme-rainbow-pride': 'PDF_CHARACTER_SHEET.Themes.rainbowPride',
    },
    default: '',
  });

  settings.register('reuseViewer', {
    name: 'PDF_CHARACTER_SHEET.Settings.reuseViewer.name',
    hint: 'PDF_CHARACTER_SHEET.Settings.reuseViewer.hint',
    scope: 'client',
    config: true,
    type: Boolean,
    default: true,
  });
}

/** The cache budget in bytes. Settings hold megabytes because people do. */
export function cacheBudget(): number {
  return settings.get<number>('cacheSize') * 1024 * 1024;
}

export function reuseViewer(): boolean {
  return settings.get<boolean>('reuseViewer');
}

/** The class the chosen palette is published under, or '' for the default. */
export function themeClass(): string {
  return settings.get<string>('theme');
}
