/**
 * Pick a small weighted subset of flops that stands in for all 22,100 flops.
 *
 * Every flop is reduced to its strategically distinct form (suits relabelled so
 * only the suit *pattern* matters), which leaves 1,755 classes. Each class is
 * described by a handful of texture features, the classes are clustered with
 * k-medoids, and each medoid gets the combined frequency of its cluster as its
 * weight. Deterministic: the same size always yields the same subset.
 *
 * Usage: node scripts/flop-subset.mjs [size]     (default 25, prints JSON)
 */

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']
const SUITS = ['s', 'h', 'd', 'c']

/** Canonical key: ranks high→low, suits relabelled in order of first appearance. */
function canonical(cards) {
  const sorted = [...cards].sort((a, b) => b.rank - a.rank || a.suit - b.suit)
  const relabel = new Map()
  return sorted.map((c) => {
    if (!relabel.has(c.suit)) relabel.set(c.suit, relabel.size)
    return { rank: c.rank, suit: relabel.get(c.suit) }
  })
}

export function distinctFlops() {
  const classes = new Map()
  for (let a = 0; a < 52; a++)
    for (let b = a + 1; b < 52; b++)
      for (let c = b + 1; c < 52; c++) {
        const cards = [a, b, c].map((i) => ({ rank: Math.floor(i / 4), suit: i % 4 }))
        const canon = canonical(cards)
        const key = canon.map((x) => `${RANKS[x.rank]}${SUITS[x.suit]}`).join('')
        const entry = classes.get(key) ?? { key, cards: canon, count: 0 }
        entry.count++
        classes.set(key, entry)
      }
  return [...classes.values()]
}

function features({ cards }) {
  const r = cards.map((c) => c.rank)
  const suits = new Set(cards.map((c) => c.suit)).size
  const paired = r[0] === r[1] || r[1] === r[2]
  const trips = r[0] === r[2]
  const gaps = [r[0] - r[1], r[1] - r[2]]
  const spread = r[0] - r[2]
  const broadways = r.filter((x) => x >= 8).length
  return [
    r[0] / 12,
    r[1] / 12,
    r[2] / 12,
    suits === 1 ? 1.2 : suits === 2 ? 0.6 : 0,
    paired ? 1 : 0,
    trips ? 1 : 0,
    Math.min(spread, 8) / 8,
    Math.min(Math.min(...gaps), 4) / 4,
    broadways / 3,
    r[0] === 12 ? 0.5 : 0,
  ]
}

function dist(a, b) {
  let s = 0
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2
  return Math.sqrt(s)
}

/** Weighted k-medoids (PAM-style swaps) with deterministic farthest-point seeding. */
export function chooseSubset(size, flops = distinctFlops()) {
  const feats = flops.map(features)
  const n = flops.length
  const medoids = [0]
  while (medoids.length < size) {
    let best = -1
    let bestScore = -1
    for (let i = 0; i < n; i++) {
      const d = Math.min(...medoids.map((m) => dist(feats[i], feats[m]))) * flops[i].count
      if (d > bestScore) {
        bestScore = d
        best = i
      }
    }
    medoids.push(best)
  }

  const cost = (ms) => {
    let total = 0
    for (let i = 0; i < n; i++) total += Math.min(...ms.map((m) => dist(feats[i], feats[m]))) * flops[i].count
    return total
  }
  let current = cost(medoids)
  let improved = true
  while (improved) {
    improved = false
    for (let mi = 0; mi < medoids.length; mi++) {
      for (let i = 0; i < n; i++) {
        if (medoids.includes(i)) continue
        const trial = [...medoids]
        trial[mi] = i
        const c = cost(trial)
        if (c < current - 1e-9) {
          medoids[mi] = i
          current = c
          improved = true
        }
      }
    }
  }

  const weights = new Array(medoids.length).fill(0)
  for (let i = 0; i < n; i++) {
    let best = 0
    for (let m = 1; m < medoids.length; m++) {
      if (dist(feats[i], feats[medoids[m]]) < dist(feats[i], feats[medoids[best]])) best = m
    }
    weights[best] += flops[i].count
  }
  return medoids
    .map((m, i) => ({ board: flops[m].cards.map((c) => `${RANKS[c.rank]}${SUITS[c.suit]}`), weight: weights[i] / 22100 }))
    .sort((a, b) => b.weight - a.weight)
}

if (process.argv[1] && process.argv[1].endsWith('flop-subset.mjs')) {
  const size = Number(process.argv[2] ?? 25)
  console.log(JSON.stringify(chooseSubset(size), null, 2))
}
