import { SUITS, type Card, type HoleCards, type Rng, type Suit } from './cards'
import type { HandState } from './handSim'
import type { Rank } from './hands'
import { POSITION_LABELS, type Position } from './positions'

/** X check · B bet · R raise · C call · F fold · AI all-in. Amounts are the total put in on this street, in bb. */
export type FlopActionKind = 'X' | 'B' | 'R' | 'C' | 'F' | 'AI'

export interface FlopAction {
  a: FlopActionKind
  bb?: number
}

export type Player = 'ip' | 'oop'

/** One decision point on the flop, as written by scripts/solve-postflop.mjs. Strategies are per combo, in percent. */
export interface FlopNode {
  p: Player
  actions: FlopAction[]
  s: Record<string, number[]>
  /** One child per action; null when the action ends the flop street (or the hand). */
  c: (FlopNode | null)[]
}

export interface FlopStrategy {
  spot: string
  board: string[]
  weight: number
  pot: number
  stack: number
  exploitability: number
  root: FlopNode
}

export interface SolvedBoard {
  board: string[]
  weight: number
}

export interface SpotInfo {
  kind: 'srp'
  opener: Position
  caller: Position
  ip: Position
  oop: Position
  pot: number
  stack: number
  boards: SolvedBoard[]
}

export interface PostflopManifest {
  spots: Record<string, SpotInfo>
}

// ------------------------------------------------------------------ Loading

export function manifestUrl(): string {
  return '/postflop/index.json'
}

export function strategyUrl(spotId: string, boardId: string): string {
  return `/postflop/${spotId}/${boardId}.json`
}

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

/** Resolves to an empty manifest when no postflop data has been generated. */
export function loadManifest(): Promise<PostflopManifest> {
  return cached<PostflopManifest>(manifestUrl()).catch(() => ({ spots: {} }))
}

export function loadFlopStrategy(spotId: string, boardId: string): Promise<FlopStrategy> {
  return cached<FlopStrategy>(strategyUrl(spotId, boardId))
}

// --------------------------------------------------------------------- Spots

/** The solved spot a finished preflop hand leads to, or null when it is not a heads-up single-raised pot. */
export function postflopSpotId(state: HandState): string | null {
  if (state.ended?.kind !== 'flop' || state.raises !== 1 || !state.aggressor) return null
  const active = state.seats.filter((s) => !s.folded)
  if (active.length !== 2) return null
  const caller = active.find((s) => s.position !== state.aggressor)
  return caller ? `srp-${state.aggressor}-${caller.position}` : null
}

export function boardId(board: string[]): string {
  return board.join('')
}

export function positionOf(spot: SpotInfo, player: Player): Position {
  return player === 'ip' ? spot.ip : spot.oop
}

export function playerOf(spot: SpotInfo, position: Position): Player | null {
  if (position === spot.ip) return 'ip'
  if (position === spot.oop) return 'oop'
  return null
}

export function other(player: Player): Player {
  return player === 'ip' ? 'oop' : 'ip'
}

// -------------------------------------------------------------------- Cards

/** Solved boards use canonical suits (first suit spades, then hearts...). A random relabelling shows every suit. */
export type SuitMap = Record<Suit, Suit>

