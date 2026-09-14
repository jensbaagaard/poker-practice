import { HAND_BY_LABEL, RANKS, type Rank, ALL_HANDS, TOTAL_COMBOS } from './hands'

/** Weight per hand label in [0, 1]. Hands not present have weight 0. */
export type WeightedRange = Map<string, number>

export const ACTIONS = ['raise', 'call', 'fold'] as const
export type Action = (typeof ACTIONS)[number]

/** Authored range: raise and call are range-notation strings, fold is implicit. */
export interface RangeDef {
  raise?: string
  call?: string
}

export type ActionWeights = Record<Action, number>

const RANK_SET = new Set<string>(RANKS)

function asRank(ch: string): Rank {
  const upper = ch.toUpperCase()
  if (!RANK_SET.has(upper)) throw new Error(`Invalid rank "${ch}"`)
  return upper as Rank
}

function idx(rank: Rank): number {
  return RANKS.indexOf(rank)
}

function labelFor(a: Rank, b: Rank, suffix: '' | 's' | 'o'): string[] {
  if (a === b) return [`${a}${b}`]
  const [high, low] = idx(a) <= idx(b) ? [a, b] : [b, a]
  if (suffix === '') return [`${high}${low}s`, `${high}${low}o`]
  return [`${high}${low}${suffix}`]
}

const TOKEN_RE = /^([AKQJT2-9])([AKQJT2-9])([so]?)(\+?)$/i

function parseSingle(token: string): { a: Rank; b: Rank; suffix: '' | 's' | 'o'; plus: boolean } {
  const m = TOKEN_RE.exec(token)
  if (!m) throw new Error(`Invalid hand token "${token}"`)
  return { a: asRank(m[1]), b: asRank(m[2]), suffix: m[3].toLowerCase() as '' | 's' | 'o', plus: m[4] === '+' }
}

/** Expand one token (without weight) into hand labels. */
export function expandToken(token: string): string[] {
  const trimmed = token.trim()
  if (trimmed.includes('-')) {
    const [fromTok, toTok] = trimmed.split('-').map((s) => s.trim())
    const from = parseSingle(fromTok)
    const to = parseSingle(toTok)
    if (from.plus || to.plus) throw new Error(`Cannot combine "+" with a span in "${token}"`)
    if (from.suffix !== to.suffix) throw new Error(`Mismatched suits in span "${token}"`)
    const out: string[] = []
    if (from.a === from.b && to.a === to.b) {
      const [lo, hi] = [idx(from.a), idx(to.a)].sort((x, y) => x - y)
      for (let i = lo; i <= hi; i++) out.push(...labelFor(RANKS[i], RANKS[i], ''))
      return out
    }
    if (from.a === to.a) {
      const [lo, hi] = [idx(from.b), idx(to.b)].sort((x, y) => x - y)
      for (let i = lo; i <= hi; i++) out.push(...labelFor(from.a, RANKS[i], from.suffix))
      return out
    }
    const gap = idx(from.b) - idx(from.a)
    if (idx(to.b) - idx(to.a) !== gap) throw new Error(`Span "${token}" must share a high card or a gap`)
    const [lo, hi] = [idx(from.a), idx(to.a)].sort((x, y) => x - y)
    for (let i = lo; i <= hi; i++) out.push(...labelFor(RANKS[i], RANKS[i + gap], from.suffix))
    return out
  }

  const { a, b, suffix, plus } = parseSingle(trimmed)
  if (!plus) return labelFor(a, b, suffix)
  const out: string[] = []
  if (a === b) {
    for (let i = idx(a); i >= 0; i--) out.push(...labelFor(RANKS[i], RANKS[i], ''))
    return out
  }
  const [high, low] = idx(a) <= idx(b) ? [a, b] : [b, a]
  for (let i = idx(low); i > idx(high); i--) out.push(...labelFor(high, RANKS[i], suffix))
  return out
}

/**
 * Parse range notation into weights.
 * Tokens are separated by commas or whitespace. Supported forms:
 *   AA, 22+, 77-TT, AKs, A2s+, A5s-A2s, T9s-54s, AQo, AK (suited + offsuit)
 * An optional weight follows a colon: "A5s:0.5", "K9s+:0.25".
 */
export function parseRange(notation: string | undefined): WeightedRange {
  const result: WeightedRange = new Map()
  if (!notation) return result
  const tokens = notation.split(/[,\s]+/).filter(Boolean)
  for (const raw of tokens) {
    const [handPart, weightPart] = raw.split(':')
    const weight = weightPart === undefined ? 1 : Number(weightPart)
    if (!Number.isFinite(weight) || weight < 0 || weight > 1) throw new Error(`Invalid weight in "${raw}"`)
    for (const label of expandToken(handPart)) {
      if (!HAND_BY_LABEL.has(label)) throw new Error(`Unknown hand "${label}"`)
      result.set(label, Math.max(result.get(label) ?? 0, weight))
    }
  }
  return result
}

/** Resolve a RangeDef into per-hand action weights. Fold absorbs whatever is left. */
export function resolveActions(def: RangeDef): Map<string, ActionWeights> {
  const raise = parseRange(def.raise)
  const call = parseRange(def.call)
  const out = new Map<string, ActionWeights>()
  for (const hand of ALL_HANDS) {
    const r = raise.get(hand.label) ?? 0
    const c = Math.min(call.get(hand.label) ?? 0, 1 - r)
    out.set(hand.label, { raise: r, call: c, fold: Math.max(0, 1 - r - c) })
  }
  return out
}

/** Share of all 1326 combos taking each action. */
export function actionTotals(weights: Map<string, ActionWeights>): ActionWeights {
  const totals: ActionWeights = { raise: 0, call: 0, fold: 0 }
  for (const hand of ALL_HANDS) {
    const w = weights.get(hand.label)
    if (!w) continue
    for (const action of ACTIONS) totals[action] += (w[action] * hand.combos) / TOTAL_COMBOS
  }
  return totals
}
