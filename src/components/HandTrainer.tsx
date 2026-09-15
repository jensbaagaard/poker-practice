'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { RangeEntry } from '@/data/types'
import { act, decisionFor, heroSeat, sampleAction, seatToAct, startHand, type Decision, type HandState } from '@/lib/handSim'
import { POSITION_LABELS, type Position } from '@/lib/positions'
import { addResult, bestAction, EMPTY_SCORE, grade, type Grade, type TrainerSetup } from '@/lib/preflopGuess'
import { resolveActions, type Action } from '@/lib/range'
import { headline, heroRaise } from '@/lib/scenarios'
import { HoleCards } from './HoleCards'
import { RangeGrid } from './RangeGrid'
import { TableDiagram } from './TableDiagram'

interface Props {
  entries: RangeEntry[]
  setup: TrainerSetup
}

const NPC_DELAY_MS = 1000
const AUTO_NEXT_MS = 1200

const ACTION_LABELS: Record<Action, string> = { raise: 'Raise', call: 'Call', fold: 'Fold' }
const ACTION_KEYS: Record<string, Action> = { r: 'raise', c: 'call', f: 'fold', '1': 'raise', '2': 'call', '3': 'fold' }
const KEY_HINT: Record<Action, string> = { raise: 'R', call: 'C', fold: 'F' }
const GRADE_TEXT: Record<Grade, string> = { correct: 'Correct', partial: 'Partly right', wrong: 'Wrong' }

/** npc: opponents are acting · hero: waiting for the player · verdict: showing feedback on the player's move */
type Phase = 'npc' | 'hero' | 'verdict'

