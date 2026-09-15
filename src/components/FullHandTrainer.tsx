'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RangeEntry } from '@/data/types'
import {
  actionLabel,
  advancePostflop,
  boardShown,
  currentNode,
  currentStreet,
  dealForScript,
  foldHandFor,
  loadHandScript,
  mapHole,
  pickHand,
  positionOf,
  PREFLOP_FOLD_MESSAGE,
  randomSuitMap,
  resultMessage,
  scriptedPreflopAction,
  shortActionLabel,
  startPostflop,
  STREET_LABELS,
  type ActionKind,
  type HandIndex,
  type HandScript,
  type PostflopPlay,
  type SuitMap,
} from '@/lib/fullHands'
import { act, decisionFor, heroSeat, seatToAct, startHand, type Decision, type HandState } from '@/lib/handSim'
import { POSITION_LABELS, type Position } from '@/lib/positions'
import { resolveActions } from '@/lib/range'
import { headline } from '@/lib/scenarios'
import { addResult, EMPTY_SCORE, gradeIndex, preflopPrompt, type Prompt, type TrainerSetup } from '@/lib/trainer'
import { BoardCards, CardFace, HoleCards } from './HoleCards'
import { RangeGrid } from './RangeGrid'
import { StrategyGrid } from './StrategyGrid'
import { TableDiagram } from './TableDiagram'
import { ActionPrompt } from './trainer/ActionPrompt'
import { ScoreBar } from './trainer/ScoreBar'
import { useAnswerKeys } from './trainer/useAnswerKeys'
import { VerdictView, type Verdict } from './trainer/VerdictView'

interface Props {
  entries: RangeEntry[]
  setup: TrainerSetup
  index: HandIndex
}

const NPC_DELAY_MS = 1000
/** Share of hands where the player is dealt a hand the chart folds preflop instead of the script's cards. */
const FOLD_HAND_RATE = 0.3
const FLOP_KEYS: Record<ActionKind, string> = { X: 'x', B: 'b', R: 'r', AI: 'a', C: 'c', F: 'f' }

/** loading: fetching a script · npc: opponents act · hero: waiting for the player · verdict: feedback shown */
type Phase = 'loading' | 'npc' | 'hero' | 'verdict'

/** A prompt plus what is needed to show the chart or strategy behind it afterwards. */
interface HandPrompt extends Prompt {
  street: 'preflop' | 'flop' | 'turn' | 'river'
  decision?: Decision
  grid?: Record<string, number[]>
  kinds?: ActionKind[]
}

interface HandVerdict extends Verdict {
  prompt: HandPrompt
}

/**
 * A scripted hand in progress. `play` is null until the preflop is over. In a `foldHand` the player
 * holds a chart-fold hand instead of the script's cards, so the hand ends at their first decision.
 */
interface Live {
  script: HandScript
  suitMap: SuitMap
  hand: HandState
  play: PostflopPlay | null
  foldHand: boolean
}

