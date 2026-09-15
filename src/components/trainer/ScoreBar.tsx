import type { Score } from '@/lib/trainer'

export function ScoreBar({ score, unit }: { score: Score; unit: string }) {
  const items: [string | number, string][] = [
    [score.answered, unit],
    [score.answered ? `${Math.round((score.correct / score.answered) * 100)}%` : '–', 'correct'],
    [score.streak, 'streak'],
    [score.bestStreak, 'best'],
  ]
  return (
    <section className="card">
      <div className="score" aria-live="polite">
        {items.map(([value, label]) => (
          <div key={label} className="score__item">
            <span className="score__value">{value}</span>
            <span className="score__label">{label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
