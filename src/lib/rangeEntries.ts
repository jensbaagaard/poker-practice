import type { RangeEntry } from '@/data/types'
import { isPlayerCount, isPosition, type Position } from './positions'
import { resolveActions } from './range'
import { isFormat, isOpenSize, isRangeType, isScenario, isStack, SCENARIO_SHAPE, type RangeType } from './scenarios'

/** Parse and validate a JSON array of RangeEntry objects. Throws a readable error. */
export function parseRangeEntries(text: string): RangeEntry[] {
  if (!text.trim()) return []
  const data: unknown = JSON.parse(text)
  if (!Array.isArray(data)) throw new Error('Expected a JSON array of range entries.')
  return data.map((item, i) => validateEntry(item, i))
}

function optionalList<T>(value: unknown, where: string, field: string, guard: (v: never) => boolean): T[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || !value.every((v) => guard(v as never))) {
    throw new Error(`${where}: invalid "${field}".`)
  }
  return value as T[]
}

function validateEntry(item: unknown, index: number): RangeEntry {
  const where = `Entry ${index + 1}`
  if (typeof item !== 'object' || item === null) throw new Error(`${where}: must be an object.`)
  const e = item as Record<string, unknown>
  if (typeof e.id !== 'string' || !e.id) throw new Error(`${where}: "id" is required.`)
  if (!isScenario(e.scenario as string)) throw new Error(`${where}: invalid "scenario".`)
  const scenario = e.scenario as RangeEntry['scenario']
  const rangeTypes: RangeType[] = optionalList<RangeType>(e.rangeTypes, where, 'rangeTypes', isRangeType) ?? ['pto']
  if (!Array.isArray(e.hero) || !e.hero.length || !e.hero.every((p) => isPosition(p))) {
    throw new Error(`${where}: "hero" must be a non-empty array of positions.`)
  }
  const villain = optionalList<Position>(e.villain, where, 'villain', isPosition)
  if (SCENARIO_SHAPE[scenario].needsVillain && !villain) {
    throw new Error(`${where}: "villain" must be an array of positions for scenario "${scenario}".`)
  }
  if (typeof e.range !== 'object' || e.range === null) throw new Error(`${where}: "range" is required.`)
  const range = e.range as Record<string, unknown>
  for (const key of ['raise', 'call']) {
    if (range[key] !== undefined && typeof range[key] !== 'string') throw new Error(`${where}: "range.${key}" must be a string.`)
  }
  try {
    resolveActions({ raise: range.raise as string | undefined, call: range.call as string | undefined })
  } catch (err) {
    throw new Error(`${where}: ${(err as Error).message}`)
  }
  return {
    id: e.id,
    scenario,
    rangeTypes,
    formats: optionalList(e.formats, where, 'formats', isFormat),
    players: optionalList(e.players, where, 'players', isPlayerCount),
    stacks: optionalList(e.stacks, where, 'stacks', isStack),
    openSizes: optionalList(e.openSizes, where, 'openSizes', isOpenSize),
    hero: e.hero as RangeEntry['hero'],
    villain,
    range: { raise: range.raise as string | undefined, call: range.call as string | undefined },
    note: typeof e.note === 'string' ? e.note : undefined,
  }
}
