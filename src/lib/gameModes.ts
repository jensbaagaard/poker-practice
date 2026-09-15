export const GAME_MODES = ['full-hands', 'preflop'] as const
export type GameMode = (typeof GAME_MODES)[number]

export interface GameModeInfo {
  label: string
  description: string
}

export const GAME_MODE_INFO: Record<GameMode, GameModeInfo> = {
  'full-hands': {
    label: 'Full hands',
    description:
      'Play a hand from the first preflop decision to the river against opponents who follow the charts and solver. A wrong move is corrected and the hand continues along the right line.',
  },
  preflop: {
    label: 'Preflop',
    description: 'Play preflop against opponents who follow the charts; when the action reaches you, pick the move the chart plays.',
  },
}

export const DEFAULT_GAME_MODE: GameMode = 'full-hands'

export function isGameMode(value: string | null | undefined): value is GameMode {
  return (GAME_MODES as readonly string[]).includes(value ?? '')
}
