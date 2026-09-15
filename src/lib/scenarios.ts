import { isBlind, positionsFor, type PlayerCount, type Position, POSITION_LABELS } from './positions'

export const SCENARIOS = ['open', 'vs-raise', 'vs-3bet', 'vs-4bet', 'vs-5bet'] as const
export type Scenario = (typeof SCENARIOS)[number]

export const SCENARIO_LABELS: Record<Scenario, string> = {
  open: 'Open',
  'vs-raise': 'vs raise',
  'vs-3bet': 'vs 3bet',
  'vs-4bet': 'vs 4bet',
  'vs-5bet': 'vs 5bet',
}

export const FORMATS = ['cash', 'mtt'] as const
export type Format = (typeof FORMATS)[number]

export const FORMAT_LABELS: Record<Format, string> = { cash: 'Cash', mtt: 'MTT' }

const RANGE_TYPES = ['pto', 'simple', 'pro', 'gto'] as const
export type RangeType = (typeof RANGE_TYPES)[number]

export const RANGE_TYPE_LABELS: Record<RangeType, string> = {
  pto: 'PTO',
  simple: 'Simple',
  pro: 'Pro',
  gto: 'GTO',
}

export const RANGE_TYPE_DESCRIPTIONS: Record<RangeType, { lead: string; text: string }> = {
  pto: {
    lead: 'Recommended.',
    text: 'One clear action for every hand, with mixed solver frequencies rounded to whichever option is played most. Robust against small differences in raise sizes.',
  },
  simple: {
    lead: 'Easiest to learn.',
    text: 'Fewer charts to memorise. Neighbouring positions share the same range, so you trade a little accuracy for a lot less to remember. Cash only.',
  },
  pro: {
    lead: 'For experienced players.',
    text: 'Position-specific ranges with some marginal hands played at a 50/50 mix where the solver is close to indifferent. Cash only.',
  },
  gto: {
    lead: 'Solver output.',
    text: 'Mixed frequencies for many hands. Hard to execute at the table, but useful for understanding which hands are close decisions.',
  },
}

const STACKS = [100, 40, 20, 10, 5] as const
export type Stack = (typeof STACKS)[number]

/** Raise-first-in size the cash GTO sets were solved for. Other sets use 2.5bb. */
export const OPEN_SIZES = [2, 2.5, 3] as const
export type OpenSize = (typeof OPEN_SIZES)[number]
export const DEFAULT_OPEN_SIZE: OpenSize = 2.5

/** The settings that select one range set. */
export interface GameSetup {
  format: Format
  stack: Stack
  rangeType: RangeType
  openSize: OpenSize
}

export function stackOptions(format: Format): Stack[] {
  return format === 'cash' ? [100] : [...STACKS]
}

export function rangeTypeOptions(format: Format): RangeType[] {
  return format === 'cash' ? [...RANGE_TYPES] : ['pto', 'gto']
}

/** Only the cash GTO sets exist for more than one open size. */
export function hasOpenSizeChoice(setup: Pick<GameSetup, 'format' | 'rangeType'>): boolean {
  return setup.format === 'cash' && setup.rangeType === 'gto'
}

export function effectiveOpenSize(setup: GameSetup): OpenSize {
  return hasOpenSizeChoice(setup) ? setup.openSize : DEFAULT_OPEN_SIZE
}

/** Who has acted before the hero and whether hero is the aggressor when the scenario begins. */
export interface ScenarioShape {
  /** Hero opened the pot (vs-3bet, vs-5bet) or is the original raiser's opponent. */
  heroIsOpener: boolean
  /** Whether a villain must be chosen. */
  needsVillain: boolean
}

export const SCENARIO_SHAPE: Record<Scenario, ScenarioShape> = {
  open: { heroIsOpener: true, needsVillain: false },
  'vs-raise': { heroIsOpener: false, needsVillain: true },
  'vs-3bet': { heroIsOpener: true, needsVillain: true },
  'vs-4bet': { heroIsOpener: false, needsVillain: true },
  'vs-5bet': { heroIsOpener: true, needsVillain: true },
}

