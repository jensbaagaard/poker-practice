import type { RangeEntry } from '@/data/types'
import type { PlayerCount, Position } from './positions'
import { effectiveOpenSize, RANGE_TYPE_LABELS, SCENARIO_SHAPE, type Format, type GameSetup, type RangeType, type Scenario } from './scenarios'

export interface RangeQuery extends GameSetup {
  scenario: Scenario
  players: PlayerCount
  hero: Position
  villain?: Position
}

export interface Resolved {
  entry: RangeEntry
  /** Human-readable explanations of any fallback that was applied. */
  notes: string[]
}

function matchesSpot(entry: RangeEntry, query: RangeQuery): boolean {
  if (entry.scenario !== query.scenario) return false
  if (!entry.hero.includes(query.hero)) return false
  if (entry.players && !entry.players.includes(query.players)) return false
  if (entry.stacks && !entry.stacks.includes(query.stack)) return false
  if (entry.openSizes && !entry.openSizes.includes(effectiveOpenSize(query))) return false
  if (SCENARIO_SHAPE[query.scenario].needsVillain) {
    if (!query.villain || !entry.villain) return false
    if (!entry.villain.includes(query.villain)) return false
  }
  return true
}

function formatsOf(entry: RangeEntry): Format[] {
  return entry.formats ?? ['cash']
}

function pick(entries: RangeEntry[], query: RangeQuery, rangeType: RangeType, format: Format): RangeEntry | undefined {
  return entries.find((e) => matchesSpot(e, query) && e.rangeTypes.includes(rangeType) && formatsOf(e).includes(format))
}

/**
 * Find the best chart for a query. Falls back in order: requested type → PTO,
 * requested format → cash. Each fallback is reported in `notes`. Built-in sets
 * always match exactly; the fallbacks help with partial user-authored sets.
 */
export function resolveRange(entries: RangeEntry[], query: RangeQuery): Resolved | null {
  const notes: string[] = []
  const typeChain: RangeType[] = query.rangeType === 'pto' ? ['pto'] : [query.rangeType, 'pto']
  const formatChain: Format[] = query.format === 'cash' ? ['cash'] : [query.format, 'cash']

  for (const format of formatChain) {
    for (const rangeType of typeChain) {
      const entry = pick(entries, query, rangeType, format)
      if (!entry) continue
      if (rangeType !== query.rangeType) {
        notes.push(`No ${RANGE_TYPE_LABELS[query.rangeType]} chart for this spot, showing the PTO chart instead.`)
      }
      if (format !== query.format) {
        notes.push(`No ${query.format.toUpperCase()} chart for this spot, showing the cash chart instead.`)
      }
      if (entry.note) notes.push(entry.note)
      return { entry, notes }
    }
  }
  return null
}
