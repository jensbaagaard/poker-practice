import { POSITION_LABELS, positionsFor, type PlayerCount, type Position } from '@/lib/positions'

interface Props {
  players: PlayerCount
  hero: Position
  villain?: Position
  bets: Partial<Record<Position, number>>
  /** Seat whose turn it is, drawn with a pulsing ring. */
  acting?: Position
  /** Seats that have folded, drawn dimmed. */
  folded?: ReadonlySet<Position>
  /** Short text under each seat, e.g. the seat's last action or revealed hand. */
  labels?: Partial<Record<Position, string>>
  /** Pot size shown in the middle of the table. */
  pot?: number
}

const W = 480
const H = 280
const CX = W / 2
const CY = H / 2
const RX = 196
const RY = 90

function chipColor(position: Position, amount: number): string {
  if (position === 'SB' && amount === 0.5) return '#e04b4b'
  if (position === 'BB' && amount === 1) return '#3b6fd8'
  return '#8e8e96'
}

function formatBet(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(1).replace(/\.0$/, '')
}

export function TableDiagram({ players, hero, villain, bets, acting, folded, labels, pot }: Props) {
  const order = positionsFor(players)
  const heroIdx = order.indexOf(hero)
  const seats = order.map((position, i) => {
    const k = (i - heroIdx + order.length) % order.length
    const angle = Math.PI / 2 + (k * 2 * Math.PI) / order.length
    return { position, angle, x: CX + RX * Math.cos(angle), y: CY + RY * Math.sin(angle) }
  })

  return (
    <div className="table-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Table with ${players} players, hero ${hero}`}>
        <ellipse cx={CX} cy={CY} rx={RX} ry={RY} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
        {pot !== undefined && (
          <text x={CX} y={CY + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--muted)">
            Pot {formatBet(pot)}bb
          </text>
        )}
        {seats.map(({ position, angle, x, y }) => {
          const isHero = position === hero
          const isVillain = position === villain
          const isFolded = folded?.has(position) ?? false
          const label = labels?.[position]
          const bet = bets[position]
          const labelBelow = Math.sin(angle) >= 0
          const bx = CX + RX * 0.7 * Math.cos(angle)
          const by = CY + RY * 0.68 * Math.sin(angle)
          const dx = CX + RX * 0.86 * Math.cos(angle - 0.55)
          const dy = CY + RY * 0.84 * Math.sin(angle - 0.55)
          return (
            <g key={position} opacity={isFolded ? 0.35 : 1}>
              {position === acting && <circle cx={x} cy={y} r={22} fill="none" stroke="var(--accent)" strokeWidth={2} className="seat-pulse" />}
              <circle
                cx={x}
                cy={y}
                r={17}
                fill="#141519"
                stroke={isVillain ? 'var(--villain)' : isHero ? 'var(--accent)' : '#3a3b41'}
                strokeWidth={isHero || isVillain ? 2.5 : 1.5}
              />
              <text x={x} y={y + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--text)">
                {POSITION_LABELS[position]}
              </text>
              {label && (
                <text
                  x={x}
                  y={labelBelow ? y + 32 : y - 24}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight={600}
                  fill={isFolded ? 'var(--muted)' : 'var(--text)'}
                >
                  {label}
                </text>
              )}
              {position === 'BTN' && (
                <g>
                  <circle cx={dx} cy={dy} r={6} fill="#f2c94c" />
                  <text x={dx} y={dy + 3} textAnchor="middle" fontSize={7} fontWeight={700} fill="#1b1b1b">
                    D
                  </text>
                </g>
              )}
              {bet !== undefined && (
                <g>
                  <text x={bx - 7} y={by + 4} textAnchor="end" fontSize={11} fontWeight={600} fill="var(--text)">
                    {formatBet(bet)}
                  </text>
                  <circle cx={bx + 2} cy={by} r={6} fill={chipColor(position, bet)} stroke="#fff" strokeWidth={1} strokeDasharray="2 2" />
                </g>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
