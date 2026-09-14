import { isPlayerCount, isPosition, type PlayerCount, type Position } from './positions'
import {
  DEFAULT_OPEN_SIZE,
  hasOpenSizeChoice,
  heroOptions,
  isFormat,
  isOpenSize,
  isRangeType,
  isScenario,
  isStack,
  rangeTypeOptions,
  SCENARIO_SHAPE,
  stackOptions,
  villainOptions,
  type GameSetup,
  type Scenario,
} from './scenarios'

export const SOURCES = ['builtin', 'user'] as const
export type Source = (typeof SOURCES)[number]

export interface ViewerState extends GameSetup {
  source: Source
  players: PlayerCount
  scenario: Scenario
  hero: Position
  villain?: Position
}

export const DEFAULT_STATE: ViewerState = {
  source: 'builtin',
  format: 'cash',
  players: 6,
  stack: 100,
  rangeType: 'pto',
  openSize: DEFAULT_OPEN_SIZE,
  scenario: 'open',
  hero: 'BTN',
}

/** Make stack, range type, hero and villain legal for the chosen format, scenario and table size. */
export function normalize(state: ViewerState): ViewerState {
  const stacks = stackOptions(state.format)
  const stack = stacks.includes(state.stack) ? state.stack : stacks[0]
  const rangeTypes = rangeTypeOptions(state.format)
  const rangeType = rangeTypes.includes(state.rangeType) ? state.rangeType : 'pto'

  const heroes = heroOptions(state.scenario, state.players)
  const hero = heroes.includes(state.hero) ? state.hero : heroes[heroes.length - 1]
  const base = { ...state, stack, rangeType, hero }
  if (!SCENARIO_SHAPE[state.scenario].needsVillain) return { ...base, villain: undefined }
  const villains = villainOptions(state.scenario, state.players, hero)
  const villain = state.villain && villains.includes(state.villain) ? state.villain : villains[0]
  return { ...base, villain }
}

export function fromSearchParams(params: URLSearchParams): ViewerState {
  const players = Number(params.get('players'))
  const stack = Number(params.get('stack'))
  const openSize = Number(params.get('open'))
  const source = params.get('source')
  const format = params.get('format')
  const rangeType = params.get('rangeType')
  const scenario = params.get('scenario')
  const hero = params.get('hero')
  const villain = params.get('villain')
  return normalize({
    source: source === 'user' ? 'user' : 'builtin',
    format: isFormat(format) ? format : DEFAULT_STATE.format,
    players: isPlayerCount(players) ? players : DEFAULT_STATE.players,
    stack: isStack(stack) ? stack : DEFAULT_STATE.stack,
    rangeType: isRangeType(rangeType) ? rangeType : DEFAULT_STATE.rangeType,
    openSize: isOpenSize(openSize) ? openSize : DEFAULT_STATE.openSize,
    scenario: isScenario(scenario) ? scenario : DEFAULT_STATE.scenario,
    hero: isPosition(hero) ? hero : DEFAULT_STATE.hero,
    villain: isPosition(villain) ? villain : undefined,
  })
}

/** Only the parameters that select a range set and table size. Shared between the viewer and the game modes. */
export function toSetupSearchParams(state: Pick<ViewerState, keyof GameSetup | 'players'>): URLSearchParams {
  const params = new URLSearchParams()
  params.set('format', state.format)
  params.set('rangeType', state.rangeType)
  if (hasOpenSizeChoice(state)) params.set('open', String(state.openSize))
  params.set('players', String(state.players))
  params.set('stack', String(state.stack))
  return params
}

export function toSearchParams(state: ViewerState): URLSearchParams {
  const params = toSetupSearchParams(state)
  if (state.source !== 'builtin') params.set('source', state.source)
  params.set('scenario', state.scenario)
  params.set('hero', state.hero)
  if (state.villain) params.set('villain', state.villain)
  return params
}
