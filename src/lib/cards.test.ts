import { describe, expect, it } from 'vitest'
import { dealHoleCards, DECK, handOf } from './cards'

function rngOf(...values: number[]) {
  let i = 0
  return () => values[i++ % values.length]
}

describe('dealHoleCards', () => {
  it('has 52 distinct cards to deal from', () => {
    expect(new Set(DECK.map((c) => c.rank + c.suit)).size).toBe(52)
  })
  it('never deals the same card twice', () => {
    for (let i = 0; i < 500; i++) {
      const [a, b] = dealHoleCards()
      expect(a.rank + a.suit).not.toBe(b.rank + b.suit)
    }
  })
  it('puts the higher rank first', () => {
    const [a, b] = dealHoleCards(rngOf(51 / 52, 0))
    expect(a.rank).toBe('A')
    expect(b.rank).toBe('2')
  })
})

describe('handOf', () => {
  it('classifies pairs, suited and offsuit hands', () => {
    expect(handOf([{ rank: 'A', suit: 's' }, { rank: 'A', suit: 'h' }]).label).toBe('AA')
    expect(handOf([{ rank: 'A', suit: 's' }, { rank: 'K', suit: 's' }]).label).toBe('AKs')
    expect(handOf([{ rank: 'T', suit: 'd' }, { rank: '9', suit: 'c' }]).label).toBe('T9o')
  })
})
