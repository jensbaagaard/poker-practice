const POSITIONS = ['UTG', 'UTG1', 'UTG2', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'] as const
export type Position = (typeof POSITIONS)[number]

export const PLAYER_COUNTS = [6, 8, 9] as const
export type PlayerCount = (typeof PLAYER_COUNTS)[number]

export const POSITION_LABELS: Record<Position, string> = {
  UTG: 'UTG',
  UTG1: 'UTG+1',
  UTG2: 'UTG+2',
  LJ: 'LJ',
  HJ: 'HJ',
  CO: 'CO',
  BTN: 'BTN',
  SB: 'SB',
  BB: 'BB',
}

/** Positions in acting order preflop for a given table size. */
export function positionsFor(players: PlayerCount): Position[] {
  switch (players) {
    case 6:
      return ['LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB']
    case 8:
      return ['UTG', 'UTG1', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB']
    case 9:
      return ['UTG', 'UTG1', 'UTG2', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB']
  }
}

export function isBlind(position: Position): boolean {
  return position === 'SB' || position === 'BB'
}

export function isPosition(value: string | null | undefined): value is Position {
  return (POSITIONS as readonly string[]).includes(value ?? '')
}

export function isPlayerCount(value: number): value is PlayerCount {
  return (PLAYER_COUNTS as readonly number[]).includes(value)
}
