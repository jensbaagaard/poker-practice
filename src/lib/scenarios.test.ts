import { describe, expect, it } from 'vitest'
import { fourBetSize, headline, heroOptions, heroRaise, openSize, threeBetSize, villainOptions, type GameSetup } from './scenarios'

const CASH: GameSetup = { format: 'cash', stack: 100, rangeType: 'pto', openSize: 2.5 }
const CASH_GTO_2BB: GameSetup = { format: 'cash', stack: 100, rangeType: 'gto', openSize: 2 }
const MTT_100: GameSetup = { format: 'mtt', stack: 100, rangeType: 'pto', openSize: 2.5 }
const MTT_40: GameSetup = { format: 'mtt', stack: 40, rangeType: 'pto', openSize: 2.5 }
const MTT_20: GameSetup = { format: 'mtt', stack: 20, rangeType: 'pto', openSize: 2.5 }
const MTT_10: GameSetup = { format: 'mtt', stack: 10, rangeType: 'pto', openSize: 2.5 }

describe('cash sizing', () => {
  it('3-bets 3x in position and 5x from the blinds', () => {
    expect(threeBetSize(CASH, 'BTN', 'CO')).toBe(7.5)
    expect(threeBetSize(CASH, 'SB', 'LJ')).toBe(12.5)
    expect(threeBetSize(CASH, 'BB', 'SB')).toBe(15)
  })
  it('4-bets 2x in position and 2.5x out of position', () => {
    expect(fourBetSize(CASH, 'LJ', 'SB')).toBe(25)
    expect(fourBetSize(CASH, 'LJ', 'BTN')).toBe(19)
  })
  it('uses the chosen open size for GTO sets and floors 3-bets at 7bb', () => {
    expect(openSize(CASH_GTO_2BB, 'BTN')).toBe(2)
    expect(openSize(CASH_GTO_2BB, 'SB')).toBe(2.5)
    expect(threeBetSize(CASH_GTO_2BB, 'BTN', 'CO')).toBe(7)
  })
  it('ignores the open size choice for non-GTO sets', () => {
    expect(openSize({ ...CASH, openSize: 2 }, 'BTN')).toBe(2.5)
  })
})

describe('MTT sizing', () => {
  it('opens smaller and 3-bets 3.5x / 4.5x at 100bb', () => {
    expect(openSize(MTT_100, 'CO')).toBe(2.3)
    expect(openSize(MTT_100, 'SB')).toBe(4)
    expect(threeBetSize(MTT_100, 'BTN', 'CO')).toBe(8)
    expect(threeBetSize(MTT_100, 'BB', 'CO')).toBe(10.4)
  })
  it('caps 3-bets and jams 4-bets at 40bb', () => {
    expect(threeBetSize(MTT_40, 'BTN', 'CO')).toBe(6.9)
    expect(threeBetSize(MTT_40, 'BB', 'SB')).toBe(10)
    expect(fourBetSize(MTT_40, 'LJ', 'SB')).toBe(40)
  })
  it('jams 3-bets at 20bb and opens all-in at 10bb', () => {
    expect(threeBetSize(MTT_20, 'BTN', 'CO')).toBe(20)
    expect(openSize(MTT_10, 'BTN')).toBe(10)
  })
})

describe('headline', () => {
  it('describes cash spots with the raise size', () => {
    expect(headline('vs-raise', CASH, 'SB', 'LJ')).toEqual({ title: 'SB vs LJ Open', subtitle: '3-bet 12.5bb' })
    expect(headline('open', CASH, 'SB')).toEqual({ title: 'SB Open', subtitle: 'Open 3bb' })
  })
  it('says all-in when the raise is a jam', () => {
    expect(headline('open', MTT_10, 'BTN').subtitle).toBe('Open all-in 10bb')
    expect(headline('vs-raise', MTT_20, 'BB', 'BTN').subtitle).toBe('3-bet all-in 20bb')
    expect(headline('vs-4bet', MTT_100, 'BB', 'BTN').subtitle).toBe('5-bet all-in 100bb')
  })
  it('says facing all-in when the villain already jammed', () => {
    expect(headline('vs-raise', MTT_10, 'BB', 'BTN').subtitle).toBe('Facing all-in 10bb')
    expect(headline('vs-3bet', MTT_20, 'CO', 'BB').subtitle).toBe('Facing all-in 20bb')
    expect(headline('vs-4bet', MTT_40, 'BB', 'CO').subtitle).toBe('Facing all-in 40bb')
  })
})

describe('seat options', () => {
  it('lets every seat but the big blind open', () => {
    expect(heroOptions('open', 6)).toEqual(['LJ', 'HJ', 'CO', 'BTN', 'SB'])
  })
  it('only offers earlier seats as the opener when facing a raise', () => {
    expect(villainOptions('vs-raise', 6, 'CO')).toEqual(['LJ', 'HJ'])
  })
  it('only offers later seats as the 3-bettor', () => {
    expect(villainOptions('vs-3bet', 9, 'CO')).toEqual(['BTN', 'SB', 'BB'])
  })
})

describe('heroRaise', () => {
  it('names the raise the hero can make', () => {
    expect(heroRaise('open', CASH, 'BTN')?.label).toBe('Open 2.5bb')
    expect(heroRaise('vs-raise', CASH, 'BTN', 'CO')?.label).toBe('3-bet 7.5bb')
    expect(heroRaise('vs-4bet', CASH, 'SB', 'LJ')?.label).toBe('5-bet all-in 100bb')
  })
  it('is null when the hero faces an all-in', () => {
    expect(heroRaise('vs-3bet', MTT_20, 'BTN', 'BB')).toBeNull()
    expect(heroRaise('vs-raise', MTT_10, 'BB', 'BTN')).toBeNull()
    expect(heroRaise('vs-5bet', CASH, 'LJ', 'BB')).toBeNull()
  })
})
