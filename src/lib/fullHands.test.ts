import { describe, expect, it } from 'vitest'
import type { RangeEntry } from '@/data/types'
import { handOf } from './cards'
import { act, decisionFor, startHand } from './handSim'
import {
  actionLabel,
  advancePostflop,
  boardShown,
  currentNode,
  dealForScript,
  pickHand,
  resultMessage,
  scriptedPreflopAction,
  startPostflop,
  type HandScript,
} from './fullHands'
import type { TrainerSetup } from './trainer'

const CASH: TrainerSetup = { format: 'cash', stack: 100, rangeType: 'pto', openSize: 2.5, players: 6 }
const ALL = ['LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'] as const
const ENTRIES: RangeEntry[] = [
  { id: 'o', scenario: 'open', rangeTypes: ['pto'], hero: [...ALL], range: { raise: 'AA, KK, QQ, AKs' } },
  { id: 'v', scenario: 'vs-raise', rangeTypes: ['pto'], hero: [...ALL], villain: [...ALL], range: { raise: 'AA', call: 'KK, QQ' } },
  { id: 'v3', scenario: 'vs-3bet', rangeTypes: ['pto'], hero: [...ALL], villain: [...ALL], range: { call: 'KK' } },
]
const IDENTITY = { s: 's', h: 'h', d: 'd', c: 'c' } as const

const SRP: HandScript = {
  spot: 'srp-BTN-BB',
  kind: 'srp',
  opener: 'BTN',
  caller: 'BB',
  hero: 'BB',
  villain: 'BTN',
  heroPlayer: 'oop',
  heroCards: ['Kd', 'Kc'],
  villainCards: ['Ad', 'Kh'],
  board: ['Js', '7h', '4h', '9d'],
  pot: 5.5,
  stack: 97.5,
  streets: [
    {
      street: 'flop',
      pot: 5.5,
      nodes: [
        { p: 'oop', actions: [{ a: 'X' }, { a: 'B', bb: 1.8, to: 1.8 }], chosen: 0, probs: [64, 36] },
        { p: 'ip', actions: [{ a: 'X' }, { a: 'B', bb: 1.8, to: 1.8 }], chosen: 1 },
        { p: 'oop', actions: [{ a: 'C', to: 1.8 }, { a: 'R', bb: 6.4, to: 6.4 }, { a: 'F' }], chosen: 1, probs: [26, 74, 0] },
        { p: 'ip', actions: [{ a: 'C', to: 6.4 }, { a: 'F' }], chosen: 0 },
      ],
    },
    { street: 'turn', pot: 18.3, nodes: [{ p: 'oop', actions: [{ a: 'X' }, { a: 'B', bb: 9.2, to: 9.2 }], chosen: 1, probs: [18, 82] }, { p: 'ip', actions: [{ a: 'C', to: 9.2 }, { a: 'F' }], chosen: 1 }] },
  ],
  result: { kind: 'fold', winner: 'hero', pot: 27.5 },
}

const THREE_BET: HandScript = { ...SRP, spot: '3bp-BTN-BB', kind: '3bp', caller: undefined, threeBettor: 'BB', heroCards: ['Ad', 'Ac'], villainCards: ['Kd', 'Kh'] }

describe('scripted preflop', () => {
  it('folds everyone but the opener and caller in a single-raised pot', () => {
    const cards = dealForScript(SRP, IDENTITY, CASH, ENTRIES, () => 0.37)
    let hand = startHand(CASH, () => 0, 'BB', cards)
    const actions: string[] = []
    while (!hand.ended) {
      const action = scriptedPreflopAction(hand, SRP)
      actions.push(`${hand.seats[hand.toAct!].position}:${action}`)
      hand = act(hand, CASH, action, decisionFor(hand, CASH, ENTRIES))
    }
    expect(actions).toEqual(['LJ:fold', 'HJ:fold', 'CO:fold', 'BTN:raise', 'SB:fold', 'BB:call'])
    expect(hand.ended?.kind).toBe('flop')
  })
  it('deals bystanders hands their chart folds', () => {
    const cards = dealForScript(SRP, IDENTITY, CASH, ENTRIES)
    const labels = cards.map((c) => handOf(c).label)
    expect(labels[3]).toBe('AKo')
    expect(labels[5]).toBe('KK')
    for (const i of [0, 1, 2, 4]) expect(['AA', 'KK', 'QQ', 'AKs']).not.toContain(labels[i])
    expect(new Set(cards.flat().map((c) => c.rank + c.suit)).size).toBe(12)
  })
  it('runs a 3-bet pot: open, 3-bet, call', () => {
    const cards = dealForScript(THREE_BET, IDENTITY, CASH, ENTRIES)
    let hand = startHand(CASH, () => 0, 'BB', cards)
    const actions: string[] = []
    while (!hand.ended) {
      const action = scriptedPreflopAction(hand, THREE_BET)
      actions.push(`${hand.seats[hand.toAct!].position}:${action}`)
      hand = act(hand, CASH, action, decisionFor(hand, CASH, ENTRIES))
    }
    expect(actions).toEqual(['LJ:fold', 'HJ:fold', 'CO:fold', 'BTN:raise', 'SB:fold', 'BB:raise', 'BTN:call'])
    expect(hand.raises).toBe(2)
  })
})

describe('postflop line', () => {
  it('walks the nodes, tracks street totals and reveals the board street by street', () => {
    let play = startPostflop()
    expect(currentNode(SRP, play)?.p).toBe('oop')
    expect(boardShown(SRP, play, IDENTITY)).toHaveLength(3)
    play = advancePostflop(SRP, play)
    play = advancePostflop(SRP, play)
    expect(play.bets).toEqual({ ip: 1.8, oop: 0 })
    expect(actionLabel(currentNode(SRP, play)!.actions[0], play.bets, 'oop')).toBe('Call 1.8bb')
    expect(actionLabel(currentNode(SRP, play)!.actions[1], play.bets, 'oop')).toBe('Raise to 6.4bb')
    play = advancePostflop(SRP, play)
    expect(play.bets).toEqual({ ip: 1.8, oop: 6.4 })
    play = advancePostflop(SRP, play)
    expect(play.streetIndex).toBe(1)
    expect(boardShown(SRP, play, IDENTITY)).toHaveLength(4)
    play = advancePostflop(SRP, play)
    play = advancePostflop(SRP, play)
    expect(play.done).toBe(true)
  })
  it('describes the result', () => {
    expect(resultMessage(SRP)).toBe('Villain folds. You take the 27.5bb pot.')
  })
  it('picks hands for a seat', () => {
    const index = { spots: {}, hands: [{ id: 'a', spot: 's', hero: 'BB' as const, result: 'fold' }, { id: 'b', spot: 's', hero: 'BTN' as const, result: 'fold' }] }
    expect(pickHand(index, 'BTN')?.id).toBe('b')
    expect(pickHand(index, 'SB')).toBeNull()
  })
})