export function heroOptions(scenario: Scenario, players: PlayerCount): Position[] {
  const order = positionsFor(players)
  if (SCENARIO_SHAPE[scenario].heroIsOpener) return order.filter((p) => p !== 'BB')
  return order.slice(1)
}

export function villainOptions(scenario: Scenario, players: PlayerCount, hero: Position): Position[] {
  const order = positionsFor(players)
  const heroIdx = order.indexOf(hero)
  if (heroIdx < 0 || !SCENARIO_SHAPE[scenario].needsVillain) return []
  return SCENARIO_SHAPE[scenario].heroIsOpener ? order.slice(heroIdx + 1) : order.slice(0, heroIdx)
}

// ------------------------------------------------------------------- Sizing

/** A raise as a multiple of the bet it responds to, with optional floor and caps. "IP" = later position. */
interface RaiseRule {
  ipMult: number
  oopMult: number
  min?: number
  ipMax?: number
  oopMax?: number
}

interface SizingProfile {
  openIp: number
  openSb: number
  threeBet: RaiseRule | 'all-in'
  fourBet: RaiseRule | 'all-in'
  ante: number
}

function cashSizing(openIp: number): SizingProfile {
  return {
    openIp,
    openSb: openIp + 0.5,
    threeBet: { ipMult: 3, oopMult: 5, min: 7 },
    fourBet: { ipMult: 2, oopMult: 2.5 },
    ante: 0,
  }
}

const MTT_SIZING: Record<Stack, SizingProfile> = {
  100: { openIp: 2.3, openSb: 4, threeBet: { ipMult: 3.5, oopMult: 4.5 }, fourBet: { ipMult: 2.2, oopMult: 2.5 }, ante: 1 },
  40: { openIp: 2.3, openSb: 3.5, threeBet: { ipMult: 3, oopMult: 4, ipMax: 9, oopMax: 10 }, fourBet: 'all-in', ante: 1 },
  20: { openIp: 2, openSb: 3, threeBet: 'all-in', fourBet: 'all-in', ante: 1 },
  10: { openIp: 10, openSb: 10, threeBet: 'all-in', fourBet: 'all-in', ante: 1 },
  5: { openIp: 5, openSb: 5, threeBet: 'all-in', fourBet: 'all-in', ante: 1 },
}