/** Pre-generated hands played from the first preflop decision to the end; wrong moves are corrected and the line continues. */
export function FullHandTrainer({ entries, setup, index }: Props) {
  const [live, setLive] = useState<Live | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState<string | null>(null)
  const [verdict, setVerdict] = useState<HandVerdict | null>(null)
  const [score, setScore] = useState(EMPTY_SCORE)
  /** Bumped on every deal so a load that is superseded (strict-mode double effects, setup changes) is dropped. */
  const dealId = useRef(0)

  const newHand = useCallback(() => {
    const id = ++dealId.current
    const entry = pickHand(index, setup.seat)
    setVerdict(null)
    setLive(null)
    if (!entry) {
      setError(setup.seat ? `No generated hands with you in the ${POSITION_LABELS[setup.seat]} yet.` : 'No generated hands yet. Run scripts/generate-hands.mjs.')
      setPhase('npc')
      return
    }
    setError(null)
    setPhase('loading')
    loadHandScript(entry.id)
      .then((script) => {
        if (dealId.current !== id) return
        const suitMap = randomSuitMap()
        const foldCards = Math.random() < FOLD_HAND_RATE ? foldHandFor(script, suitMap, setup, entries) : null
        const dealt = dealForScript(script, suitMap, setup, entries, Math.random, foldCards ?? undefined)
        setLive({ script, suitMap, hand: startHand(setup, Math.random, script.hero, dealt), play: null, foldHand: foldCards !== null })
        setPhase('npc')
        window.scrollTo({ top: 0, behavior: 'smooth' })
      })
      .catch((err: Error) => {
        if (dealId.current !== id) return
        setError(`Could not load the hand. ${err.message}`)
        setPhase('npc')
      })
  }, [index, setup, entries])

  useEffect(() => {
    newHand()
  }, [newHand])

  const handOver = !!live && (live.play?.done || (!!live.hand.ended && live.hand.ended.kind !== 'flop'))
  const foldedPreflop = live?.hand.ended?.kind === 'hero-folded'

  // Drive the scripted line: opponents act after a pause, the player is prompted at their nodes.
  useEffect(() => {
    if (phase !== 'npc' || !live || handOver) return
    const { script, hand, play } = live
    if (play) {
      const node = currentNode(script, play)
      if (!node) return
      if (node.p === script.heroPlayer) {
        setPhase('hero')
        return
      }
      const timer = setTimeout(() => setLive((prev) => (prev?.play ? { ...prev, play: advancePostflop(prev.script, prev.play) } : prev)), NPC_DELAY_MS)
      return () => clearTimeout(timer)
    }
    if (hand.ended) {
      setLive((prev) => (prev ? { ...prev, play: startPostflop() } : prev))
      return
    }
    const seat = seatToAct(hand)
    if (!seat) return
    if (seat.position === hand.hero && decisionFor(hand, setup, entries)) {
      setPhase('hero')
      return
    }
    const timer = setTimeout(() => {
      setLive((prev) => {
        if (!prev || prev.play) return prev
        return { ...prev, hand: act(prev.hand, setup, scriptedPreflopAction(prev.hand, prev.script), decisionFor(prev.hand, setup, entries)) }
      })
    }, NPC_DELAY_MS)
    return () => clearTimeout(timer)
  }, [phase, live, handOver, setup, entries])

  const prompt = useMemo<HandPrompt | null>(() => {
    if (phase !== 'hero' || !live) return null
    const { script, hand, play } = live
    if (play) {
      const node = currentNode(script, play)
      if (!node?.probs) return null
      const street = currentStreet(script, play)!.street
      return {
        street,
        options: node.actions.map((a) => ({ label: actionLabel(a, play.bets, node.p), key: FLOP_KEYS[a.a], kind: a.a })),
        probs: node.probs,
        expected: node.chosen,
        title: `${POSITION_LABELS[script.hero]} vs ${POSITION_LABELS[script.villain]} · ${STREET_LABELS[street]}`,
        grid: node.grid,
        kinds: node.actions.map((a) => a.a),
      }
    }
    const decision = decisionFor(hand, setup, entries)
    if (!decision) return null
    const expected = live.foldHand ? undefined : scriptedPreflopAction(hand, script)
    return { ...preflopPrompt(decision, setup, expected), street: 'preflop', decision }
  }, [phase, live, setup, entries])

  const answer = useCallback(
    (index: number) => {
      if (!prompt) return
      const result = gradeIndex(prompt.probs, index)
      setVerdict({ prompt, guess: index, result })
      setScore((s) => addResult(s, result))
      setLive((prev) => {
        if (!prev) return prev
        if (prev.play) return { ...prev, play: advancePostflop(prev.script, prev.play) }
        const decision = prompt.decision!
        return { ...prev, hand: act(prev.hand, setup, decision.actions[prompt.expected], decision) }
      })
      setPhase('verdict')
    },
    [prompt, setup],
  )

  const proceed = useCallback(() => {
    if (handOver) newHand()
    else {
      setVerdict(null)
      setPhase('npc')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [handOver, newHand])

  useAnswerKeys({ prompt, onAnswer: answer, canProceed: phase === 'verdict' || (phase === 'npc' && handOver), onProceed: proceed })

  const hero = live ? heroSeat(live.hand) : null
  const actingPosition = useMemo<Position | null>(() => {
    if (!live) return null
    if (!live.play) return seatToAct(live.hand)?.position ?? null
    const node = currentNode(live.script, live.play)
    return node ? positionOf(live.script, node.p) : null
  }, [live])

  const folded = useMemo(() => new Set(live?.hand.seats.filter((s) => s.folded).map((s) => s.position) ?? []), [live])

  const bets = useMemo(() => {
    const out: Partial<Record<Position, number>> = {}
    if (!live) return out
    if (live.play) {
      for (const p of ['ip', 'oop'] as const) if (live.play.bets[p] > 0) out[positionOf(live.script, p)] = live.play.bets[p]
    } else {
      for (const s of live.hand.seats) if (s.committed > 0) out[s.position] = s.committed
    }
    return out
  }, [live])

  // Seat captions: preflop actions from the simulation, then each player's latest action on the current street.
  const labels = useMemo(() => {
    const out: Partial<Record<Position, string>> = {}
    if (!live) return out
    for (const s of live.hand.seats) if (s.lastAction) out[s.position] = s.lastAction
    if (live.play) {
      const street = currentStreet(live.script, live.play)!
      const played = live.play.done ? street.nodes : street.nodes.slice(0, live.play.nodeIndex)
      for (const p of ['ip', 'oop'] as const) {
        const last = played.filter((n) => n.p === p).pop()
        const position = positionOf(live.script, p)
        if (last) out[position] = shortActionLabel(last.actions[last.chosen])
        else delete out[position]
      }
    }
    return out
  }, [live])

  const shown = prompt ?? verdict?.prompt ?? null
  const handOverMessage = live && handOver ? (foldedPreflop ? PREFLOP_FOLD_MESSAGE : resultMessage(live.script)) : null
  const chartWeights = useMemo(() => (verdict?.prompt.decision ? resolveActions(verdict.prompt.decision.entry.range) : null), [verdict])

  let title = 'Dealing…'
  let subtitle = ''
  if (error) {
    title = 'No hand'
    subtitle = error
  } else if (shown && live) {
    title = shown.title
    subtitle = phase === 'hero' ? 'Your move' : shown.decision ? headline(shown.decision.scenario, setup, live.hand.hero, shown.decision.villain).subtitle : ''
  } else if (handOverMessage) {
    title = 'Hand over'
    subtitle = handOverMessage
  } else if (live) {
    const { script, play } = live
    title = play ? `${POSITION_LABELS[script.hero]} vs ${POSITION_LABELS[script.villain]} · ${STREET_LABELS[currentStreet(script, play)!.street]}` : `You are ${POSITION_LABELS[script.hero]}`
    subtitle = actingPosition ? `${POSITION_LABELS[actingPosition]} to act…` : ''
  }

  return (
    <>
      <ScoreBar score={score} unit="decisions" />

      <section className="card">
        <div className="range-card__head">
          <div className="range-card__title">
            <h2>{title}</h2>
            <span>{subtitle}</span>
          </div>
          {live && (
            <span className="pill">
              {POSITION_LABELS[live.script.hero]} · {live.script.kind === 'srp' ? 'Single-raised' : '3-bet pot'}
            </span>
          )}
        </div>

        {live && hero && (
          <>
            <TableDiagram
              players={setup.players}
              hero={live.script.hero}
              villain={live.script.villain}
              bets={bets}
              acting={handOver ? undefined : (actingPosition ?? undefined)}
              folded={folded}
              labels={labels}
              pot={live.play ? (live.play.done ? live.script.result.pot : currentStreet(live.script, live.play)!.pot) : undefined}
            />
            {live.play && <BoardCards cards={boardShown(live.script, live.play, live.suitMap)} />}
            {handOver && !foldedPreflop && live.script.result.kind === 'showdown' && (
              <div className="showdown">
                <span className="showdown__label">Villain</span>
                <div className="hole-cards hole-cards--small">
                  {mapHole(live.script.villainCards, live.suitMap).map((c) => (
                    <CardFace key={c.rank + c.suit} card={c} small />
                  ))}
                </div>
              </div>
            )}
            <HoleCards cards={hero.cards} />
          </>
        )}

        {prompt ? (
          <ActionPrompt prompt={prompt} onAnswer={answer} />
        ) : verdict ? (
          <VerdictView verdict={verdict} source={verdict.prompt.street === 'preflop' ? 'chart' : 'solver'} continues handOver={handOverMessage} onProceed={proceed} />
        ) : handOverMessage ? (
          <div className="verdict" aria-live="polite">
            <strong>{handOverMessage}</strong>
            <button type="button" className="btn btn--primary verdict__next" onClick={newHand} autoFocus>
              Next hand
            </button>
          </div>
        ) : error ? (
          <div className="empty">{error}</div>
        ) : (
          <div className="actions actions--waiting" aria-live="polite">
            {phase === 'loading' ? 'Dealing…' : actingPosition ? `${POSITION_LABELS[actingPosition]} is thinking…` : ''}
          </div>
        )}
      </section>

      {verdict && hero && chartWeights && (
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

      {verdict && hero && verdict.prompt.grid && verdict.prompt.kinds && verdict.prompt.street !== 'preflop' && (
        <section className="card">
          <div className="range-card__head">
            <div className="range-card__title">
              <h2>{STREET_LABELS[verdict.prompt.street]} strategy</h2>
              <span>{verdict.prompt.title}</span>
            </div>
          </div>
          <StrategyGrid kinds={verdict.prompt.kinds} labels={verdict.prompt.options.map((o) => o.label)} cells={verdict.prompt.grid} highlight={hero.hand.label} />
          <div className="notes">
            <p>Solver output for your whole range in this spot, averaged over suit combinations per hand. Your exact combo can differ.</p>
          </div>
        </section>
      )}
    </>
  )
}
