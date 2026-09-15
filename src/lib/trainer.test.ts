import { describe, expect, it } from 'vitest'
import type { RangeEntry } from '@/data/types'
import { decisionFor, startHand } from './handSim'
import { addResult, bestIndex, EMPTY_SCORE, gradeIndex, preflopPrompt, type TrainerSetup } from './trainer'

describe('grading', () => {
  it('picks the most frequent option, preferring the earliest on ties', () => {
    expect(bestIndex([0, 0, 100])).toBe(2)
    expect(bestIndex([50, 50, 0])).toBe(0)
    expect(bestIndex([20, 50, 30])).toBe(1)
  })
  it('grades the best option as correct, a played option as partial, and an unplayed one as wrong', () => {
    const mixed = [0, 50, 50]
    expect(gradeIndex(mixed, 1)).toBe('correct')
    expect(gradeIndex(mixed, 2)).toBe('partial')
    expect(gradeIndex(mixed, 0)).toBe('wrong')
  })
})

describe('score', () => {
  it('tracks totals and streaks', () => {
    let score = EMPTY_SCORE
    for (const g of ['correct', 'correct', 'partial', 'correct', 'wrong'] as const) score = addResult(score, g)
    expect(score).toEqual({ answered: 5, correct: 3, partial: 1, streak: 0, bestStreak: 2 })
  })
})

describe('preflopPrompt', () => {
  const CASH: TrainerSetup = { format: 'cash', stack: 100, rangeType: 'pto', openSize: 2.5, players: 6 }
  const ENTRIES: RangeEntry[] = [{ id: 'o', scenario: 'open', rangeTypes: ['pto'], hero: ['LJ'], range: { raise: 'AA:0.5' } }]
  it('labels the raise with its size and follows the chart by default', () => {
    const hand = startHand(CASH, () => 0, 'LJ')
    const prompt = preflopPrompt(decisionFor(hand, CASH, ENTRIES)!, CASH)
    expect(prompt.options.map((o) => o.label)).toEqual(['Open 2.5bb', 'Fold'])
    expect(prompt.options.map((o) => o.key)).toEqual(['r', 'f'])
    expect(prompt.title).toBe('LJ Open')
    expect(prompt.expected).toBe(bestIndex(prompt.probs))
  })
  it('lets a script dictate the expected option', () => {
    const hand = startHand(CASH, () => 0, 'LJ')
    expect(preflopPrompt(decisionFor(hand, CASH, ENTRIES)!, CASH, 'fold').expected).toBe(1)
  })
})
