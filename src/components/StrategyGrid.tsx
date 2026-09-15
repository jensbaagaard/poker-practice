'use client'

import { HAND_GRID } from '@/lib/hands'
import type { ActionKind } from '@/lib/fullHands'

interface Props {
  /** Action kinds in option order, for colours. */
  kinds: ActionKind[]
  /** Option labels in the same order. */
  labels: string[]
  /** Average strategy per hand class in percent, in option order. Hands not in range are absent. */
  cells: Record<string, number[]>
  /** Hand label (e.g. "K7o") to outline. */
  highlight?: string
}

const ACTION_COLORS: Record<ActionKind, string> = {
  X: 'var(--check)',
  C: 'var(--call)',
  B: 'var(--raise)',
  R: 'var(--raise-strong)',
  AI: 'var(--raise-strong)',
  F: 'var(--fold)',
}

function background(avg: number[], kinds: ActionKind[]): string {
  const stops: string[] = []
  let acc = 0
  kinds.forEach((kind, i) => {
    const from = acc
    acc += avg[i]
    if (avg[i] > 0.5) stops.push(`${ACTION_COLORS[kind]} ${from}% ${acc}%`)
  })
  if (stops.length === 1) return stops[0].split(' ')[0]
  return `linear-gradient(90deg, ${stops.join(', ')})`
}

export function StrategyGrid({ kinds, labels, cells, highlight }: Props) {
  const totals = kinds.map(() => 0)
  let count = 0
  for (const avg of Object.values(cells)) {
    count++
    avg.forEach((p, i) => (totals[i] += p))
  }
  return (
    <>
      <div className="grid" role="grid" aria-label="Flop strategy by hand">
        {HAND_GRID.flat().map((hand) => {
          const avg = cells[hand.label]
          const classes = ['cell']
          if (hand.kind === 'pair') classes.push('cell--pair')
          if (!avg) classes.push('cell--absent')
          if (hand.label === highlight) classes.push('cell--highlight')
          const title = avg ? labels.map((label, i) => `${label} ${Math.round(avg[i])}%`).join(', ') : 'Not in range'
          return (
            <div key={hand.label} role="gridcell" className={classes.join(' ')} style={avg ? { background: background(avg, kinds) } : undefined} title={title}>
              {hand.label}
            </div>
          )
        })}
      </div>
      <div className="legend">
        {kinds.map((kind, i) => (
          <div key={i} className="legend__item">
            <span className="legend__swatch" style={{ background: ACTION_COLORS[kind] }} />
            <strong>{labels[i]}</strong>
            <span className="legend__pct">{count ? (totals[i] / count).toFixed(1) : '0.0'}%</span>
          </div>
        ))}
      </div>
    </>
  )
}
