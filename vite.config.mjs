import vttforge from '@vttforge/vite-plugin';
import { defineConfig } from 'vite';

/**
 * Vite config for PDF Character Sheet.
 *
 * `@vttforge/vite-plugin` owns the build contract for both systems and
 * modules — `kind: 'module'` tells the plugin to write `dist/module.json`
 * (instead of `system.json`) and to base chunk URLs at `/modules/pdf-character-sheet/`.
 */
export default defineConfig({
  plugins: [vttforge({ id: 'pdf-character-sheet', kind: 'module', entry: 'scripts/main.ts' })],
});
