import type { Prompt } from '@/lib/trainer'

export function actionsClass(prompt: Prompt): string {
  return `actions${prompt.options.length > 3 ? ' actions--wrap' : ''}`
}

/** The player's options as buttons, with their keyboard shortcuts. */
export function ActionPrompt({ prompt, onAnswer }: { prompt: Prompt; onAnswer: (index: number) => void }) {
  return (
    <>
      <div className={actionsClass(prompt)} role="group" aria-label="Your move">
        {prompt.options.map((o, i) => (
          <button key={i} type="button" className={`action-btn action-btn--${o.kind}`} onClick={() => onAnswer(i)}>
            <span>{o.label}</span>
          </button>
        ))}
      </div>
      <div className="hover-info">
        Press{' '}
        {prompt.options.map((o, i) => (
          <span key={i}>
            {i > 0 && (i === prompt.options.length - 1 ? ' or ' : ', ')}
            <kbd>{o.key.toUpperCase()}</kbd>
          </span>
        ))}{' '}
        to answer
      </div>
    </>
  )
}
