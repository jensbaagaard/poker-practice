'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { RangeEntry } from '@/data/types'
import { act, decisionFor, heroSeat, sampleAction, seatToAct, startHand, type Decision, type HandState } from '@/lib/handSim'
import { POSITION_LABELS, type Position } from '@/lib/positions'
import { resolveActions } from '@/lib/range'
import { headline } from '@/lib/scenarios'
import { addResult, EMPTY_SCORE, gradeIndex, preflopPrompt, type TrainerSetup } from '@/lib/trainer'
import { HoleCards } from './HoleCards'
import { RangeGrid } from './RangeGrid'
import { TableDiagram } from './TableDiagram'
import { ActionPrompt } from './trainer/ActionPrompt'
import { ScoreBar } from './trainer/ScoreBar'
import { useAnswerKeys } from './trainer/useAnswerKeys'
import { VerdictView, type Verdict } from './trainer/VerdictView'

interface Props {
  entries: RangeEntry[]
  setup: TrainerSetup
}

const NPC_DELAY_MS = 1000
const AUTO_NEXT_MS = 1200
const COLD_3BET_NOTE = 'The charts only cover the previous raiser facing a re-raise, so a cold 3-bet is an automatic fold.'

/** npc: opponents are acting · hero: waiting for the player · verdict: showing feedback on the player's move */
type Phase = 'npc' | 'hero' | 'verdict'

interface PreflopVerdict extends Verdict {
  decision: Decision
}

/** Preflop only: opponents play their cards from the charts and every decision of the player is graded. */
export function HandTrainer({ entries, setup }: Props) {
  const [hand, setHand] = useState<HandState>(() => startHand(setup, Math.random, setup.seat))
  const [forcedFold, setForcedFold] = useState(false)
  const [phase, setPhase] = useState<Phase>('npc')
  const [verdict, setVerdict] = useState<PreflopVerdict | null>(null)
  const [decisionsThisHand, setDecisionsThisHand] = useState(0)
  const [score, setScore] = useState(EMPTY_SCORE)

  const decision = useMemo(() => (phase === 'hero' ? decisionFor(hand, setup, entries) : null), [phase, hand, setup, entries])
  const prompt = useMemo(() => (decision ? preflopPrompt(decision, setup) : null), [decision, setup])

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

  const answer = useCallback(
    (index: number) => {
      if (!decision || !prompt) return
      const result = gradeIndex(prompt.probs, index)
      setVerdict({ prompt, guess: index, result, decision })
      setScore((s) => addResult(s, result))
      setDecisionsThisHand((n) => n + 1)
      setHand((prev) => act(prev, setup, decision.actions[index], decision))
      setPhase('verdict')
    },
    [decision, prompt, setup],
  )

  const proceed = useCallback(() => {
    if (hand.ended) newHand()
    else {
      setVerdict(null)
      setPhase('npc')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [hand.ended, newHand])

  useAnswerKeys({ prompt, onAnswer: answer, canProceed: phase === 'verdict' || (phase === 'npc' && !!hand.ended), onProceed: proceed })

  const hero = heroSeat(hand)
  const acting = seatToAct(hand)
  const folded = useMemo(() => new Set(hand.seats.filter((s) => s.folded).map((s) => s.position)), [hand])
  const bets = useMemo(() => Object.fromEntries(hand.seats.filter((s) => s.committed > 0).map((s) => [s.position, s.committed])) as Partial<Record<Position, number>>, [hand])
  const labels = useMemo(() => {
    const out: Partial<Record<Position, string>> = {}
    const reveal = hand.ended && !['hero-folded', 'walk'].includes(hand.ended.kind)
    for (const s of hand.seats) {
      if (reveal && !s.folded && s.position !== hand.hero) out[s.position] = [s.lastAction, s.hand.label].filter(Boolean).join(' · ')
      else if (s.lastAction) out[s.position] = s.lastAction
    }
    return out
  }, [hand])

  const shown = prompt ?? verdict?.prompt ?? null
  const shownDecision = decision ?? verdict?.decision ?? null
  const handOver = hand.ended ? `${hand.ended.message}${forcedFold ? ` ${COLD_3BET_NOTE}` : ''}` : null
  const chartWeights = useMemo(() => (verdict && shownDecision ? resolveActions(shownDecision.entry.range) : null), [verdict, shownDecision])

  let title: string
  let subtitle: string
  if (shown) {
    title = shown.title
    subtitle = phase === 'hero' ? 'Your move' : shownDecision ? headline(shownDecision.scenario, setup, hand.hero, shownDecision.villain).subtitle : ''
  } else if (handOver) {
    title = 'Hand over'
    subtitle = handOver
  } else {
    title = `You are ${POSITION_LABELS[hand.hero]}`
    subtitle = acting ? `${POSITION_LABELS[acting.position]} to act…` : ''
  }

  return (
    <>
      <ScoreBar score={score} unit="answered" />

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

        <TableDiagram players={setup.players} hero={hand.hero} villain={shownDecision?.villain} bets={bets} acting={acting?.position} folded={folded} labels={labels} />
        <HoleCards cards={hero.cards} />

        {prompt ? (
          <ActionPrompt prompt={prompt} onAnswer={answer} />
        ) : verdict ? (
          <VerdictView verdict={verdict} source="chart" continues={false} handOver={handOver} onProceed={proceed} />
        ) : handOver ? (
          <div className="verdict" aria-live="polite">
            <strong>{handOver}</strong>
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
              <span>{verdict.prompt.title}</span>
            </div>
          </div>
          <RangeGrid weights={chartWeights} highlight={hero.hand.label} />
        </section>
      )}
    </>
  )
}
