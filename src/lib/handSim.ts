import type { RangeEntry } from '@/data/types'
import { dealTable, handOf, type HoleCards, type Rng } from './cards'
import type { Hand } from './hands'
import { POSITION_LABELS, positionsFor, type Position } from './positions'
import { resolveActions, type Action, type ActionWeights } from './range'
import { resolveRange } from './resolve'
import { heroRaise, type Scenario } from './scenarios'
import type { TrainerSetup } from './trainer'

export interface Seat {
  position: Position
  cards: HoleCards
  hand: Hand
  folded: boolean
  /** Chips put in the pot so far, in big blinds. */
  committed: number
  /** Short description of the seat's last action, for the table diagram. */
  lastAction?: string
}

export interface HandEnd {
  kind: 'walk' | 'uncontested' | 'flop' | 'all-in' | 'hero-folded'
  message: string
}

export interface HandState {
  seats: Seat[]
  hero: Position
  /** Index into `seats` of the player whose turn it is, or null once the hand has ended. */
  toAct: number | null
  /** 0 = nobody has raised, 1 = open, 2 = 3-bet, 3 = 4-bet, 4 = 5-bet. */
  raises: number
  /** Last raiser. */
  aggressor?: Position
  /** The raiser before the last one, the only player with a chart for responding to a re-raise. */
  responder?: Position
  /** Positions that have acted since the last raise (callers). */
  acted: Position[]
  ended: HandEnd | null
}

/** What a player faces when it is their turn. Null when no chart covers the spot, which means folding. */
export interface Decision {
  scenario: Scenario
  position: Position
  villain?: Position
  entry: RangeEntry
  actions: Action[]
  weights: ActionWeights
}

const RERAISE_SCENARIOS: Scenario[] = ['vs-3bet', 'vs-4bet', 'vs-5bet']

export function startHand(setup: TrainerSetup, rng: Rng = Math.random, hero?: Position, dealt?: HoleCards[]): HandState {
  const order = positionsFor(setup.players)
  const cards = dealt ?? dealTable(order.length, rng)
  const seats: Seat[] = order.map((position, i) => ({
    position,
    cards: cards[i],
    hand: handOf(cards[i]),
    folded: false,
    committed: position === 'SB' ? 0.5 : position === 'BB' ? 1 : 0,
  }))
  const heroPosition = hero ?? order[Math.floor(rng() * order.length)]
  return advance({ seats, hero: heroPosition, toAct: -1, raises: 0, acted: [], ended: null }, setup)
}

function currentBet(state: HandState): number {
  return Math.max(...state.seats.map((s) => s.committed))
}

function activeSeats(state: HandState): Seat[] {
  return state.seats.filter((s) => !s.folded)
}

function end(state: HandState, ended: HandEnd): HandState {
  return { ...state, toAct: null, ended }
}

function finishRound(state: HandState, setup: TrainerSetup): HandState {
  const active = activeSeats(state)
  const aggressor = state.aggressor ? POSITION_LABELS[state.aggressor] : ''
  if (active.length === 1) {
    return end(state, { kind: 'uncontested', message: `Everyone folded. ${aggressor} takes the pot.` })
  }
  if (active.some((s) => s.committed >= setup.stack)) {
    return end(state, { kind: 'all-in', message: `All-in and called: ${active.map((s) => POSITION_LABELS[s.position]).join(' vs ')}.` })
  }
  return end(state, { kind: 'flop', message: `${active.map((s) => POSITION_LABELS[s.position]).join(', ')} see a flop.` })
}

/** Move the turn to the next player who still has to act, or end the hand. */
function advance(state: HandState, setup: TrainerSetup): HandState {
  const n = state.seats.length
  const from = state.toAct ?? -1
  for (let k = 1; k <= n; k++) {
    const idx = (from + k) % n
    const seat = state.seats[idx]
    if (seat.folded) continue
    if (seat.position === state.aggressor) return finishRound(state, setup)
    if (state.acted.includes(seat.position)) continue
    if (state.raises === 0 && seat.position === 'BB') {
      return end(state, { kind: 'walk', message: 'Everyone folded. BB takes the blinds.' })
    }
    return { ...state, toAct: idx }
  }
  return finishRound(state, setup)
}

const weightsCache = new WeakMap<RangeEntry, Map<string, ActionWeights>>()

function weightsFor(entry: RangeEntry): Map<string, ActionWeights> {
  let weights = weightsCache.get(entry)
  if (!weights) {
    weights = resolveActions(entry.range)
    weightsCache.set(entry, weights)
  }
  return weights
}

export function decisionFor(state: HandState, setup: TrainerSetup, entries: RangeEntry[]): Decision | null {
  if (state.toAct === null) return null
  const seat = state.seats[state.toAct]
  let scenario: Scenario
  if (state.raises === 0) scenario = 'open'
  else if (state.raises === 1) scenario = 'vs-raise'
  else if (seat.position === state.responder && state.raises - 2 < RERAISE_SCENARIOS.length) scenario = RERAISE_SCENARIOS[state.raises - 2]
  else return null

  const villain = state.raises > 0 ? state.aggressor : undefined
  const resolved = resolveRange(entries, { ...setup, scenario, hero: seat.position, villain })
  if (!resolved) return null

  const actions: Action[] = []
  if (heroRaise(scenario, setup, seat.position, villain)) actions.push('raise')
  if (scenario !== 'open' || resolved.entry.range.call) actions.push('call')
  actions.push('fold')
  const weights = weightsFor(resolved.entry).get(seat.hand.label) ?? { raise: 0, call: 0, fold: 1 }
  return { scenario, position: seat.position, villain, entry: resolved.entry, actions, weights }
}

/** Draw an action from the chart's frequencies. */
export function sampleAction(decision: Decision, rng: Rng = Math.random): Action {
  const roll = rng()
  const { raise, call } = decision.weights
  const action: Action = roll < raise ? 'raise' : roll < raise + call ? 'call' : 'fold'
  return decision.actions.includes(action) ? action : 'fold'
}

/** Apply the acting player's move and pass the turn on. */
export function act(state: HandState, setup: TrainerSetup, action: Action, decision: Decision | null): HandState {
  if (state.toAct === null) return state
  const seat = state.seats[state.toAct]
  const seats = [...state.seats]
  let next: HandState = { ...state, seats }

  if (action === 'fold') {
    seats[state.toAct] = { ...seat, folded: true, lastAction: 'Fold' }
    if (seat.position === state.hero) {
      return end(next, { kind: 'hero-folded', message: 'You folded.' })
    }
  } else if (action === 'call') {
    const amount = Math.min(setup.stack, currentBet(state))
    seats[state.toAct] = { ...seat, committed: amount, lastAction: amount >= setup.stack ? 'Call all-in' : 'Call' }
    next = { ...next, acted: [...state.acted, seat.position] }
  } else {
    const raise = decision ? heroRaise(decision.scenario, setup, seat.position, decision.villain) : null
    const amount = Math.min(setup.stack, raise?.size ?? currentBet(state) * 3)
    seats[state.toAct] = { ...seat, committed: amount, lastAction: raise?.label ?? `Raise ${amount}bb` }
    next = { ...next, raises: state.raises + 1, responder: state.aggressor, aggressor: seat.position, acted: [] }
  }
  return advance(next, setup)
}

export function seatToAct(state: HandState): Seat | null {
  return state.toAct === null ? null : state.seats[state.toAct]
}

export function heroSeat(state: HandState): Seat {
  return state.seats.find((s) => s.position === state.hero)!
}
