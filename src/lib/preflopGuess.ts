import type { PlayerCount, Position } from './positions'
import type { Action, ActionWeights } from './range'
import type { GameSetup } from './scenarios'

export type Grade = 'correct' | 'partial' | 'wrong'

export interface TrainerSetup extends GameSetup {
  players: PlayerCount
  /** Fixed seat for the player; a random seat each hand when unset. */
  seat?: Position
}

/** The action the chart plays most often. Ties go to the more aggressive action. */
export function bestAction(weights: ActionWeights): Action {
  let best: Action = 'raise'
  for (const action of ['call', 'fold'] as const) {
    if (weights[action] > weights[best]) best = action
  }
  return best
}

/**
 * Correct when the guess is the chart's most frequent action, partial when the
 * chart plays it some of the time (mixed strategies), wrong otherwise.
 */
export function grade(weights: ActionWeights, guess: Action): Grade {
  if (guess === bestAction(weights)) return 'correct'
  return weights[guess] > 0 ? 'partial' : 'wrong'
}

/** Index of the most frequent option. Ties go to the earliest option, which the charts list as the most aggressive. */
export function bestIndex(probs: number[]): number {
  let best = 0
  for (let i = 1; i < probs.length; i++) if (probs[i] > probs[best]) best = i
  return best
}

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
