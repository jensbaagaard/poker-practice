export const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2']
export const SUITS = ['s', 'h', 'd', 'c']
export const DECK = RANKS.flatMap((r) => SUITS.map((s) => r + s))

export function rankIndex(card) {
  return RANKS.indexOf(card[0])
}

/** Combo key with the higher card first; for pairs, suits in s,h,d,c order. */
export function comboKey(a, b) {
  const ra = rankIndex(a)
  const rb = rankIndex(b)
  if (ra < rb || (ra === rb && SUITS.indexOf(a[1]) < SUITS.indexOf(b[1]))) return a + b
  return b + a
}

/** Look a combo up in a solver strategy map, whichever card order it used. */
export function lookup(map, a, b) {
  return map[a + b] ?? map[b + a]
}

/** Hand class label, e.g. "AKs", "T9o", "77". */
export function handLabel(a, b) {
  const [hi, lo] = rankIndex(a) <= rankIndex(b) ? [a, b] : [b, a]
  if (hi[0] === lo[0]) return hi[0] + lo[0]
  return hi[0] + lo[0] + (hi[1] === lo[1] ? 's' : 'o')
}

export function shuffle(items, rng) {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Weighted random pick from [{ item, weight }]. */
export function weightedPick(entries, rng) {
  const total = entries.reduce((s, e) => s + e.weight, 0)
  let roll = rng() * total
  for (const e of entries) {
    roll -= e.weight
    if (roll <= 0) return e.item
  }
  return entries[entries.length - 1].item
}

/** Deterministic RNG (mulberry32) so a batch can be reproduced. */
export function seededRng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
