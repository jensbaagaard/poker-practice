'use client'

import { HAND_GRID, RANKS, type Rank } from '@/lib/hands'
import type { FlopAction, FlopNode } from '@/lib/postflop'

interface Props {
  node: FlopNode
  /** Hand label (e.g. "K7o") to outline. */
  highlight?: string
  labels: string[]
}

const ACTION_COLORS: Record<FlopAction['a'], string> = {
  X: 'var(--check)',
  C: 'var(--call)',
  B: 'var(--raise)',
  R: 'var(--raise-strong)',
  AI: 'var(--raise-strong)',
  F: 'var(--fold)',
}

interface CellData {
  combos: number
  avg: number[]
}

/** Average the per-combo strategy of a node into the 169 hand classes. */
function aggregate(node: FlopNode): Map<string, CellData> {
  const out = new Map<string, CellData>()
  const rankIdx = (r: string) => RANKS.indexOf(r as Rank)
  for (const [combo, probs] of Object.entries(node.s)) {
    const r1 = combo[0]
    const r2 = combo[2]
    const suited = combo[1] === combo[3]
    let label: string
    if (r1 === r2) label = `${r1}${r2}`
    else {
      const [high, low] = rankIdx(r1) <= rankIdx(r2) ? [r1, r2] : [r2, r1]
      label = `${high}${low}${suited ? 's' : 'o'}`
    }
    const cell = out.get(label) ?? { combos: 0, avg: probs.map(() => 0) }
    cell.combos++
    probs.forEach((p, i) => (cell.avg[i] += p))
    out.set(label, cell)
  }
  for (const cell of out.values()) cell.avg = cell.avg.map((sum) => sum / cell.combos)
  return out
}

function background(avg: number[], actions: FlopAction[]): string {
  const stops: string[] = []
  let acc = 0
  actions.forEach((action, i) => {
    const from = acc
    acc += avg[i]
    if (avg[i] > 0.5) stops.push(`${ACTION_COLORS[action.a]} ${from}% ${acc}%`)
  })
  if (stops.length === 1) return stops[0].split(' ')[0]
  return `linear-gradient(90deg, ${stops.join(', ')})`
}

export function StrategyGrid({ node, highlight, labels }: Props) {
  const cells = aggregate(node)
  const totals = node.actions.map(() => 0)
  let count = 0
  for (const cell of cells.values()) {
    count += cell.combos
    cell.avg.forEach((p, i) => (totals[i] += p * cell.combos))
  }
  return (
    <>
      <div className="grid" role="grid" aria-label="Flop strategy by hand">
        {HAND_GRID.flat().map((hand) => {
          const cell = cells.get(hand.label)
          const classes = ['cell']
          if (hand.kind === 'pair') classes.push('cell--pair')
          if (!cell) classes.push('cell--absent')
          if (hand.label === highlight) classes.push('cell--highlight')
          const title = cell ? labels.map((label, i) => `${label} ${Math.round(cell.avg[i])}%`).join(', ') : 'Not in range'
          return (
            <div key={hand.label} role="gridcell" className={classes.join(' ')} style={cell ? { background: background(cell.avg, node.actions) } : undefined} title={title}>
              {hand.label}
            </div>
          )
        })}
      </div>
      <div className="legend">
        {node.actions.map((action, i) => (
          <div key={i} className="legend__item">
            <span className="legend__swatch" style={{ background: ACTION_COLORS[action.a] }} />
            <strong>{labels[i]}</strong>
            <span className="legend__pct">{count ? (totals[i] / count).toFixed(1) : '0.0'}%</span>
          </div>
        ))}
      </div>
    </>
  )
}
