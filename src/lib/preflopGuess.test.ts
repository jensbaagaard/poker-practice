import { describe, expect, it } from 'vitest'
import { addResult, bestAction, EMPTY_SCORE, grade } from './preflopGuess'

describe('grading', () => {
  it('picks the most frequent action, preferring aggression on ties', () => {
    expect(bestAction({ raise: 0, call: 0, fold: 1 })).toBe('fold')
    expect(bestAction({ raise: 0.5, call: 0.5, fold: 0 })).toBe('raise')
    expect(bestAction({ raise: 0.2, call: 0.5, fold: 0.3 })).toBe('call')
  })
  it('grades the best action as correct, a played action as partial, and an unplayed one as wrong', () => {
    const mixed = { raise: 0, call: 0.5, fold: 0.5 }
    expect(grade(mixed, 'call')).toBe('correct')
    expect(grade(mixed, 'fold')).toBe('partial')
    expect(grade(mixed, 'raise')).toBe('wrong')
  })
})

describe('score', () => {
  it('tracks totals and streaks', () => {
    let score = EMPTY_SCORE
    for (const g of ['correct', 'correct', 'partial', 'correct', 'wrong'] as const) score = addResult(score, g)
    expect(score).toEqual({ answered: 5, correct: 3, partial: 1, streak: 0, bestStreak: 2 })
  })
})
