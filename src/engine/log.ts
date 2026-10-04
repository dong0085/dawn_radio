import type { LogEntry, LogState, LogUpdate } from '../types'

export const emptyLog: LogState = { objective: null, entries: [], events: [], version: 0 }

/** The log as it stands when the channel opens. Initial entries count as already seen. */
export function initialLog(initial?: LogUpdate): LogState {
  if (!initial) return emptyLog
  const log = applyLogUpdate(emptyLog, { ...initial, event: undefined }, { at: 0 })
  return { ...log, entries: log.entries.map((e) => ({ ...e, rev: 0 })), version: 0 }
}

/** Returns a new log with one update applied. Entries keep the order they were first added in. */
export function applyLogUpdate(log: LogState, update: LogUpdate, meta: { at: number; lineId?: string }): LogState {
  const version = log.version + 1
  let entries = log.entries

  if (update.remove?.length) entries = entries.filter((e) => !update.remove!.includes(e.id))

  for (const raw of update.entries ?? []) {
    // A field left out or set to undefined keeps its current value.
    const change = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined)) as typeof raw
    const i = entries.findIndex((e) => e.id === change.id)
    if (i >= 0) {
      entries = entries.with(i, { ...entries[i], ...change, rev: version })
    } else if (change.section && change.label) {
      entries = [...entries, { ...change, section: change.section, label: change.label, rev: version } as LogEntry]
    } else {
      console.warn('[log] new entry needs a section and a label', change)
    }
  }

  const events = update.event
    ? [...log.events, { id: `e${version}`, text: update.event, at: meta.at, lineId: meta.lineId }]
    : log.events

  return { objective: update.objective ?? log.objective, entries, events, version }
}
