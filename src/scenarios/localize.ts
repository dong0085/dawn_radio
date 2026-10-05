import type { ScriptedScenario } from '../engine/sources/scripted'

/** Fields that hold the learned language or ids, never the player's own language. */
const KEEP = new Set(['text', 'spoken', 'id', 'speaker', 'section', 'remove', 'browserVoiceNames'])

/**
 * Swaps a recorded channel's wording in the player's language (translations, names, panels)
 * using a table keyed by the original text. Anything missing from the table stays as it was.
 */
export function localizeScripted(data: ScriptedScenario, table: Record<string, string> | undefined): ScriptedScenario {
  if (!table) return data
  const walk = (value: unknown, key = ''): unknown => {
    if (KEEP.has(key)) return value
    if (typeof value === 'string') return table[value] ?? value
    if (Array.isArray(value)) return value.map((v) => walk(v, key))
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v, k)]))
    return value
  }
  return walk(data) as ScriptedScenario
}
