import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { RangeEntry } from '@/data/types'
import { PLAYER_COUNTS } from './positions'
import { parseRangeEntries } from './rangeEntries'
import { RANGE_SETS, rangeSetFor, type RangeSet } from './rangeSets'
import { resolveRange } from './resolve'
import {
  DEFAULT_OPEN_SIZE,
  FORMATS,
  heroOptions,
  OPEN_SIZES,
  rangeTypeOptions,
  SCENARIOS,
  stackOptions,
  villainOptions,
  type GameSetup,
  type Scenario,
} from './scenarios'

const OUT_DIR = path.resolve(process.cwd(), 'public/ranges')

function fileFor(set: RangeSet): string {
  return path.join(OUT_DIR, `${set.id}.json`)
}

function loadSet(set: RangeSet): RangeEntry[] {
  return parseRangeEntries(readFileSync(fileFor(set), 'utf8'))
}

function setupOf(set: RangeSet): GameSetup {
  return { format: set.format, stack: set.stack, rangeType: set.rangeType, openSize: set.openSize ?? DEFAULT_OPEN_SIZE }
}

/** Every hero/villain spot for the given scenarios that no entry in the set resolves. */
function missingSpots(entries: RangeEntry[], setup: GameSetup, scenarios: readonly Scenario[]): string[] {
  const missing: string[] = []
  for (const players of PLAYER_COUNTS) {
    for (const scenario of scenarios) {
      for (const hero of heroOptions(scenario, players)) {
        const villains = villainOptions(scenario, players, hero)
        const targets = villains.length ? villains : [undefined]
        for (const villain of targets) {
          const resolved = resolveRange(entries, { ...setup, scenario, players, hero, villain })
          if (!resolved) missing.push(`${players}max ${scenario} ${hero} vs ${villain ?? '-'}`)
        }
      }
    }
  }
  return missing
}

describe('built-in range sets', () => {
  it.each(RANGE_SETS)('$id is generated and tagged with its own setup', (set) => {
    expect(existsSync(fileFor(set)), `${fileFor(set)} missing – run npm run build:ranges`).toBe(true)
    const entries = loadSet(set)
    expect(entries.length).toBeGreaterThan(0)
    for (const entry of entries) {
      expect(entry.formats, entry.id).toEqual([set.format])
      expect(entry.stacks, entry.id).toEqual([set.stack])
      expect(entry.rangeTypes, entry.id).toEqual([set.rangeType])
      expect(entry.openSizes, entry.id).toEqual(set.openSize === undefined ? undefined : [set.openSize])
    }
  })

  it('100bb sets cover every hero/villain combination for every table size', () => {
    for (const set of RANGE_SETS.filter((s) => s.stack === 100)) {
      expect(missingSpots(loadSet(set), setupOf(set), SCENARIOS), set.id).toEqual([])
    }
  })

  it('every set covers opening and facing a raise', () => {
    for (const set of RANGE_SETS) {
      expect(missingSpots(loadSet(set), setupOf(set), ['open', 'vs-raise']), set.id).toEqual([])
    }
  })

  it('resolves without fallback notes', () => {
    const set = RANGE_SETS.find((s) => s.id === 'MTT_40_GTO')!
    const resolved = resolveRange(loadSet(set), { ...setupOf(set), scenario: 'vs-raise', players: 9, hero: 'BB', villain: 'UTG' })
    expect(resolved?.notes).toEqual([])
  })
})

describe('rangeSetFor', () => {
  it('selects a set for every game setup the UI can produce', () => {
    for (const format of FORMATS) {
      for (const stack of stackOptions(format)) {
        for (const rangeType of rangeTypeOptions(format)) {
          for (const openSize of OPEN_SIZES) {
            expect(rangeSetFor({ format, stack, rangeType, openSize }), `${format} ${stack} ${rangeType} ${openSize}`).toBeDefined()
          }
        }
      }
    }
  })

  it('uses the open size only for cash GTO', () => {
    expect(rangeSetFor({ format: 'cash', stack: 100, rangeType: 'gto', openSize: 2 })?.id).toBe('Cash_100_GTO_2bb')
    expect(rangeSetFor({ format: 'cash', stack: 100, rangeType: 'gto', openSize: 2.5 })?.id).toBe('Cash_100_GTO')
    expect(rangeSetFor({ format: 'cash', stack: 100, rangeType: 'pto', openSize: 2 })?.id).toBe('Cash_100_PTO')
    expect(rangeSetFor({ format: 'mtt', stack: 20, rangeType: 'gto', openSize: 3 })?.id).toBe('MTT_20_GTO')
  })
})
