#!/usr/bin/env node
/**
 * Build the viewer's range sets from data/openSourcePokerData/*.json.
 *
 * Each source file is one range set ({ "<scenarioKey>": { "<hand>": frequency } }).
 * Every set is written to public/ranges/<setId>.json as an array of RangeEntry
 * objects (the same format "Your ranges" accepts), and the app fetches the set
 * that matches the chosen format, stack, range type and open size.
 *
 * Usage: node scripts/build-ranges.mjs [--if-present]
 *   --if-present  exit quietly when the source folder is missing (used by prebuild)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'

const SRC_DIR = path.resolve('data/openSourcePokerData')
const OUT_DIR = path.resolve('public/ranges')
const ifPresent = process.argv.includes('--if-present')

/** Source file stem → the viewer settings that select it. Keep in sync with src/lib/rangeSets.ts. */
const SETS = [
  { id: 'Cash_100_PTO', format: 'cash', stack: 100, rangeType: 'pto' },
  { id: 'Cash_100_Simple', format: 'cash', stack: 100, rangeType: 'simple' },
  { id: 'Cash_100_PRO', format: 'cash', stack: 100, rangeType: 'pro' },
  { id: 'Cash_100_GTO', format: 'cash', stack: 100, rangeType: 'gto', openSize: 2.5 },
  { id: 'Cash_100_GTO_2bb', format: 'cash', stack: 100, rangeType: 'gto', openSize: 2 },
  { id: 'Cash_100_GTO_3bb', format: 'cash', stack: 100, rangeType: 'gto', openSize: 3 },
  ...[100, 40, 20, 10, 5].flatMap((stack) => [
    { id: `MTT_${stack}_PTO`, format: 'mtt', stack, rangeType: 'pto' },
    { id: `MTT_${stack}_GTO`, format: 'mtt', stack, rangeType: 'gto' },
  ]),
]

/** Source seat name → app seat name, per table size. */
const SEAT_MAPS = {
  6: { LJ: 'LJ', HJ: 'HJ', CO: 'CO', BTN: 'BTN', SB: 'SB', BB: 'BB' },
  8: { EP2: 'UTG', EP3: 'UTG1', LJ: 'LJ', HJ: 'HJ', CO: 'CO', BTN: 'BTN', SB: 'SB', BB: 'BB' },
  9: { EP1: 'UTG', EP2: 'UTG1', EP3: 'UTG2', LJ: 'LJ', HJ: 'HJ', CO: 'CO', BTN: 'BTN', SB: 'SB', BB: 'BB' },
}
const ALL_PLAYERS = Object.keys(SEAT_MAPS).map(Number)

/**
 * UI scenario → source key prefixes. `prev` names the node the hero must have
 * taken to reach the spot; frequencies are divided by it so charts read
 * "given we are here".
 */
const SCENARIOS = [
  { scenario: 'open', raise: 'Open', call: 'Limp', prev: null, villain: false },
  { scenario: 'vs-raise', raise: '3Bet', call: 'Call', prev: null, villain: true },
  { scenario: 'vs-3bet', raise: '4Bet', call: 'Call 3Bet', prev: 'Open', prevHasVillain: false, villain: true },
  { scenario: 'vs-4bet', raise: '5Bet', call: 'Call 4Bet', prev: '3Bet', prevHasVillain: true, villain: true },
  { scenario: 'vs-5bet', raise: null, call: 'Call 5Bet', prev: '4Bet', prevHasVillain: true, villain: true },
]

const SEAT_RE = /^(EP1|EP2|EP3|LJ|HJ|CO|BTN|SB|BB)(?:vs(EP1|EP2|EP3|LJ|HJ|CO|BTN|SB|BB))?$/

function keyName(prefix, hero, villain) {
  return villain ? `${prefix}${hero}vs${villain}` : `${prefix}${hero}`
}

function toNotation(weights) {
  const parts = []
  for (const [hand, w] of Object.entries(weights)) {
    if (w <= 0) continue
    const rounded = Math.min(1, Math.round(w * 1000) / 1000)
    if (rounded <= 0) continue
    parts.push(rounded >= 1 ? hand : `${hand}:${rounded}`)
  }
  return parts.join(', ')
}

