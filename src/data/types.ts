import type { PlayerCount, Position } from '@/lib/positions'
import type { RangeDef } from '@/lib/range'
import type { Format, OpenSize, RangeType, Scenario, Stack } from '@/lib/scenarios'

/**
 * One range chart. Position arrays let a single chart serve several seats, and
 * the optional filters restrict which game setups the chart applies to. A
 * missing filter means "any".
 */
export interface RangeEntry {
  id: string
  scenario: Scenario
  rangeTypes: RangeType[]
  /** Defaults to cash only. */
  formats?: Format[]
  /** Defaults to every table size. */
  players?: PlayerCount[]
  /** Defaults to every stack depth. */
  stacks?: Stack[]
  /** Defaults to every open size (only the cash GTO sets distinguish them). */
  openSizes?: OpenSize[]
  hero: Position[]
  villain?: Position[]
  range: RangeDef
  /** Optional explanation shown under the chart. */
  note?: string
}
