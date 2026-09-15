import { handLabel } from './cards.mjs'

/** Average a per-combo strategy map into the 169 hand classes, as integer percentages. */
export function aggregateGrid(strategy) {
  const sums = {}
  const counts = {}
  for (const [combo, probs] of Object.entries(strategy)) {
    const label = handLabel(combo.slice(0, 2), combo.slice(2, 4))
    counts[label] = (counts[label] ?? 0) + 1
    sums[label] = probs.map((p, i) => (sums[label]?.[i] ?? 0) + p)
  }
  const out = {}
  for (const label of Object.keys(sums)) out[label] = sums[label].map((s) => Math.round(s / counts[label]))
  return out
}
