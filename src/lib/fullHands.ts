import type { RangeEntry } from '@/data/types'
import { DECK, handOf, SUITS, type Card, type HoleCards, type Rng, type Suit } from './cards'
import type { HandState } from './handSim'
import type { Rank } from './hands'
import { positionsFor, type Position } from './positions'
import type { TrainerSetup } from './trainer'
import { resolveActions, type Action, type ActionWeights } from './range'
import { resolveRange } from './resolve'
import type { Scenario } from './scenarios'

/** X check · B bet · R raise · C call · F fold · AI all-in. `to` is the actor's street total after the action. */
export type ActionKind = 'X' | 'B' | 'R' | 'C' | 'F' | 'AI'
export type Player = 'ip' | 'oop'
export type Street = 'flop' | 'turn' | 'river'

export interface ScriptAction {
  a: ActionKind
  bb?: number
  to?: number
}

export interface ScriptNode {
  p: Player
  actions: ScriptAction[]
  /** Index the line follows: the hero's most frequent action, or the villain's sampled one. */
  chosen: number
  /** Hero nodes only: chart frequency of each action in percent. */
  probs?: number[]
  /** Hero nodes only: average strategy per hand class, for the grid. */
  grid?: Record<string, number[]>
}

export interface ScriptStreet {
  street: Street
  /** Pot when the street starts. */
  pot: number
  nodes: ScriptNode[]
}

export interface ScriptResult {
  kind: 'fold' | 'showdown'
  winner: 'hero' | 'villain' | 'split'
  pot: number
  heroHand?: string
  villainHand?: string
}

/** One pre-generated hand, written by scripts/generate-hands.mjs. Cards use canonical suits. */
export interface HandScript {
  spot: string
  kind: 'srp' | '3bp'
  opener: Position
  caller?: Position
  threeBettor?: Position
  hero: Position
  villain: Position
  heroPlayer: Player
  heroCards: [string, string]
  villainCards: [string, string]
  board: string[]
  pot: number
  stack: number
  streets: ScriptStreet[]
  result: ScriptResult
}

export interface HandIndexEntry {
  id: string
  spot: string
  hero: Position
  result: string
}

export interface HandIndex {
  spots: Record<string, { kind: 'srp' | '3bp'; opener: Position; caller?: Position; threeBettor?: Position; ip: Position; oop: Position }>
  hands: HandIndexEntry[]
}

// ------------------------------------------------------------------ Loading

const cache = new Map<string, Promise<unknown>>()

function cached<T>(url: string): Promise<T> {
  let pending = cache.get(url) as Promise<T> | undefined
  if (!pending) {
    pending = fetch(url).then((res) => {
      if (!res.ok) throw new Error(`Could not load ${url} (${res.status}).`)
      return res.json() as Promise<T>
    })
    pending.catch(() => cache.delete(url))
    cache.set(url, pending)
  }
  return pending
}

export function loadHandIndex(): Promise<HandIndex> {
  return cached<HandIndex>('/full-hands/index.json').catch(() => ({ spots: {}, hands: [] }))
}

export function loadHandScript(id: string): Promise<HandScript> {
  return cached<HandScript>(`/full-hands/${id}.json`)
}

export function pickHand(index: HandIndex, seat: Position | undefined, rng: Rng = Math.random): HandIndexEntry | null {
  const pool = seat ? index.hands.filter((h) => h.hero === seat) : index.hands
  if (pool.length === 0) return null
  return pool[Math.floor(rng() * pool.length)]
}

// -------------------------------------------------------------------- Cards

/** Scripts use canonical suits (spades first, then hearts...). A random relabelling shows every suit. */
export type SuitMap = Record<Suit, Suit>

function parseCard(text: string): Card {
  return { rank: text[0] as Rank, suit: text[1] as Suit }
}

export function randomSuitMap(rng: Rng = Math.random): SuitMap {
  const shuffled = [...SUITS]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return Object.fromEntries(SUITS.map((s, i) => [s, shuffled[i]])) as SuitMap
}

function mapCard(text: string, map: SuitMap): Card {
  const card = parseCard(text)
  return { rank: card.rank, suit: map[card.suit] }
}

export function mapHole(cards: [string, string], map: SuitMap): HoleCards {
  return [mapCard(cards[0], map), mapCard(cards[1], map)]
}

// ------------------------------------------------------------ Preflop line

/** Who the second player in the pot is: the caller of an open or the 3-bettor. */
export function responder(script: HandScript): Position {
  return script.kind === 'srp' ? script.caller! : script.threeBettor!
}

/** The action the script's preflop line has the acting seat take. Everyone but the two players folds. */
export function scriptedPreflopAction(state: HandState, script: HandScript): Action {
  if (state.toAct === null) return 'fold'
  const seat = state.seats[state.toAct].position
  if (seat === script.opener && state.raises === 0) return 'raise'
  if (seat === responder(script) && state.raises === 1) return script.kind === 'srp' ? 'call' : 'raise'
  if (seat === script.opener && state.raises === 2 && script.kind === '3bp') return 'call'
  return 'fold'
}

const weightsCache = new WeakMap<RangeEntry, Map<string, ActionWeights>>()

function chartWeights(setup: TrainerSetup, entries: RangeEntry[], scenario: Scenario, hero: Position, villain: Position | undefined, label: string): ActionWeights | null {
  const resolved = resolveRange(entries, { ...setup, scenario, hero, villain })
  if (!resolved) return null
  let weights = weightsCache.get(resolved.entry)
  if (!weights) {
    weights = resolveActions(resolved.entry.range)
    weightsCache.set(resolved.entry, weights)
  }
  return weights.get(label) ?? null
}