function sizingFor(setup: GameSetup): SizingProfile {
  return setup.format === 'cash' ? cashSizing(effectiveOpenSize(setup)) : MTT_SIZING[setup.stack]
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function applyRule(rule: RaiseRule | 'all-in', previousBet: number, inPosition: boolean, stack: Stack, round: (n: number) => number): number {
  if (rule === 'all-in') return stack
  let size = previousBet * (inPosition ? rule.ipMult : rule.oopMult)
  if (rule.min !== undefined) size = Math.max(rule.min, size)
  const max = inPosition ? rule.ipMax : rule.oopMax
  if (max !== undefined) size = Math.min(max, size)
  return Math.min(stack, round(size))
}

export function openSize(setup: GameSetup, position: Position): number {
  const s = sizingFor(setup)
  return Math.min(setup.stack, position === 'SB' ? s.openSb : s.openIp)
}

/** Size of a 3-bet by `threeBettor` against an open from `opener`. Blinds 3-bet larger. */
export function threeBetSize(setup: GameSetup, threeBettor: Position, opener: Position): number {
  return applyRule(sizingFor(setup).threeBet, openSize(setup, opener), !isBlind(threeBettor), setup.stack, round1)
}

/** Size of a 4-bet by `opener` against a 3-bet from `threeBettor`. */
export function fourBetSize(setup: GameSetup, opener: Position, threeBettor: Position): number {
  const openerInPosition = isBlind(threeBettor) && !isBlind(opener)
  return applyRule(sizingFor(setup).fourBet, threeBetSize(setup, threeBettor, opener), openerInPosition, setup.stack, Math.round)
}

// ----------------------------------------------------------------- Headline

export interface Headline {
  title: string
  subtitle: string
}

/** The raise available to the hero in a spot, e.g. "3-bet 7.5bb" or "4-bet all-in 100bb". */
export interface HeroRaise {
  label: string
  size: number
}

function raiseLabel(name: string, size: number, stack: Stack): string {
  return size >= stack ? `${name} all-in ${stack}bb` : `${name} ${size}bb`
}

/** What the hero would bet by raising, or null when the hero faces an all-in and can only call or fold. */
export function heroRaise(scenario: Scenario, setup: GameSetup, hero: Position, villain?: Position): HeroRaise | null {
  const { stack } = setup
  const raise = (name: string, size: number, facing?: number): HeroRaise | null =>
    facing !== undefined && facing >= stack ? null : { label: raiseLabel(name, size, stack), size }
  switch (scenario) {
    case 'open':
      return raise('Open', openSize(setup, hero))
    case 'vs-raise':
      return villain ? raise('3-bet', threeBetSize(setup, hero, villain), openSize(setup, villain)) : null
    case 'vs-3bet':
      return villain ? raise('4-bet', fourBetSize(setup, hero, villain), threeBetSize(setup, villain, hero)) : null
    case 'vs-4bet':
      return villain ? raise('5-bet', stack, fourBetSize(setup, villain, hero)) : null
    case 'vs-5bet':
      return null
  }
}

export function headline(scenario: Scenario, setup: GameSetup, hero: Position, villain?: Position): Headline {
  const h = POSITION_LABELS[hero]
  const v = villain ? POSITION_LABELS[villain] : ''
  const facing = `Facing all-in ${setup.stack}bb`
  const subtitle = (): string => heroRaise(scenario, setup, hero, villain)?.label ?? facing
  switch (scenario) {
    case 'open':
      return { title: `${h} Open`, subtitle: subtitle() }
    case 'vs-raise':
      return villain ? { title: `${h} vs ${v} Open`, subtitle: subtitle() } : { title: `${h} vs Open`, subtitle: '' }
    case 'vs-3bet':
      return villain ? { title: `${h} Open vs ${v} 3-bet`, subtitle: subtitle() } : { title: `${h} Open vs 3-bet`, subtitle: '' }
    case 'vs-4bet':
      return villain ? { title: `${h} 3-bet vs ${v} 4-bet`, subtitle: subtitle() } : { title: `${h} 3-bet vs 4-bet`, subtitle: '' }
    case 'vs-5bet':
      return { title: `${h} 4-bet vs ${v} 5-bet`, subtitle: facing }
  }
}

/** Chips on the table for the diagram: amount committed by each position when the hero acts. */
export function tableBets(
  scenario: Scenario,
  setup: GameSetup,
  hero: Position,
  villain: Position | undefined,
): Partial<Record<Position, number>> {
  const bets: Partial<Record<Position, number>> = { SB: 0.5, BB: 1 }
  if (!villain) return bets
  switch (scenario) {
    case 'open':
      break
    case 'vs-raise':
      bets[villain] = openSize(setup, villain)
      break
    case 'vs-3bet':
      bets[hero] = openSize(setup, hero)
      bets[villain] = threeBetSize(setup, villain, hero)
      break
    case 'vs-4bet':
      bets[hero] = threeBetSize(setup, hero, villain)
      bets[villain] = fourBetSize(setup, villain, hero)
      break
    case 'vs-5bet':
      bets[hero] = fourBetSize(setup, hero, villain)
      bets[villain] = setup.stack
      break
  }
  return bets
}

export function isScenario(value: string | null | undefined): value is Scenario {
  return (SCENARIOS as readonly string[]).includes(value ?? '')
}
export function isFormat(value: string | null | undefined): value is Format {
  return (FORMATS as readonly string[]).includes(value ?? '')
}
export function isRangeType(value: string | null | undefined): value is RangeType {
  return (RANGE_TYPES as readonly string[]).includes(value ?? '')
}
export function isStack(value: number): value is Stack {
  return (STACKS as readonly number[]).includes(value)
}
export function isOpenSize(value: number): value is OpenSize {
  return (OPEN_SIZES as readonly number[]).includes(value)
}
