import { useEffect } from 'react'
import type { Prompt } from '@/lib/trainer'

interface Options {
  /** The open question, if the player is being asked one. */
  prompt: Prompt | null
  onAnswer: (index: number) => void
  /** Whether Enter or Space should move the hand on right now. */
  canProceed: boolean
  onProceed: () => void
}

/** Option shortcuts (letters or 1–9) while a prompt is open; Enter or Space to continue. */
export function useAnswerKeys({ prompt, onAnswer, canProceed, onProceed }: Options): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
      if (e.key === 'Enter' || e.key === ' ') {
        if (canProceed) {
          e.preventDefault()
          onProceed()
        }
        return
      }
      if (!prompt) return
      const key = e.key.toLowerCase()
      const digit = Number(key)
      const index = Number.isInteger(digit) && digit >= 1 ? digit - 1 : prompt.options.findIndex((o) => o.key === key)
      if (index >= 0 && index < prompt.options.length) onAnswer(index)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prompt, onAnswer, canProceed, onProceed])
}