function conditional(freqs, prev) {
  if (!freqs) return {}
  if (!prev) return freqs
  const out = {}
  for (const [hand, w] of Object.entries(freqs)) {
    const p = prev[hand] ?? 0
    out[hand] = p > 0 ? Math.min(1, w / p) : 0
  }
  return out
}

function collectSpots(src) {
  const spots = new Set()
  for (const key of Object.keys(src)) {
    for (const def of SCENARIOS) {
      for (const prefix of [def.raise, def.call]) {
        if (!prefix || !key.startsWith(prefix)) continue
        const m = SEAT_RE.exec(key.slice(prefix.length))
        if (!m) continue
        const hasVillain = m[2] !== undefined
        if (hasVillain !== def.villain) continue
        spots.add(`${def.scenario}|${m[1]}|${m[2] ?? ''}`)
      }
    }
  }
  return [...spots].sort()
}

function convertSet(set) {
  const src = JSON.parse(readFileSync(path.join(SRC_DIR, `${set.id}.json`), 'utf8'))
  const entries = []
  const meta = {
    rangeTypes: [set.rangeType],
    formats: [set.format],
    stacks: [set.stack],
    ...(set.openSize !== undefined ? { openSizes: [set.openSize] } : {}),
  }

  for (const spot of collectSpots(src)) {
    const [scenario, srcHero, srcVillain] = spot.split('|')
    const def = SCENARIOS.find((d) => d.scenario === scenario)

    const prevKey = def.prev ? keyName(def.prev, srcHero, def.prevHasVillain ? srcVillain : undefined) : null
    const prev = prevKey ? src[prevKey] : null
    const raise = def.raise ? toNotation(conditional(src[keyName(def.raise, srcHero, srcVillain)], prev)) : ''
    const call = def.call ? toNotation(conditional(src[keyName(def.call, srcHero, srcVillain)], prev)) : ''
    if (!raise && !call) continue

    // The same source chart serves several table sizes; only the early seats are renamed per size.
    const groups = new Map()
    for (const players of ALL_PLAYERS) {
      const seatMap = SEAT_MAPS[players]
      const hero = seatMap[srcHero]
      const villain = srcVillain ? seatMap[srcVillain] : undefined
      if (!hero || (srcVillain && !villain)) continue
      const groupKey = `${hero}|${villain ?? ''}`
      if (!groups.has(groupKey)) groups.set(groupKey, { hero, villain, players: [] })
      groups.get(groupKey).players.push(players)
    }

    for (const { hero, villain, players } of groups.values()) {
      const everySize = players.length === ALL_PLAYERS.length
      entries.push({
        id: `${set.id}-${scenario}-${hero}${villain ? `-vs-${villain}` : ''}${everySize ? '' : `-${players.join('')}max`}`,
        scenario,
        ...meta,
        ...(everySize ? {} : { players }),
        hero: [hero],
        ...(villain ? { villain: [villain] } : {}),
        range: { ...(raise ? { raise } : {}), ...(call ? { call } : {}) },
      })
    }
  }
  return entries
}

if (!existsSync(SRC_DIR)) {
  if (ifPresent) {
    console.log(`build-ranges: ${path.relative(process.cwd(), SRC_DIR)} not found, keeping existing public/ranges`)
    process.exit(0)
  }
  console.error(`Source directory not found: ${SRC_DIR}`)
  process.exit(1)
}
mkdirSync(OUT_DIR, { recursive: true })

let total = 0
for (const set of SETS) {
  const srcFile = path.join(SRC_DIR, `${set.id}.json`)
  if (!existsSync(srcFile)) {
    console.warn(`skip ${set.id} (missing source)`)
    continue
  }
  const entries = convertSet(set)
  const out = path.join(OUT_DIR, `${set.id}.json`)
  writeFileSync(out, JSON.stringify(entries))
  total += entries.length
  console.log(`${set.id}: ${entries.length} entries (${(readFileSync(out).length / 1024).toFixed(0)} KB)`)
}
console.log(`${total} entries written to ${path.relative(process.cwd(), OUT_DIR)}`)
