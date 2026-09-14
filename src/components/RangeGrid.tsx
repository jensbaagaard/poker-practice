'use client'

import { HAND_GRID, type Hand } from '@/lib/hands'
import type { ActionWeights } from '@/lib/range'

interface Props {
  weights: Map<string, ActionWeights>
  onHover?: (hand: Hand | null) => void
  /** Hand label to outline, e.g. the hand a trainer question was about. */
  highlight?: string
}

function cellBackground(w: ActionWeights): string {
  if (w.raise >= 0.999) return 'var(--raise)'
  if (w.call >= 0.999) return 'var(--call)'
  if (w.fold >= 0.999) return 'var(--fold)'
  const raiseEnd = w.raise * 100
  const callEnd = (w.raise + w.call) * 100
  return `linear-gradient(90deg, var(--raise) 0 ${raiseEnd}%, var(--call) ${raiseEnd}% ${callEnd}%, var(--fold) ${callEnd}% 100%)`
}

export function RangeGrid({ weights, onHover, highlight }: Props) {
  return (
    <div className="grid" onMouseLeave={() => onHover?.(null)} role="grid" aria-label="Hand range">
      {HAND_GRID.flat().map((hand) => {
        const w = weights.get(hand.label) ?? { raise: 0, call: 0, fold: 1 }
        return (
          <div
            key={hand.label}
            role="gridcell"
            className={`cell${hand.kind === 'pair' ? ' cell--pair' : ''}${hand.label === highlight ? ' cell--highlight' : ''}`}
            style={{ background: cellBackground(w) }}
            onMouseEnter={() => onHover?.(hand)}
            onFocus={() => onHover?.(hand)}
            tabIndex={0}
            aria-label={`${hand.label}: raise ${Math.round(w.raise * 100)}%, call ${Math.round(w.call * 100)}%, fold ${Math.round(w.fold * 100)}%`}
          >
            {hand.label}
          </div>
        )
      })}
    </div>
  )
}
