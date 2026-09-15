import { makeHand, RANKS, type Hand, type Rank } from './hands'

export const SUITS = ['s', 'h', 'd', 'c'] as const
export type Suit = (typeof SUITS)[number]

export const SUIT_SYMBOLS: Record<Suit, string> = { s: '♠', h: '♥', d: '♦', c: '♣' }

export interface Card {
  rank: Rank
  suit: Suit
}

export type HoleCards = [Card, Card]

export const DECK: readonly Card[] = RANKS.flatMap((rank) => SUITS.map((suit): Card => ({ rank, suit })))

/** Random number in [0, 1). Injectable so games can be replayed in tests. */
export type Rng = () => number

function orderPair(a: Card, b: Card): HoleCards {
  return RANKS.indexOf(a.rank) <= RANKS.indexOf(b.rank) ? [a, b] : [b, a]
}

/** Deal `count` hands from one shuffled deck so no card appears twice at the table. */
export function dealTable(count: number, rng: Rng = Math.random): HoleCards[] {
  const deck = [...DECK]
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return Array.from({ length: count }, (_, i) => orderPair(deck[2 * i], deck[2 * i + 1]))
}

export function handOf([a, b]: HoleCards): Hand {
  if (a.rank === b.rank) return makeHand(a.rank, b.rank, 'pair')
  return makeHand(a.rank, b.rank, a.suit === b.suit ? 'suited' : 'offsuit')
}

export function cardLabel(card: Card): string {
  return `${card.rank}${SUIT_SYMBOLS[card.suit]}`
}
