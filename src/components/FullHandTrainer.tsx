'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { RangeEntry } from '@/data/types'
import {
  actionLabel,
  advancePostflop,
  boardShown,
  currentNode,
  currentStreet,
  dealForScript,
  loadHandScript,
  mapHole,
  pickHand,
  positionOf,
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
import { addResult, bestIndex, EMPTY_SCORE, gradeIndex, type Grade, type TrainerSetup } from '@/lib/preflopGuess'
import { resolveActions, type Action } from '@/lib/range'
import { headline, heroRaise } from '@/lib/scenarios'
import { BoardCards, CardFace, HoleCards } from './HoleCards'
import { RangeGrid } from './RangeGrid'
import { StrategyGrid } from './StrategyGrid'
import { TableDiagram } from './TableDiagram'

interface Props {
  entries: RangeEntry[]
  setup: TrainerSetup
  index: HandIndex
}

const NPC_DELAY_MS = 1000
const PREFLOP_KEYS: Record<Action, string> = { raise: 'r', call: 'c', fold: 'f' }
const FLOP_KEYS: Record<ActionKind, string> = { X: 'x', B: 'b', R: 'r', AI: 'a', C: 'c', F: 'f' }
const GRADE_TEXT: Record<Grade, string> = { correct: 'Correct', partial: 'Partly right', wrong: 'Wrong' }

type Phase = 'loading' | 'npc' | 'hero' | 'verdict'

interface Option {
  label: string
  key: string
  kind: string
}

interface Prompt {
  street: 'preflop' | 'flop' | 'turn' | 'river'
  options: Option[]
  probs: number[]
  /** Index the hand continues with, whatever the player picks. */
  expected: number
  title: string
  preflop?: Decision
  grid?: Record<string, number[]>
  kinds?: ActionKind[]
}

interface Verdict {
  prompt: Prompt
  guess: number
  result: Grade
}

interface Live {
  script: HandScript
  suitMap: SuitMap
  hand: HandState
  play: PostflopPlay | null
}

export function FullHandTrainer({ entries, setup, index }: Props) {
  const [live, setLive] = useState<Live | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState<string | null>(null)
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [score, setScore] = useState(EMPTY_SCORE)

  const newHand = useCallback(() => {
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
        const suitMap = randomSuitMap()
        const dealt = dealForScript(script, suitMap, setup, entries)
        setLive({ script, suitMap, hand: startHand(setup, Math.random, script.hero, dealt), play: null })
        setPhase('npc')
        window.scrollTo({ top: 0, behavior: 'smooth' })
      })
      .catch((err: Error) => {
        setError(`Could not load the hand. ${err.message}`)
        setPhase('npc')
      })
  }, [index, setup, entries])

  useEffect(() => {
    newHand()
  }, [newHand])

  const hand = live?.hand ?? null
  const play = live?.play ?? null
  const handOver = !!(play?.done || (hand?.ended && hand.ended.kind !== 'flop'))

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
      const timer = setTimeout(() => setLive((prev) => (prev && prev.play ? { ...prev, play: advancePostflop(prev.script, prev.play) } : prev)), NPC_DELAY_MS)
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
        const action = scriptedPreflopAction(prev.hand, prev.script)
        return { ...prev, hand: act(prev.hand, setup, action, decisionFor(prev.hand, setup, entries)) }
      })
    }, NPC_DELAY_MS)
    return () => clearTimeout(timer)
  }, [phase, live, handOver, setup, entries])

  const prompt = useMemo<Prompt | null>(() => {
    if (phase !== 'hero' || !live) return null
    const { script, hand, play } = live
    if (play) {
      const node = currentNode(script, play)
      if (!node || !node.probs) return null
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
    const raise = heroRaise(decision.scenario, setup, hand.hero, decision.villain)
    const label = (a: Action) => (a === 'raise' && raise ? raise.label : a === 'call' && !raise ? 'Call all-in' : a[0].toUpperCase() + a.slice(1))
    const expectedAction = scriptedPreflopAction(hand, script)
    return {
      street: 'preflop',
      options: decision.actions.map((a) => ({ label: label(a), key: PREFLOP_KEYS[a], kind: a })),
      probs: decision.actions.map((a) => Math.round(decision.weights[a] * 100)),
      expected: Math.max(0, decision.actions.indexOf(expectedAction)),
      title: headline(decision.scenario, setup, hand.hero, decision.villain).title,
      preflop: decision,
    }
  }, [phase, live, setup, entries])

  function answer(index: number) {
    if (phase !== 'hero' || !prompt || !live || index < 0 || index >= prompt.options.length) return
    const result = gradeIndex(prompt.probs, index)
    setVerdict({ prompt, guess: index, result })
    setScore((s) => addResult(s, result))
    setLive((prev) => {
      if (!prev) return prev
      if (prev.play) return { ...prev, play: advancePostflop(prev.script, prev.play) }
      const decision = prompt.preflop!
      return { ...prev, hand: act(prev.hand, setup, decision.actions[prompt.expected], decision) }
    })
    setPhase('verdict')
  }

  function proceed() {
    if (handOver) newHand()
    else {
      setVerdict(null)
      setPhase('npc')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
      if (e.key === 'Enter' || e.key === ' ') {
        if (phase === 'verdict' || (phase === 'npc' && handOver)) {
          e.preventDefault()
          proceed()
        }
        return
      }
      if (!prompt) return
      const key = e.key.toLowerCase()
      const digit = Number(key)
      const idx = Number.isInteger(digit) && digit >= 1 ? digit - 1 : prompt.options.findIndex((o) => o.key === key)
      if (idx >= 0) answer(idx)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const hero = hand ? heroSeat(hand) : null
  const actingPosition: Position | null = live
    ? play
      ? (() => {
          const node = currentNode(live.script, play)
          return node ? positionOf(live.script, node.p) : null
        })()
      : (seatToAct(live.hand)?.position ?? null)
    : null

  const folded = useMemo(() => new Set(hand?.seats.filter((s) => s.folded).map((s) => s.position) ?? []), [hand])
  const bets = useMemo(() => {
    const out: Partial<Record<Position, number>> = {}
    if (!live) return out
    if (play) {
      if (play.bets.ip > 0) out[positionOf(live.script, 'ip')] = play.bets.ip
      if (play.bets.oop > 0) out[positionOf(live.script, 'oop')] = play.bets.oop
      return out
    }
    for (const s of live.hand.seats) if (s.committed > 0) out[s.position] = s.committed
    return out
  }, [live, play])

  const labels = useMemo(() => {
    const out: Partial<Record<Position, string>> = {}
    if (!live) return out
    for (const s of live.hand.seats) if (s.lastAction) out[s.position] = s.lastAction
    if (play) {
      const street = live.script.streets[Math.min(play.streetIndex, live.script.streets.length - 1)]
      const upto = play.done ? street.nodes.length : play.nodeIndex
      for (const p of ['ip', 'oop'] as const) {
        const position = positionOf(live.script, p)
        const last = street.nodes.slice(0, upto).filter((n) => n.p === p).pop()
        if (last) out[position] = shortActionLabel(last.actions[last.chosen])
        else if (play.streetIndex > 0 || upto > 0) delete out[position]
        else delete out[position]
      }
    }
    return out
  }, [live, play])

  const shown = prompt ?? verdict?.prompt ?? null
  let title = 'Dealing…'
  let subtitle = ''
  if (error) {
    title = 'No hand'
    subtitle = error
  } else if (shown) {
    title = shown.title
    subtitle = phase === 'hero' ? 'Your move' : shown.street === 'preflop' && shown.preflop ? headline(shown.preflop.scenario, setup, hand!.hero, shown.preflop.villain).subtitle : ''
  } else if (live && handOver) {
    title = 'Hand over'
    subtitle = resultMessage(live.script)
  } else if (live) {
    title = play ? `${POSITION_LABELS[live.script.hero]} vs ${POSITION_LABELS[live.script.villain]} · ${STREET_LABELS[currentStreet(live.script, play)!.street]}` : `You are ${POSITION_LABELS[live.script.hero]}`
    subtitle = actingPosition ? `${POSITION_LABELS[actingPosition]} to act…` : ''
  }

  const preflopWeights = useMemo(() => (verdict?.prompt.preflop ? resolveActions(verdict.prompt.preflop.entry.range) : null), [verdict])

  return (
    <>
      <section className="card">
        <div className="score" aria-live="polite">
          <ScoreItem value={score.answered} label="decisions" />
          <ScoreItem value={score.answered ? `${Math.round((score.correct / score.answered) * 100)}%` : '–'} label="correct" />
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
              pot={play ? (play.done ? live.script.result.pot : currentStreet(live.script, play)!.pot) : undefined}
            />
            {play && <BoardCards cards={boardShown(live.script, play, live.suitMap)} />}
            {handOver && live.script.result.kind === 'showdown' && (
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
          <>
            <div className={`actions${prompt.options.length > 3 ? ' actions--wrap' : ''}`} role="group" aria-label="Your move">
              {prompt.options.map((o, i) => (
                <button key={i} type="button" className={`action-btn action-btn--${o.kind}`} onClick={() => answer(i)}>
                  <span>{o.label}</span>
                </button>
              ))}
            </div>
            <div className="hover-info">
              Press{' '}
              {prompt.options.map((o, i) => (
                <span key={i}>
                  {i > 0 && (i === prompt.options.length - 1 ? ' or ' : ', ')}
                  <kbd>{o.key.toUpperCase()}</kbd>
                </span>
              ))}{' '}
              to answer
            </div>
          </>
        ) : verdict ? (
          <VerdictView verdict={verdict} handOver={handOver && live ? resultMessage(live.script) : null} onProceed={proceed} />
        ) : live && handOver ? (
          <div className="verdict" aria-live="polite">
            <strong>{resultMessage(live.script)}</strong>
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

      {verdict && verdict.prompt.street === 'preflop' && preflopWeights && hero && (
        <section className="card">
          <div className="range-card__head">
            <div className="range-card__title">
              <h2>Chart</h2>
              <span>{verdict.prompt.title}</span>
            </div>
          </div>
          <RangeGrid weights={preflopWeights} highlight={hero.hand.label} />
        </section>
      )}

      {verdict && verdict.prompt.street !== 'preflop' && verdict.prompt.grid && verdict.prompt.kinds && hero && (
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
  handOver: string | null
  onProceed: () => void
}

function VerdictView({ verdict, handOver, onProceed }: VerdictProps) {
  const { prompt, guess, result } = verdict
  const best = bestIndex(prompt.probs)
  const mostly = prompt.probs[best] < 100
  const bestLabel = prompt.options[prompt.expected].label
  return (
    <>
      <div className={`actions${prompt.options.length > 3 ? ' actions--wrap' : ''}`} role="group" aria-label="Chart frequencies">
        {prompt.options.map((o, i) => {
          const classes = ['action-btn', `action-btn--${o.kind}`]
          if (i === guess) classes.push('action-btn--chosen')
          if (i === prompt.expected) classes.push('action-btn--best')
          if (i !== guess && i !== prompt.expected) classes.push('action-btn--dim')
          return (
            <button key={i} type="button" className={classes.join(' ')} disabled>
              <span>{o.label}</span>
              <small>{prompt.probs[i]}%</small>
            </button>
          )
        })}
      </div>
      <div className={`verdict verdict--${result}`} aria-live="polite">
        <strong>{GRADE_TEXT[result]}.</strong>{' '}
        <span>
          {result === 'correct'
            ? `${bestLabel} is the ${prompt.street === 'preflop' ? "chart's" : "solver's"} move`
            : `The ${prompt.street === 'preflop' ? 'chart' : 'solver'} ${mostly ? 'mostly ' : ''}plays ${bestLabel.toLowerCase()}${mostly ? ` (${prompt.probs[prompt.expected]}%)` : ''}, so the hand continues that way`}
          .{handOver ? ` ${handOver}` : ''}
        </span>
        <button type="button" className="btn btn--primary verdict__next" onClick={onProceed} autoFocus>
          {handOver ? 'Next hand' : 'Continue'}
        </button>
      </div>
    </>
  )
}
