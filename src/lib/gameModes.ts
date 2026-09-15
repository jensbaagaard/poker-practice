export const GAME_MODES = ['preflop-guess'] as const
export type GameMode = (typeof GAME_MODES)[number]

export interface GameModeInfo {
  label: string
  description: string
}

export const GAME_MODE_INFO: Record<GameMode, GameModeInfo> = {
  'preflop-guess': {
    label: 'Play a hand',
    description: 'Play a hand against opponents who follow the charts. Preflop uses the range charts; heads-up single-raised pots continue onto a solved flop.',
  },
}

export const DEFAULT_GAME_MODE: GameMode = 'preflop-guess'

export function isGameMode(value: string | null | undefined): value is GameMode {
  return (GAME_MODES as readonly string[]).includes(value ?? '')
}
