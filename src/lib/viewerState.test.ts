import { describe, expect, it } from 'vitest'
import { DEFAULT_STATE, fromSearchParams, normalize, toSearchParams, type ViewerState } from './viewerState'

const MTT_20_GTO: ViewerState = { ...DEFAULT_STATE, format: 'mtt', stack: 20, rangeType: 'gto' }

describe('normalize', () => {
  it('keeps cash games at 100bb', () => {
    expect(normalize({ ...DEFAULT_STATE, stack: 20 }).stack).toBe(100)
  })
  it('keeps MTT stack depths and range types that exist', () => {
    expect(normalize(MTT_20_GTO)).toMatchObject({ stack: 20, rangeType: 'gto' })
  })
  it('falls back to PTO when the range type has no MTT sets', () => {
    expect(normalize({ ...DEFAULT_STATE, format: 'mtt', rangeType: 'pro' }).rangeType).toBe('pto')
  })
  it('picks the first legal villain when the scenario needs one', () => {
    expect(normalize({ ...DEFAULT_STATE, scenario: 'vs-raise', hero: 'BB' }).villain).toBe('LJ')
  })
})

describe('URL round trip', () => {
  it('stores the open size only for cash GTO', () => {
    const gto: ViewerState = { ...DEFAULT_STATE, rangeType: 'gto', openSize: 2 }
    expect(toSearchParams(gto).get('open')).toBe('2')
    expect(toSearchParams({ ...gto, rangeType: 'pto' }).get('open')).toBeNull()
  })
  it('restores a shared MTT link', () => {
    const shared: ViewerState = { ...MTT_20_GTO, players: 9, scenario: 'vs-raise', hero: 'BB', villain: 'UTG' }
    expect(fromSearchParams(toSearchParams(shared))).toEqual(shared)
  })
  it('ignores unknown values', () => {
    const params = new URLSearchParams('format=plo&stack=37&open=9&rangeType=magic&hero=XX')
    expect(fromSearchParams(params)).toEqual(DEFAULT_STATE)
  })
})
