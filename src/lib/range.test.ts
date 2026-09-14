import { describe, expect, it } from 'vitest'
import { actionTotals, expandToken, parseRange, resolveActions } from './range'

describe('expandToken', () => {
  it('expands pairs with plus', () => {
    expect(expandToken('JJ+')).toEqual(['JJ', 'QQ', 'KK', 'AA'])
  })
  it('expands suited plus up to the next rank below the high card', () => {
    expect(expandToken('KTs+')).toEqual(['KTs', 'KJs', 'KQs'])
  })
  it('expands a span sharing the high card', () => {
    expect(expandToken('A5s-A2s').sort()).toEqual(['A2s', 'A3s', 'A4s', 'A5s'])
  })
  it('expands a span sharing the gap', () => {
    expect(expandToken('T9s-76s').sort()).toEqual(['76s', '87s', '98s', 'T9s'])
  })
  it('expands pair spans', () => {
    expect(expandToken('77-99')).toEqual(['99', '88', '77'])
  })
  it('expands suitless tokens to both suited and offsuit', () => {
    expect(expandToken('AK')).toEqual(['AKs', 'AKo'])
  })
  it('normalises reversed rank order', () => {
    expect(expandToken('KAs')).toEqual(['AKs'])
  })
  it('rejects garbage', () => {
    expect(() => expandToken('ZZ')).toThrow()
    expect(() => expandToken('AKx')).toThrow()
  })
})

describe('parseRange', () => {
  it('applies weights and keeps the max on overlap', () => {
    const r = parseRange('A5s:0.5, A5s-A2s:0.25')
    expect(r.get('A5s')).toBe(0.5)
    expect(r.get('A2s')).toBe(0.25)
  })
  it('accepts whitespace and comma separators', () => {
    expect(parseRange('AA KK, QQ').size).toBe(3)
  })
})

describe('resolveActions / actionTotals', () => {
  it('computes combo-weighted totals that sum to one', () => {
    const weights = resolveActions({ raise: 'AA', call: 'AKs' })
    const totals = actionTotals(weights)
    expect(totals.raise).toBeCloseTo(6 / 1326)
    expect(totals.call).toBeCloseTo(4 / 1326)
    expect(totals.raise + totals.call + totals.fold).toBeCloseTo(1)
  })
  it('never lets call push a hand above 100%', () => {
    const weights = resolveActions({ raise: 'AA:0.7', call: 'AA' })
    expect(weights.get('AA')).toEqual({ raise: 0.7, call: expect.closeTo(0.3), fold: 0 })
  })
})
