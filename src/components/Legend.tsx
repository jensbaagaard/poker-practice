import { ACTIONS, type ActionWeights } from '@/lib/range'

const LABELS: Record<keyof ActionWeights, string> = { raise: 'Raise', call: 'Call', fold: 'Fold' }

export function Legend({ totals }: { totals: ActionWeights }) {
  return (
    <div className="legend">
      {ACTIONS.map((action) => (
        <div key={action} className="legend__item">
          <span className="legend__swatch" style={{ background: `var(--${action})` }} />
          <strong>{LABELS[action]}</strong>
          <span className="legend__pct">{(totals[action] * 100).toFixed(1)}%</span>
        </div>
      ))}
    </div>
  )
}
