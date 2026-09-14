export const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'] as const
export type Rank = (typeof RANKS)[number]

export type HandKind = 'pair' | 'suited' | 'offsuit'

export interface Hand {
  /** Canonical label, e.g. "AKs", "T9o", "77". */
  label: string
  high: Rank
  low: Rank
  kind: HandKind
  /** Number of distinct card combinations: 6 for pairs, 4 suited, 12 offsuit. */
  combos: number
}

export const TOTAL_COMBOS = 1326

export function rankIndex(rank: Rank): number {
  return RANKS.indexOf(rank)
}

export function makeHand(a: Rank, b: Rank, kind: HandKind): Hand {
  const [high, low] = rankIndex(a) <= rankIndex(b) ? [a, b] : [b, a]
  if (kind === 'pair') return { label: `${high}${low}`, high, low, kind, combos: 6 }
  const suffix = kind === 'suited' ? 's' : 'o'
  return { label: `${high}${low}${suffix}`, high, low, kind, combos: kind === 'suited' ? 4 : 12 }
}

/** 13x13 grid, row-major. Row = first card rank, column = second card rank.
 *  Upper-right triangle is suited, lower-left is offsuit, diagonal is pairs. */
export const HAND_GRID: Hand[][] = RANKS.map((rowRank, i) =>
  RANKS.map((colRank, j) => {
    if (i === j) return makeHand(rowRank, colRank, 'pair')
    return makeHand(rowRank, colRank, i < j ? 'suited' : 'offsuit')
  }),
)

export const ALL_HANDS: Hand[] = HAND_GRID.flat()

export const HAND_BY_LABEL: ReadonlyMap<string, Hand> = new Map(ALL_HANDS.map((h) => [h.label, h]))
