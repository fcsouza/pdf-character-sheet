/**
 * The end-to-end run's Foundry, booted through the SDK's published harness.
 *
 * Everything that starts a container, signs the licence, installs a package and
 * writes a world lives in `@vttforge/testing/container`. This file picks the
 * packages and the names, which is what a consumer of the SDK writes.
 *
 * It used to be 274 lines of `docker` commands here, written before that
 * harness existed.
 *
 * Playwright runs `globalSetup` in one process and the specs in others, so the
 * URL crosses that boundary through `E2E_BASE_URL`. The container handle does
 * not: only the process that started it can stop it.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  foundryContainerLogs,
  startFoundryContainer,
  stopFoundryContainer,
} from '@vttforge/testing/container';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');

const MODULE_ID = 'pdf-character-sheet';

/** Fixed, so a teardown running in its own process can find the container. */
const CONTAINER = process.env.E2E_CONTAINER ?? 'pdf-character-sheet-e2e';

/** Set by `start`, read by the tests. Absolute, because it is not always localhost. */
export function baseUrl() {
  const url = process.env.E2E_BASE_URL;
  if (!url) throw new Error('Foundry has not been started: E2E_BASE_URL is not set.');
  return url;
}

/** The handle, once this process has started one. */
let running;

export async function start() {
  running = await startFoundryContainer({
    // The owner of this repository accepts Foundry's licence agreement for its
    // own end-to-end run. Anyone else answers for themselves.
    acceptLicense: true,
    name: CONTAINER,
    // Named, so the licensed Foundry download survives between runs.
    volume: process.env.E2E_VOLUME ?? 'pdf-character-sheet-e2e-data',
    port: Number(process.env.E2E_PORT ?? 30011),
    worldId: 'e2e',
    worldTitle: 'PDF Character Sheet end-to-end',
    image: process.env.E2E_FOUNDRY_IMAGE ?? 'felddy/foundryvtt:14',
    coreVersion: process.env.E2E_CORE_VERSION ?? '14',
    adminKey: 'pdf-character-sheet-e2e',
    packages: [
      // The blank system contributes nothing. This module attaches to `base`
      // Actors and files its own Item subtype, so what it sits on top of does
      // not matter.
      { kind: 'system', id: 'blank', from: join(here, '..', 'fixtures', 'blank-system') },
      { kind: 'module', id: MODULE_ID, from: join(repoRoot, 'dist') },
    ],
  });
  process.env.E2E_BASE_URL = running.baseUrl;
  return {
    baseUrl: running.baseUrl,
    system: running.system,
    module: running.packages.get(MODULE_ID),
    network: running.network,
  };
}

export function stop() {
  stopFoundryContainer(CONTAINER);
  running = undefined;
}

/** By name, not through the handle: a boot that failed left no handle behind. */
export function logs(tail = 40) {
  return foundryContainerLogs(CONTAINER, tail);
}
