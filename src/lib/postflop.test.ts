import { describe, expect, it } from 'vitest'
import type { HoleCards } from './cards'
import {
  actionLabel,
  applyFlopAction,
  hasStrategy,
  invertSuitMap,
  pickFlop,
  postflopSpotId,
  randomSuitMap,
  sampleIndex,
  startPostflop,
  strategyFor,
  type FlopNode,
  type FlopStrategy,
  type SpotInfo,
} from './postflop'
import { act, decisionFor, startHand } from './handSim'
import type { TrainerSetup } from './preflopGuess'
import type { RangeEntry } from '@/data/types'

const SPOT: SpotInfo = {
  kind: 'srp',
  opener: 'BTN',
  caller: 'BB',
  ip: 'BTN',
  oop: 'BB',
  pot: 5.5,
  stack: 97.5,
  boards: [
    { board: ['Js', '7h', '4h'], weight: 0.6 },
    { board: ['Ks', 'Kh', '2d'], weight: 0.4 },
  ],
}

const ipCall: FlopNode = { p: 'ip', actions: [{ a: 'C' }, { a: 'F' }], s: { AsAh: [100, 0], '7c7d': [0, 100] }, c: [null, null] }
const ROOT: FlopNode = {
  p: 'oop',
  actions: [{ a: 'X' }, { a: 'B', bb: 1.8 }, { a: 'AI', bb: 97.5 }],
  s: { Kd2c: [40, 60, 0], '5d5c': [100, 0, 0] },
  c: [{ p: 'ip', actions: [{ a: 'X' }, { a: 'B', bb: 1.8 }], s: { AsAh: [0, 100] }, c: [null, null] }, ipCall, ipCall],
}
const STRATEGY: FlopStrategy = { spot: 'srp-BTN-BB', board: ['Js', '7h', '4h'], weight: 0.6, pot: 5.5, stack: 97.5, exploitability: 3, root: ROOT }
const IDENTITY = { s: 's', h: 'h', d: 'd', c: 'c' } as const

describe('postflopSpotId', () => {
  const CASH: TrainerSetup = { format: 'cash', stack: 100, rangeType: 'pto', openSize: 2.5, players: 6 }
  const ENTRIES: RangeEntry[] = [
    { id: 'o', scenario: 'open', rangeTypes: ['pto'], hero: ['LJ', 'HJ', 'CO', 'BTN', 'SB'], range: { raise: 'AA' } },
    { id: 'v', scenario: 'vs-raise', rangeTypes: ['pto'], hero: ['SB', 'BB'], villain: ['BTN'], range: { call: 'AA' } },
  ]
  it('names the opener and caller of a heads-up single-raised pot', () => {
    let hand = startHand(CASH, () => 0, 'BB')
    for (const a of ['fold', 'fold', 'fold', 'raise', 'fold', 'call'] as const) hand = act(hand, CASH, a, decisionFor(hand, CASH, ENTRIES))
    expect(hand.ended?.kind).toBe('flop')
    expect(postflopSpotId(hand)).toBe('srp-BTN-BB')
  })
  it('is null for hands that did not reach a flop', () => {
    expect(postflopSpotId(startHand(CASH, () => 0, 'BB'))).toBeNull()
  })
})

describe('pickFlop', () => {
  it('never deals a board card that a player holds', () => {
    const blocked = [{ rank: 'J', suit: 's' }, { rank: 'J', suit: 'h' }, { rank: 'J', suit: 'd' }, { rank: 'J', suit: 'c' }] as const
    for (let i = 0; i < 50; i++) {
      const flop = pickFlop(SPOT, [...blocked])!
      expect(flop.board.some((c) => c.rank === 'J')).toBe(false)
      expect(flop.boardId).toBe('KsKh2d')
    }
  })
  it('relabels suits consistently', () => {
    const flop = pickFlop(SPOT, [], () => 0.99)!
    const inverse = invertSuitMap(flop.suitMap)
    expect(flop.board.map((c) => c.rank + inverse[c.suit]).join('')).toBe(flop.boardId)
  })
})

describe('strategy lookup', () => {
  it('finds a combo regardless of card order and suit relabelling', () => {
    const map = { s: 'c', h: 'd', d: 's', c: 'h' } as const
    const shown: HoleCards = [{ rank: 'K', suit: 's' }, { rank: '2', suit: 'h' }]
    expect(strategyFor(ROOT, shown, map)).toEqual([40, 60, 0])
    const pair: HoleCards = [{ rank: '5', suit: 'h' }, { rank: '5', suit: 's' }]
    expect(strategyFor(ROOT, pair, map)).toEqual([100, 0, 0])
  })
  it('knows whether a player has any strategy for a hand', () => {
    expect(hasStrategy(ROOT, 'ip', [{ rank: 'A', suit: 's' }, { rank: 'A', suit: 'h' }], IDENTITY)).toBe(true)
    expect(hasStrategy(ROOT, 'ip', [{ rank: 'Q', suit: 's' }, { rank: 'Q', suit: 'h' }], IDENTITY)).toBe(false)
  })
  it('samples by frequency', () => {
    expect(sampleIndex([40, 60, 0], () => 0.3)).toBe(0)
    expect(sampleIndex([40, 60, 0], () => 0.5)).toBe(1)
    expect(sampleIndex([0, 0, 0], () => 0.5)).toBe(2)
  })
})

describe('flop street', () => {
  const start = () => startPostflop('srp-BTN-BB', SPOT, STRATEGY, { boardId: 'Js7h4h', board: STRATEGY.board.map((c) => ({ rank: c[0], suit: c[1] }) as never), suitMap: IDENTITY })
  it('labels actions with amounts', () => {
    const s = start()
    expect(s.node!.actions.map((a) => actionLabel(a, s, 'oop'))).toEqual(['Check', 'Bet 1.8bb', 'All-in 97.5bb'])
    const afterBet = applyFlopAction(s, 1)
    expect(actionLabel({ a: 'C' }, afterBet, 'ip')).toBe('Call 1.8bb')
  })
  it('goes to the turn after a bet and a call', () => {
    const s = applyFlopAction(applyFlopAction(start(), 1), 0)
    expect(s.ended?.kind).toBe('turn')
    expect(s.bets).toEqual({ ip: 1.8, oop: 1.8 })
    expect(s.ended?.message).toContain('9.1bb')
  })
  it('ends the hand on a fold', () => {
    const s = applyFlopAction(applyFlopAction(start(), 1), 1)
    expect(s.ended?.kind).toBe('fold')
    expect(s.ended?.message).toContain('BB takes')
  })
  it('recognises an all-in that is called', () => {
    const s = applyFlopAction(applyFlopAction(start(), 2), 0)
    expect(s.ended?.kind).toBe('all-in')
  })
  it('makes a random suit map a bijection', () => {
    const map = randomSuitMap()
    expect(new Set(Object.values(map)).size).toBe(4)
  })
})
