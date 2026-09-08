/**
 * Flattening an actor into the paths a PDF field can be named after.
 *
 * `foundry.utils.flattenObject` looks like the tool for this and quietly is
 * not. It recurses only into values whose `getType` is `"Object"`, and
 * `actor.system` is a `TypeDataModel` — some `CharacterData`, not an Object.
 * So it stops at the top and stores the whole model as one leaf:
 *
 * ```js
 * foundry.utils.flattenObject({ system: actor.system })  // → { system: CharacterData }
 * ```
 *
 * Nothing throws. A PDF field named `system.health.value` simply looks itself
 * up in a map that only ever held `system`, finds nothing, and renders empty —
 * which reads as "this character has no HP yet" rather than as a bug.
 *
 * `system.toObject()` would recurse, but it returns *source* data: everything
 * `prepareDerivedData` computed is gone, so an armour class or a modifier the
 * system derives would be missing from a sheet whose whole job is to show it.
 * The schema fields and the derived values are both own enumerable properties
 * on the live model, so walking it keeps both.
 */

/** Deep enough for any real schema; a guard against a cycle, not a limit. */
const MAX_DEPTH = 20;

function walk(value: unknown, depth: number): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map((entry) => walk(entry, depth + 1));

  const out: Record<string, unknown> = {};
  // Enumerable only, which is what leaves `_source`, `parent` and the model's
  // own plumbing out of the result.
  for (const [key, inner] of Object.entries(value)) out[key] = walk(inner, depth + 1);
  return out;
}

/** A live document tree as plain objects, derived values included. */
export function toPlain<T>(value: T): T {
  return walk(value, 0) as T;
}

/**
 * Every path on this actor a PDF field could be named after, with its current
 * value. Leaves only — an intermediate object is not something a field holds.
 */
export function actorPaths(actor: {
  name: string;
  system: unknown;
  // `object`, not `Record<string, unknown>`: that is how Foundry's own types
  // declare it, and narrowing here would only push a cast onto every caller.
  flags?: object;
}): Record<string, unknown> {
  return foundry.utils.flattenObject(
    toPlain({
      name: actor.name,
      system: actor.system,
      flags: actor.flags ?? {},
    }),
  ) as Record<string, unknown>;
}