/**
 * Deal every seat so the preflop charts lead to the script's line: the two players get the
 * script's cards and everyone else gets a hand their chart folds in the spot they face.
 */
export function dealForScript(script: HandScript, suitMap: SuitMap, setup: TrainerSetup, entries: RangeEntry[], rng: Rng = Math.random): HoleCards[] {
  const order = positionsFor(setup.players)
  const hero = mapHole(script.heroCards, suitMap)
  const villain = mapHole(script.villainCards, suitMap)
  const used = new Set([...hero, ...villain].map((c) => c.rank + c.suit))
  const deck = DECK.filter((c) => !used.has(c.rank + c.suit))
  const second = responder(script)
  const openerIdx = order.indexOf(script.opener)

  const folds = (position: Position, cards: HoleCards): boolean => {
    const idx = order.indexOf(position)
    const label = handOf(cards).label
    let weights: ActionWeights | null
    if (idx < openerIdx) weights = chartWeights(setup, entries, 'open', position, undefined, label)
    else if (script.kind === '3bp' && idx > order.indexOf(second)) return true
    else weights = chartWeights(setup, entries, 'vs-raise', position, script.opener, label)
    return weights === null || weights.fold >= 0.5
  }

  return order.map((position) => {
    if (position === script.hero) return hero
    if (position === script.villain) return villain
    for (let attempt = 0; attempt < 300; attempt++) {
      const i = Math.floor(rng() * deck.length)
      let j = Math.floor(rng() * (deck.length - 1))
      if (j >= i) j += 1
      const cards: HoleCards = [deck[i], deck[j]]
      if (!folds(position, cards)) continue
      deck.splice(Math.max(i, j), 1)
      deck.splice(Math.min(i, j), 1)
      return cards
    }
    const cards: HoleCards = [deck[0], deck[1]]
    deck.splice(0, 2)
    return cards
  })
}

// ------------------------------------------------------------- Postflop line

export interface PostflopPlay {
  streetIndex: number
  nodeIndex: number
  /** Street totals so far. */
  bets: Record<Player, number>
  done: boolean
}

export function startPostflop(): PostflopPlay {
  return { streetIndex: 0, nodeIndex: 0, bets: { ip: 0, oop: 0 }, done: false }
}

export function currentNode(script: HandScript, play: PostflopPlay): ScriptNode | null {
  if (play.done) return null
  return script.streets[play.streetIndex]?.nodes[play.nodeIndex] ?? null
}

export function currentStreet(script: HandScript, play: PostflopPlay): ScriptStreet | null {
  return script.streets[Math.min(play.streetIndex, script.streets.length - 1)] ?? null
}

/** Apply the current node's scripted action and move on. */
export function advancePostflop(script: HandScript, play: PostflopPlay): PostflopPlay {
  const node = currentNode(script, play)
  if (!node) return { ...play, done: true }
  const action = node.actions[node.chosen]
  const bets = { ...play.bets }
  if (action.to !== undefined) bets[node.p] = action.to
  const street = script.streets[play.streetIndex]
  if (play.nodeIndex + 1 < street.nodes.length) return { ...play, bets, nodeIndex: play.nodeIndex + 1 }
  if (play.streetIndex + 1 < script.streets.length) return { streetIndex: play.streetIndex + 1, nodeIndex: 0, bets: { ip: 0, oop: 0 }, done: false }
  return { ...play, bets, done: true }
}

/** Board cards dealt so far, relabelled for display. */
export function boardShown(script: HandScript, play: PostflopPlay | null, suitMap: SuitMap): Card[] {
  if (!play) return []
  const count = play.done ? script.board.length : Math.min(script.board.length, 3 + play.streetIndex)
  return script.board.slice(0, count).map((c) => mapCard(c, suitMap))
}

export function positionOf(script: HandScript, player: Player): Position {
  return player === script.heroPlayer ? script.hero : script.villain
}

export function actionLabel(action: ScriptAction, bets: Record<Player, number>, actor: Player): string {
  switch (action.a) {
    case 'X':
      return 'Check'
    case 'B':
      return `Bet ${action.to}bb`
    case 'R':
      return `Raise to ${action.to}bb`
    case 'AI':
      return `All-in ${action.to}bb`
    case 'C':
      return `Call ${Math.round(((action.to ?? 0) - bets[actor]) * 10) / 10}bb`
    case 'F':
      return 'Fold'
  }
}

export function shortActionLabel(action: ScriptAction): string {
  switch (action.a) {
    case 'X':
      return 'Check'
    case 'B':
      return `Bet ${action.to}`
    case 'R':
      return `Raise ${action.to}`
    case 'AI':
      return 'All-in'
    case 'C':
      return 'Call'
    case 'F':
      return 'Fold'
  }
}

export const STREET_LABELS: Record<Street, string> = { flop: 'Flop', turn: 'Turn', river: 'River' }

export function resultMessage(script: HandScript): string {
  const { result } = script
  if (result.kind === 'fold') {
    return result.winner === 'hero' ? `Villain folds. You take the ${result.pot}bb pot.` : `You fold. Villain takes the ${result.pot}bb pot.`
  }
  const outcome = result.winner === 'hero' ? 'You win' : result.winner === 'villain' ? 'Villain wins' : 'Split pot'
  return `Showdown: ${outcome} ${result.pot}bb. You: ${result.heroHand}. Villain: ${result.villainHand}.`
}