export function parseCard(text: string): Card {
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

export function invertSuitMap(map: SuitMap): SuitMap {
  return Object.fromEntries(SUITS.map((s) => [map[s], s])) as SuitMap
}

export function mapCard(card: Card, map: SuitMap): Card {
  return { rank: card.rank, suit: map[card.suit] }
}

function sameCard(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit
}

export interface ChosenFlop {
  boardId: string
  /** Board as shown, with relabelled suits. */
  board: Card[]
  suitMap: SuitMap
}

/** Pick a solved board at random (by weight) whose cards, after relabelling, are not held by anyone still in the hand. */
export function pickFlop(spot: SpotInfo, blocked: Card[], rng: Rng = Math.random): ChosenFlop | null {
  const suitMap = randomSuitMap(rng)
  const candidates = spot.boards
    .map((b) => ({ id: boardId(b.board), weight: b.weight, cards: b.board.map((c) => mapCard(parseCard(c), suitMap)) }))
    .filter((b) => !b.cards.some((card) => blocked.some((held) => sameCard(card, held))))
  if (candidates.length === 0) return null
  const total = candidates.reduce((sum, b) => sum + b.weight, 0)
  let roll = rng() * total
  for (const b of candidates) {
    roll -= b.weight
    if (roll <= 0) return { boardId: b.id, board: b.cards, suitMap }
  }
  const last = candidates[candidates.length - 1]
  return { boardId: last.id, board: last.cards, suitMap }
}

function cardKey(card: Card): string {
  return `${card.rank}${card.suit}`
}

/** Strategy for a hand at a node. Solver keys are canonical-suit combos; the card order varies, so both are tried. */
export function strategyFor(node: FlopNode, cards: HoleCards, suitMap: SuitMap): number[] | undefined {
  const inverse = invertSuitMap(suitMap)
  const [a, b] = cards.map((c) => cardKey(mapCard(c, inverse)))
  return node.s[a + b] ?? node.s[b + a]
}

/** Whether the player's hand appears in the solved range at all (it will not if they deviated from the preflop chart). */
export function hasStrategy(root: FlopNode, player: Player, cards: HoleCards, suitMap: SuitMap): boolean {
  const stack: FlopNode[] = [root]
  while (stack.length) {
    const node = stack.pop()!
    if (node.p === player) return strategyFor(node, cards, suitMap) !== undefined
    for (const child of node.c) if (child) stack.push(child)
  }
  return false
}

export function sampleIndex(probs: number[], rng: Rng = Math.random): number {
  const total = probs.reduce((a, b) => a + b, 0)
  if (total <= 0) return probs.length - 1
  let roll = rng() * total
  for (let i = 0; i < probs.length; i++) {
    roll -= probs[i]
    if (roll <= 0) return i
  }
  return probs.length - 1
}

// -------------------------------------------------------------- Flop street

export interface PostflopEnd {
  kind: 'fold' | 'turn' | 'all-in'
  message: string
}

export interface FlopHistoryItem {
  player: Player
  action: FlopAction
}

export interface PostflopState {
  spotId: string
  spot: SpotInfo
  strategy: FlopStrategy
  board: Card[]
  suitMap: SuitMap
  /** Current decision node, null once the street is over. */
  node: FlopNode | null
  /** Chips put in on the flop so far. */
  bets: Record<Player, number>
  history: FlopHistoryItem[]
  ended: PostflopEnd | null
}

export function startPostflop(spotId: string, spot: SpotInfo, strategy: FlopStrategy, flop: ChosenFlop): PostflopState {
  return {
    spotId,
    spot,
    strategy,
    board: flop.board,
    suitMap: flop.suitMap,
    node: strategy.root,
    bets: { ip: 0, oop: 0 },
    history: [],
    ended: null,
  }
}

export function potSize(state: PostflopState): number {
  return round1(state.spot.pot + state.bets.ip + state.bets.oop)
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export function toCall(state: PostflopState, player: Player): number {
  return round1(Math.max(0, state.bets[other(player)] - state.bets[player]))
}

export function actionLabel(action: FlopAction, state: PostflopState, player: Player): string {
  switch (action.a) {
    case 'X':
      return 'Check'
    case 'B':
      return `Bet ${action.bb}bb`
    case 'R':
      return `Raise to ${action.bb}bb`
    case 'AI':
      return `All-in ${action.bb}bb`
    case 'C':
      return `Call ${toCall(state, player)}bb`
    case 'F':
      return 'Fold'
  }
}

/** Short form for the table diagram. */
export function shortActionLabel(action: FlopAction): string {
  switch (action.a) {
    case 'X':
      return 'Check'
    case 'B':
      return `Bet ${action.bb}`
    case 'R':
      return `Raise ${action.bb}`
    case 'AI':
      return 'All-in'
    case 'C':
      return 'Call'
    case 'F':
      return 'Fold'
  }
}

export function applyFlopAction(state: PostflopState, index: number): PostflopState {
  if (!state.node) return state
  const player = state.node.p
  const action = state.node.actions[index]
  const bets = { ...state.bets }
  if (action.a === 'B' || action.a === 'R' || action.a === 'AI') bets[player] = action.bb ?? bets[player]
  if (action.a === 'C') bets[player] = bets[other(player)]
  const next: PostflopState = { ...state, bets, history: [...state.history, { player, action }] }
  const me = POSITION_LABELS[positionOf(state.spot, player)]
  const them = POSITION_LABELS[positionOf(state.spot, other(player))]
  if (action.a === 'F') {
    return { ...next, node: null, ended: { kind: 'fold', message: `${me} folds. ${them} takes the ${potSize(next)}bb pot.` } }
  }
  const child = state.node.c[index]
  if (child) return { ...next, node: child }
  if (bets.ip >= state.spot.stack && bets.oop >= state.spot.stack) {
    return { ...next, node: null, ended: { kind: 'all-in', message: `All-in and called on the flop for ${potSize(next)}bb.` } }
  }
  return { ...next, node: null, ended: { kind: 'turn', message: `Flop action complete, ${potSize(next)}bb in the pot. Turn play is not solved yet.` } }
}
