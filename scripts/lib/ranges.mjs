import { RANKS, SUITS, comboKey } from './cards.mjs'

/**
 * Expand a chart range ("22, AKs, A5o:0.5, KQ") into { combo: weight } with
 * every suit combination. Combos containing a dead card are dropped.
 */
export function expandRange(text, dead = []) {
  const out = {}
  const deadSet = new Set(dead)
  for (const raw of text.split(/[,\s]+/).filter(Boolean)) {
    const [hand, weightText] = raw.split(':')
    const weight = weightText === undefined ? 1 : Number(weightText)
    const hi = hand[0]
    const lo = hand[1]
    const suffix = hand[2] ?? ''
    if (!RANKS.includes(hi) || !RANKS.includes(lo)) throw new Error(`Bad hand ${raw}`)
    for (const s1 of SUITS) {
      for (const s2 of SUITS) {
        const a = hi + s1
        const b = lo + s2
        if (hi === lo) {
          if (SUITS.indexOf(s1) >= SUITS.indexOf(s2)) continue
        } else if (suffix === 's' && s1 !== s2) continue
        else if (suffix === 'o' && s1 === s2) continue
        if (deadSet.has(a) || deadSet.has(b)) continue
        out[comboKey(a, b)] = Math.max(out[comboKey(a, b)] ?? 0, weight)
      }
    }
  }
  return out
}

/** TexasSolver range string from { combo: weight }, exact combos with weights. */
export function rangeString(combos) {
  return Object.entries(combos)
    .filter(([, w]) => w > 0.0005)
    .map(([combo, w]) => `${combo}:${w.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}`)
    .join(',')
}
