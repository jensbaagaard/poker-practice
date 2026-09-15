import type { Grade, Prompt } from '@/lib/trainer'
import { actionsClass } from './ActionPrompt'

export interface Verdict {
  prompt: Prompt
  guess: number
  result: Grade
}

const GRADE_TEXT: Record<Grade, string> = { correct: 'Correct', partial: 'Partly right', wrong: 'Wrong' }

interface Props {
  verdict: Verdict
  /** Where the answer came from, for the explanation. */
  source: 'chart' | 'solver'
  /** Whether the hand carries on along the expected option after a wrong answer. */
  continues: boolean
  /** Set when the hand is over: shown after the explanation and turns the button into "Next hand". */
  handOver: string | null
  onProceed: () => void
}

/** Feedback on an answer: every option with its frequency, the expected one outlined, and an explanation. */
export function VerdictView({ verdict, source, continues, handOver, onProceed }: Props) {
  const { prompt, guess, result } = verdict
  const expected = prompt.options[prompt.expected].label
  const mostly = prompt.probs[prompt.expected] < 100
  let text: string
  if (result === 'correct') text = `${expected} is the ${source}'s move.`
  else {
    text = `The ${source} ${mostly ? 'mostly ' : ''}plays ${expected.toLowerCase()}${mostly ? ` (${prompt.probs[prompt.expected]}%)` : ''}`
    text += continues ? ', so the hand continues that way.' : '.'
  }
  return (
    <>
      <div className={actionsClass(prompt)} role="group" aria-label="Chart frequencies">
        {prompt.options.map((o, i) => {
          const classes = ['action-btn', `action-btn--${o.kind}`]
          if (i === guess) classes.push('action-btn--chosen')
          if (i === prompt.expected) classes.push('action-btn--best')
          if (i !== guess && i !== prompt.expected) classes.push('action-btn--dim')
          return (
            <button key={i} type="button" className={classes.join(' ')} disabled>
              <span>{o.label}</span>
              <small>{prompt.probs[i]}%</small>
            </button>
          )
        })}
      </div>
      <div className={`verdict verdict--${result}`} aria-live="polite">
        <strong>{GRADE_TEXT[result]}.</strong>{' '}
        <span>
          {text}
          {handOver ? ` ${handOver}` : ''}
        </span>
        <button type="button" className="btn btn--primary verdict__next" onClick={onProceed} autoFocus>
          {handOver ? 'Next hand' : 'Continue'}
        </button>
      </div>
    </>
  )
}
