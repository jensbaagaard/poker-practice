import { describe, expect, it } from 'vitest'
import type { RangeEntry } from '@/data/types'
import { act, decisionFor, sampleAction, seatToAct, startHand, type HandState } from './handSim'
import type { TrainerSetup } from './trainer'

const CASH: TrainerSetup = { format: 'cash', stack: 100, rangeType: 'pto', openSize: 2.5, players: 6 }
const MTT_20: TrainerSetup = { ...CASH, format: 'mtt', stack: 20 }

const ALL = ['LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'] as const
const ENTRIES: RangeEntry[] = [
  { id: 'open', scenario: 'open', rangeTypes: ['pto'], formats: ['cash', 'mtt'], hero: [...ALL], range: { raise: 'AA, KK, AKs' } },
  { id: 'vs-raise', scenario: 'vs-raise', rangeTypes: ['pto'], formats: ['cash', 'mtt'], hero: [...ALL], villain: [...ALL], range: { raise: 'AA', call: 'KK, QQ:0.5' } },
  { id: 'vs-3bet', scenario: 'vs-3bet', rangeTypes: ['pto'], formats: ['cash', 'mtt'], hero: [...ALL], villain: [...ALL], range: { raise: 'AA', call: 'KK' } },
  { id: 'vs-4bet', scenario: 'vs-4bet', rangeTypes: ['pto'], formats: ['cash', 'mtt'], hero: [...ALL], villain: [...ALL], range: { raise: 'AA', call: 'KK' } },
  { id: 'vs-5bet', scenario: 'vs-5bet', rangeTypes: ['pto'], formats: ['cash', 'mtt'], hero: [...ALL], villain: [...ALL], range: { call: 'AA, KK' } },
]

const noRandom = () => 0

function play(state: HandState, setup: TrainerSetup, actions: ('raise' | 'call' | 'fold')[]): HandState {
  return actions.reduce((s, a) => act(s, setup, a, decisionFor(s, setup, ENTRIES)), state)
}

describe('startHand', () => {
  it('posts the blinds and gives the first seat the action', () => {
    const hand = startHand(CASH, noRandom, 'BTN')
    expect(hand.seats.map((s) => s.committed)).toEqual([0, 0, 0, 0, 0.5, 1])
    expect(seatToAct(hand)?.position).toBe('LJ')
    expect(hand.hero).toBe('BTN')
  })
  it('deals every seat different cards', () => {
    const hand = startHand(CASH)
    const cards = hand.seats.flatMap((s) => s.cards.map((c) => c.rank + c.suit))
    expect(new Set(cards).size).toBe(12)
  })
})

describe('action flow', () => {
  it('ends with a walk when everyone folds to the big blind', () => {
    const hand = play(startHand(CASH, noRandom, 'BB'), CASH, ['fold', 'fold', 'fold', 'fold', 'fold'])
    expect(hand.ended?.kind).toBe('walk')
  })
  it('lets the blinds respond to an open and goes to a flop after a call', () => {
    let hand = play(startHand(CASH, noRandom, 'LJ'), CASH, ['raise', 'fold', 'fold', 'fold'])
    expect(seatToAct(hand)?.position).toBe('SB')
    expect(decisionFor(hand, CASH, ENTRIES)).toMatchObject({ scenario: 'vs-raise', villain: 'LJ' })
    hand = play(hand, CASH, ['fold', 'call'])
    expect(hand.ended?.kind).toBe('flop')
    expect(hand.seats.find((s) => s.position === 'BB')?.committed).toBe(2.5)
  })
  it('returns the action to the opener after a 3-bet and folds everyone else', () => {
    let hand = play(startHand(CASH, noRandom, 'BTN'), CASH, ['raise', 'fold', 'call', 'raise'])
    expect(hand.raises).toBe(2)
    expect(seatToAct(hand)?.position).toBe('SB')
    expect(decisionFor(hand, CASH, ENTRIES)).toBeNull()
    hand = play(hand, CASH, ['fold', 'fold'])
    expect(seatToAct(hand)?.position).toBe('LJ')
    expect(decisionFor(hand, CASH, ENTRIES)).toMatchObject({ scenario: 'vs-3bet', villain: 'BTN' })
    hand = play(hand, CASH, ['fold'])
    expect(seatToAct(hand)?.position).toBe('CO')
    expect(decisionFor(hand, CASH, ENTRIES)).toBeNull()
    hand = play(hand, CASH, ['fold'])
    expect(hand.ended?.kind).toBe('uncontested')
  })
  it('escalates through 4-bet and 5-bet', () => {
    let hand = play(startHand(CASH, noRandom, 'SB'), CASH, ['raise', 'fold', 'fold', 'fold', 'raise', 'fold'])
    expect(decisionFor(hand, CASH, ENTRIES)).toMatchObject({ scenario: 'vs-3bet', position: 'LJ', villain: 'SB' })
    hand = play(hand, CASH, ['raise'])
    expect(decisionFor(hand, CASH, ENTRIES)).toMatchObject({ scenario: 'vs-4bet', position: 'SB', villain: 'LJ' })
    hand = play(hand, CASH, ['raise'])
    expect(decisionFor(hand, CASH, ENTRIES)).toMatchObject({ scenario: 'vs-5bet', position: 'LJ', actions: ['call', 'fold'] })
    hand = play(hand, CASH, ['call'])
    expect(hand.ended?.kind).toBe('all-in')
  })
  it('ends the hand when the hero folds', () => {
    const hand = play(startHand(CASH, noRandom, 'HJ'), CASH, ['raise', 'fold'])
    expect(hand.ended?.kind).toBe('hero-folded')
  })
  it('sizes raises from the sizing profile', () => {
    const hand = play(startHand(CASH, noRandom, 'BB'), CASH, ['fold', 'fold', 'raise', 'raise'])
    expect(hand.seats.find((s) => s.position === 'CO')?.committed).toBe(2.5)
    expect(hand.seats.find((s) => s.position === 'BTN')?.committed).toBe(7.5)
  })
  it('offers only call and fold against an all-in 3-bet', () => {
    const hand = play(startHand(MTT_20, noRandom, 'LJ'), MTT_20, ['raise', 'fold', 'fold', 'raise', 'fold', 'fold'])
    expect(decisionFor(hand, MTT_20, ENTRIES)?.actions).toEqual(['call', 'fold'])
  })
})

describe('sampleAction', () => {
  it('follows the chart frequencies', () => {
    const hand = startHand(CASH, noRandom, 'BB')
    const decision = { ...decisionFor(hand, CASH, ENTRIES)!, weights: { raise: 0.3, call: 0.2, fold: 0.5 }, actions: ['raise', 'call', 'fold'] as const }
    expect(sampleAction({ ...decision, actions: [...decision.actions] }, () => 0.1)).toBe('raise')
    expect(sampleAction({ ...decision, actions: [...decision.actions] }, () => 0.4)).toBe('call')
    expect(sampleAction({ ...decision, actions: [...decision.actions] }, () => 0.9)).toBe('fold')
  })
  it('folds when the sampled action is not available', () => {
    const hand = startHand(CASH, noRandom, 'BB')
    const decision = { ...decisionFor(hand, CASH, ENTRIES)!, weights: { raise: 0, call: 1, fold: 0 } }
    expect(sampleAction(decision, () => 0.5)).toBe('fold')
  })
})