interface Verdict {
  decision: Decision
  guess: Action
  result: Grade
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`
}

export function HandTrainer({ entries, setup }: Props) {
  const [hand, setHand] = useState<HandState>(() => startHand(setup, Math.random, setup.seat))
  const [forcedFold, setForcedFold] = useState(false)
  const [phase, setPhase] = useState<Phase>('npc')
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [decisionsThisHand, setDecisionsThisHand] = useState(0)
  const [score, setScore] = useState(EMPTY_SCORE)

  const decision = useMemo(() => (phase === 'hero' ? decisionFor(hand, setup, entries) : null), [phase, hand, setup, entries])

  const newHand = useCallback(() => {
    setHand(startHand(setup, Math.random, setup.seat))
    setForcedFold(false)
    setPhase('npc')
    setVerdict(null)
    setDecisionsThisHand(0)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [setup])

  // Drive opponents, hand the turn to the player, and deal again after hands with no decision.
  useEffect(() => {
    if (phase !== 'npc') return
    if (hand.ended) {
      if (decisionsThisHand > 0) return
      const timer = setTimeout(newHand, AUTO_NEXT_MS)
      return () => clearTimeout(timer)
    }
    const seat = seatToAct(hand)
    if (!seat) return
    const current = decisionFor(hand, setup, entries)
    if (seat.position === hand.hero && current) {
      setPhase('hero')
      return
    }
    if (seat.position === hand.hero) setForcedFold(true)
    const timer = setTimeout(() => {
      setHand((prev) => act(prev, setup, current ? sampleAction(current) : 'fold', current))
    }, NPC_DELAY_MS)
    return () => clearTimeout(timer)
  }, [phase, hand, setup, entries, decisionsThisHand, newHand])

  function answer(action: Action) {
    if (phase !== 'hero' || !decision || !decision.actions.includes(action)) return
    const result = grade(decision.weights, action)
    setVerdict({ decision, guess: action, result })
    setScore((s) => addResult(s, result))
    setDecisionsThisHand((n) => n + 1)
    setHand((prev) => act(prev, setup, action, decision))
    setPhase('verdict')
  }

  function proceed() {
    if (hand.ended) newHand()
    else {
      setVerdict(null)
      setPhase('npc')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(e.target.tagName) && e.key !== 'Enter') return
      if (e.key === 'Enter' || e.key === ' ') {
        if (phase === 'verdict' || (phase === 'npc' && hand.ended)) {
          e.preventDefault()
          proceed()
        }
        return
      }
      const action = ACTION_KEYS[e.key.toLowerCase()]
      if (action) answer(action)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const hero = heroSeat(hand)
  const acting = seatToAct(hand)
  const folded = useMemo(() => new Set(hand.seats.filter((s) => s.folded).map((s) => s.position)), [hand])
  const bets = useMemo(() => {
    const out: Partial<Record<Position, number>> = {}
    for (const s of hand.seats) if (s.committed > 0) out[s.position] = s.committed
    return out
  }, [hand])
  const labels = useMemo(() => {
    const out: Partial<Record<Position, string>> = {}
    for (const s of hand.seats) {
      if (hand.ended && !s.folded && s.position !== hand.hero && hand.ended.kind !== 'hero-folded' && hand.ended.kind !== 'walk') {
        out[s.position] = `${s.lastAction ?? ''} · ${s.hand.label}`.replace(/^ · /, '')
      } else if (s.lastAction) {
        out[s.position] = s.lastAction
      }
    }
    return out
  }, [hand])

  const shownDecision = decision ?? verdict?.decision ?? null
  const villain = shownDecision?.villain
  const chartWeights = useMemo(() => (verdict ? resolveActions(verdict.decision.entry.range) : null), [verdict])

  let title: string
  let subtitle: string
  if (shownDecision) {
    const head = headline(shownDecision.scenario, setup, hand.hero, shownDecision.villain)
    title = head.title
    subtitle = phase === 'hero' ? 'Your move' : head.subtitle
  } else if (hand.ended) {
    title = 'Hand over'
    subtitle = forcedFoldNote(hand.ended.message, forcedFold)
  } else {
    title = `You are ${POSITION_LABELS[hand.hero]}`
    subtitle = acting ? `${POSITION_LABELS[acting.position]} to act…` : ''
  }

  const raise = shownDecision ? heroRaise(shownDecision.scenario, setup, hand.hero, shownDecision.villain) : null
  function label(action: Action): string {
    if (action === 'raise' && raise) return raise.label
    if (action === 'call' && shownDecision && !raise) return 'Call all-in'
    return ACTION_LABELS[action]
  }

  return (
    <>
      <section className="card">
        <div className="score" aria-live="polite">
          <ScoreItem value={score.answered} label="answered" />
          <ScoreItem value={score.answered ? pct(score.correct / score.answered) : '–'} label="correct" />
          <ScoreItem value={score.streak} label="streak" />
          <ScoreItem value={score.bestStreak} label="best" />
        </div>
      </section>

      <section className="card">
        <div className="range-card__head">
          <div className="range-card__title">
            <h2>{title}</h2>
            <span>{subtitle}</span>
          </div>
          <span className="pill">
            {POSITION_LABELS[hand.hero]} · {setup.players}-max
          </span>
        </div>

        <TableDiagram
          players={setup.players}
          hero={hand.hero}
          villain={villain}
          bets={bets}
          acting={acting?.position}
          folded={folded}
          labels={labels}
        />

        <HoleCards cards={hero.cards} />

        {phase === 'hero' && decision ? (
          <>
            <div className="actions" role="group" aria-label="Your move">
              {decision.actions.map((action) => (
                <button key={action} type="button" className={`action-btn action-btn--${action}`} onClick={() => answer(action)}>
                  <span>{label(action)}</span>
                </button>
              ))}
            </div>
            <div className="hover-info">
              Press{' '}
              {decision.actions.map((action, i) => (
                <span key={action}>
                  {i > 0 && (i === decision.actions.length - 1 ? ' or ' : ', ')}
                  <kbd>{KEY_HINT[action]}</kbd>
                </span>
              ))}{' '}
              to answer
            </div>
          </>
        ) : verdict ? (
          <VerdictView verdict={verdict} label={label} handOver={hand.ended} onProceed={proceed} />
        ) : hand.ended ? (
          <div className="verdict" aria-live="polite">
            <strong>{forcedFoldNote(hand.ended.message, forcedFold)}</strong>
            {decisionsThisHand > 0 ? (
              <button type="button" className="btn btn--primary verdict__next" onClick={newHand} autoFocus>
                Next hand
              </button>
            ) : (
              <span className="verdict__muted">Dealing the next hand…</span>
            )}
          </div>
        ) : (
          <div className="actions actions--waiting" aria-live="polite">
            {acting?.position === hand.hero ? 'No chart for this spot, you fold…' : acting ? `${POSITION_LABELS[acting.position]} is thinking…` : ''}
          </div>
        )}
      </section>

      {verdict && chartWeights && (
        <section className="card">
          <div className="range-card__head">
            <div className="range-card__title">
              <h2>Chart</h2>
              <span>{headline(verdict.decision.scenario, setup, hand.hero, verdict.decision.villain).title}</span>
            </div>
          </div>
          <RangeGrid weights={chartWeights} highlight={hero.hand.label} />
        </section>
      )}
    </>
  )
}

function forcedFoldNote(message: string, forced: boolean): string {
  return forced ? `${message} The charts only cover the previous raiser facing a re-raise, so a cold 3-bet is an automatic fold.` : message
}

function ScoreItem({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="score__item">
      <span className="score__value">{value}</span>
      <span className="score__label">{label}</span>
    </div>
  )
}

interface VerdictProps {
  verdict: Verdict
  label: (action: Action) => string
  handOver: HandState['ended']
  onProceed: () => void
}

function VerdictView({ verdict, label, handOver, onProceed }: VerdictProps) {
  const { decision, guess, result } = verdict
  const best = bestAction(decision.weights)
  const mostly = decision.weights[best] < 1
  return (
    <>
      <div className="actions" role="group" aria-label="Chart frequencies">
        {decision.actions.map((action) => {
          const classes = ['action-btn', `action-btn--${action}`]
          if (action === guess) classes.push('action-btn--chosen')
          if (action === best) classes.push('action-btn--best')
          if (action !== guess && action !== best) classes.push('action-btn--dim')
          return (
            <button key={action} type="button" className={classes.join(' ')} disabled>
              <span>{label(action)}</span>
              <small>{pct(decision.weights[action])}</small>
            </button>
          )
        })}
      </div>
      <div className={`verdict verdict--${result}`} aria-live="polite">
        <strong>{GRADE_TEXT[result]}.</strong>{' '}
        <span>
          {result === 'correct' ? `${label(best)} is the chart's move` : `The chart ${mostly ? 'mostly ' : ''}plays ${label(best).toLowerCase()}`}
          {result !== 'correct' && mostly ? ` (${pct(decision.weights[best])})` : ''}.{handOver ? ` ${handOver.message}` : ''}
        </span>
        <button type="button" className="btn btn--primary verdict__next" onClick={onProceed} autoFocus>
          {handOver ? 'Next hand' : 'Continue'}
        </button>
      </div>
    </>
  )
}
