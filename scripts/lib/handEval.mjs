import { RANKS } from './cards.mjs'

const CATEGORY_NAMES = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush']
const RANK_NAMES = { A: 'Aces', K: 'Kings', Q: 'Queens', J: 'Jacks', T: 'Tens', 9: 'Nines', 8: 'Eights', 7: 'Sevens', 6: 'Sixes', 5: 'Fives', 4: 'Fours', 3: 'Threes', 2: 'Twos' }

/** Rank value 14 (ace) … 2. */
function value(card) {
  return 14 - RANKS.indexOf(card[0])
}

function evaluate5(cards) {
  const values = cards.map(value).sort((a, b) => b - a)
  const suits = cards.map((c) => c[1])
  const flush = suits.every((s) => s === suits[0])
  const counts = new Map()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])
  const distinct = groups.map((g) => g[0])
  let straightHigh = 0
  if (distinct.length === 5) {
    if (distinct[0] - distinct[4] === 4) straightHigh = distinct[0]
    else if (distinct.join() === '14,5,4,3,2') straightHigh = 5
  }
  let category
  let tiebreak
  if (flush && straightHigh) [category, tiebreak] = [8, [straightHigh]]
  else if (groups[0][1] === 4) [category, tiebreak] = [7, distinct]
  else if (groups[0][1] === 3 && groups[1][1] === 2) [category, tiebreak] = [6, distinct]
  else if (flush) [category, tiebreak] = [5, values]
  else if (straightHigh) [category, tiebreak] = [4, [straightHigh]]
  else if (groups[0][1] === 3) [category, tiebreak] = [3, distinct]
  else if (groups[0][1] === 2 && groups[1][1] === 2) [category, tiebreak] = [2, distinct]
  else if (groups[0][1] === 2) [category, tiebreak] = [1, distinct]
  else [category, tiebreak] = [0, values]
  let score = category
  for (let i = 0; i < 5; i++) score = score * 16 + (tiebreak[i] ?? 0)
  return { score, category, tiebreak }
}

/** Best five-card hand from up to seven cards: { score, name }. Higher score wins. */
export function evaluateHand(cards) {
  let best = null
  const n = cards.length
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++) {
            const r = evaluate5([cards[a], cards[b], cards[c], cards[d], cards[e]])
            if (!best || r.score > best.score) best = r
          }
  return { score: best.score, name: describe(best) }
}

function rankName(v) {
  return RANK_NAMES[RANKS[14 - v]]
}

function describe({ category, tiebreak }) {
  const name = CATEGORY_NAMES[category]
  switch (category) {
    case 8:
      return tiebreak[0] === 14 ? 'Royal flush' : `${name}, ${rankName(tiebreak[0])} high`
    case 7:
    case 3:
    case 1:
      return `${name}, ${rankName(tiebreak[0])}`
    case 6:
      return `${name}, ${rankName(tiebreak[0])} full of ${rankName(tiebreak[1])}`
    case 5:
    case 0:
      return `${name}, ${rankName(tiebreak[0])} high`
    case 4:
      return `${name}, ${rankName(tiebreak[0])} high`
    case 2:
      return `${name}, ${rankName(tiebreak[0])} and ${rankName(tiebreak[1])}`
    default:
      return name
  }
}
