/**
 * Identifiers shared across the module.
 *
 * These live apart from the entry point on purpose: the enricher needs the
 * subtype key, and the entry point needs the enricher. Importing one from the
 * other closes a cycle that happens to work today — the key is only read
 * inside callbacks — and fails silently the day something reads it while the
 * modules are still evaluating.
 */
import { moduleSubType } from '@vttforge/core';

export const MODULE_ID = 'pdf-character-sheet';

/** The Item subtype key Foundry files this module's PDFs under. */
export const PDF_TYPE = moduleSubType(MODULE_ID, 'pdf');
