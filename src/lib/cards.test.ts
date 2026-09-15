import { describe, expect, it } from 'vitest'
import { dealTable, DECK, handOf } from './cards'

function rngOf(...values: number[]) {
  let i = 0
  return () => values[i++ % values.length]
}

describe('dealTable', () => {
  it('has 52 distinct cards to deal from', () => {
    expect(new Set(DECK.map((c) => c.rank + c.suit)).size).toBe(52)
  })
  it('deals distinct cards to every seat, higher rank first', () => {
    const hands = dealTable(9)
    expect(new Set(hands.flat().map((c) => c.rank + c.suit)).size).toBe(18)
    for (const [a, b] of hands) expect(DECK.findIndex((c) => c.rank === a.rank)).toBeLessThanOrEqual(DECK.findIndex((c) => c.rank === b.rank))
  })
  it('is reproducible with a seeded generator', () => {
    const rng = rngOf(0.1, 0.7, 0.3, 0.9, 0.5)
    expect(dealTable(2, rng)).toEqual(dealTable(2, rngOf(0.1, 0.7, 0.3, 0.9, 0.5)))
  })
})

describe('handOf', () => {
  it('classifies pairs, suited and offsuit hands', () => {
    expect(handOf([{ rank: 'A', suit: 's' }, { rank: 'A', suit: 'h' }]).label).toBe('AA')
    expect(handOf([{ rank: 'A', suit: 's' }, { rank: 'K', suit: 's' }]).label).toBe('AKs')
    expect(handOf([{ rank: 'T', suit: 'd' }, { rank: '9', suit: 'c' }]).label).toBe('T9o')
  })
})
