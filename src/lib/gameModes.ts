export const GAME_MODES = ['preflop-guess'] as const
export type GameMode = (typeof GAME_MODES)[number]

export interface GameModeInfo {
  label: string
  description: string
}

export const GAME_MODE_INFO: Record<GameMode, GameModeInfo> = {
  'preflop-guess': {
    label: 'Preflop move',
    description: 'A full preflop hand. Opponents play their cards from the charts; when the action reaches you, pick the move the chart plays.',
  },
}

export const DEFAULT_GAME_MODE: GameMode = 'preflop-guess'

export function isGameMode(value: string | null | undefined): value is GameMode {
  return (GAME_MODES as readonly string[]).includes(value ?? '')
}
