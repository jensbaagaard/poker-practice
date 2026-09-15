import type { Decision } from './handSim'
import type { PlayerCount, Position } from './positions'
import type { Action } from './range'
import { headline, heroRaise, type GameSetup } from './scenarios'

export type Grade = 'correct' | 'partial' | 'wrong'

export interface TrainerSetup extends GameSetup {
  players: PlayerCount
  /** Fixed seat for the player; a random seat each hand when unset. */
  seat?: Position
}

/** Index of the most frequent option. Ties go to the earliest option, which the charts list as the most aggressive. */
export function bestIndex(probs: number[]): number {
  let best = 0
  for (let i = 1; i < probs.length; i++) if (probs[i] > probs[best]) best = i
  return best
}

/**
 * Correct when the guess is the most frequent option, partial when the chart
 * plays it some of the time (mixed strategies), wrong otherwise.
 */
export function gradeIndex(probs: number[], guess: number): Grade {
  if (guess === bestIndex(probs)) return 'correct'
  return probs[guess] > 0 ? 'partial' : 'wrong'
}

export interface Score {
  answered: number
  correct: number
  partial: number
  streak: number
  bestStreak: number
}

export const EMPTY_SCORE: Score = { answered: 0, correct: 0, partial: 0, streak: 0, bestStreak: 0 }

export function addResult(score: Score, result: Grade): Score {
  const streak = result === 'correct' ? score.streak + 1 : 0
  return {
    answered: score.answered + 1,
    correct: score.correct + (result === 'correct' ? 1 : 0),
    partial: score.partial + (result === 'partial' ? 1 : 0),
    streak,
    bestStreak: Math.max(score.bestStreak, streak),
  }
}

// ------------------------------------------------------------------ Prompts

export interface PromptOption {
  label: string
  /** Keyboard shortcut. */
  key: string
  /** CSS modifier for the button colour. */
  kind: string
}

/** A decision put to the player, in a form shared by preflop and postflop spots. */
export interface Prompt {
  options: PromptOption[]
  /** Chart frequency of each option in percent. */
  probs: number[]
  /** Option the hand continues with: the chart's most frequent one unless a script dictates otherwise. */
  expected: number
  title: string
}

const PREFLOP_KEYS: Record<Action, string> = { raise: 'r', call: 'c', fold: 'f' }

export function preflopPrompt(decision: Decision, setup: GameSetup, expected?: Action): Prompt {
  const raise = heroRaise(decision.scenario, setup, decision.position, decision.villain)
  const label = (a: Action) => (a === 'raise' && raise ? raise.label : a === 'call' && !raise ? 'Call all-in' : a[0].toUpperCase() + a.slice(1))
  const probs = decision.actions.map((a) => Math.round(decision.weights[a] * 100))
  const scripted = expected ? decision.actions.indexOf(expected) : -1
  return {
    options: decision.actions.map((a) => ({ label: label(a), key: PREFLOP_KEYS[a], kind: a })),
    probs,
    expected: scripted >= 0 ? scripted : bestIndex(probs),
    title: headline(decision.scenario, setup, decision.position, decision.villain).title,
  }
}
