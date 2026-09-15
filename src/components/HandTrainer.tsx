'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RangeEntry } from '@/data/types'
import { act, decisionFor, heroSeat, sampleAction, seatToAct, startHand, type Decision, type HandState } from '@/lib/handSim'
import { POSITION_LABELS, type Position } from '@/lib/positions'
import {
  actionLabel,
  applyFlopAction,
  hasStrategy,
  loadFlopStrategy,
  loadManifest,
  pickFlop,
  playerOf,
  positionOf,
  postflopSpotId,
  sampleIndex,
  shortActionLabel,
  startPostflop,
  strategyFor,
  type FlopActionKind,
  type FlopNode,
  type PostflopManifest,
  type PostflopState,
} from '@/lib/postflop'
import { addResult, bestIndex, EMPTY_SCORE, gradeIndex, type Grade, type TrainerSetup } from '@/lib/preflopGuess'
import { resolveActions, type Action } from '@/lib/range'
import { headline, heroRaise } from '@/lib/scenarios'
import { BoardCards, HoleCards } from './HoleCards'
import { RangeGrid } from './RangeGrid'
import { StrategyGrid } from './StrategyGrid'
import { TableDiagram } from './TableDiagram'

interface Props {
  entries: RangeEntry[]
  setup: TrainerSetup
}

const NPC_DELAY_MS = 1000
const AUTO_NEXT_MS = 1200

const PREFLOP_KEYS: Record<Action, string> = { raise: 'r', call: 'c', fold: 'f' }
const FLOP_KEYS: Record<FlopActionKind, string> = { X: 'x', B: 'b', R: 'r', AI: 'a', C: 'c', F: 'f' }
const GRADE_TEXT: Record<Grade, string> = { correct: 'Correct', partial: 'Partly right', wrong: 'Wrong' }

/** npc: opponents act · loading: fetching the flop strategy · hero: waiting for the player · verdict: feedback shown */
type Phase = 'npc' | 'loading' | 'hero' | 'verdict'

interface Option {
  label: string
  key: string
  /** CSS modifier: preflop action name or flop action kind. */
  kind: string
}

/** What the player is asked, in a form shared by preflop and flop decisions. */
interface Prompt {
  street: 'preflop' | 'flop'
  options: Option[]
  /** Chart frequency of each option in percent. */
  probs: number[]
  title: string
  preflop?: Decision
  flopNode?: FlopNode
}

interface Verdict {
  prompt: Prompt
  guess: number
  result: Grade
}

export function HandTrainer({ entries, setup }: Props) {
  const [hand, setHand] = useState<HandState>(() => startHand(setup, Math.random, setup.seat))
  const [flop, setFlop] = useState<PostflopState | null>(null)
  const [flopNote, setFlopNote] = useState<string | null>(null)
  const [forcedFold, setForcedFold] = useState(false)
  const [phase, setPhase] = useState<Phase>('npc')
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [decisionsThisHand, setDecisionsThisHand] = useState(0)
  const [score, setScore] = useState(EMPTY_SCORE)
  const [manifest, setManifest] = useState<PostflopManifest | null>(null)
  const handId = useRef(0)
  const flopStartedFor = useRef(-1)

  useEffect(() => {
    let cancelled = false
    loadManifest().then((m) => {
      if (!cancelled) setManifest(m)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const hero = heroSeat(hand)
  const spotId = hand.ended?.kind === 'flop' ? postflopSpotId(hand) : null
  const flopAvailable = spotId !== null && manifest !== null && spotId in manifest.spots
  const waitingForFlop = hand.ended?.kind === 'flop' && !flop && !flopNote && (manifest === null || flopAvailable)

  const handOver = useMemo(() => {
    if (flop) return flop.ended
    if (!hand.ended || waitingForFlop) return null
    let extra = flopNote ?? (hand.ended.kind === 'flop' && spotId ? 'No solved flop for this spot yet.' : '')
    if (forcedFold) extra = 'The charts only cover the previous raiser facing a re-raise, so a cold 3-bet is an automatic fold.'
    return { kind: hand.ended.kind, message: `${hand.ended.message}${extra ? ` ${extra.trim()}` : ''}` }
  }, [flop, hand.ended, waitingForFlop, flopNote, spotId, forcedFold])

  const newHand = useCallback(() => {
    handId.current++
    setHand(startHand(setup, Math.random, setup.seat))
    setFlop(null)
    setFlopNote(null)
    setForcedFold(false)
    setPhase('npc')
    setVerdict(null)
    setDecisionsThisHand(0)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [setup])

  const startFlop = useCallback(() => {
    if (!manifest || !spotId || flopStartedFor.current === handId.current) return
    flopStartedFor.current = handId.current
    const id = handId.current
    const spot = manifest.spots[spotId]
    const blocked = hand.seats.filter((s) => !s.folded).flatMap((s) => s.cards)
    const chosen = pickFlop(spot, blocked)
    if (!chosen) {
      setFlopNote('No solved flop fits the cards in play.')
      return
    }
    setPhase('loading')
    loadFlopStrategy(spotId, chosen.boardId)
      .then((strategy) => {
        if (id !== handId.current) return
        const heroPlayer = playerOf(spot, hand.hero)
        if (!heroPlayer || !hasStrategy(strategy.root, heroPlayer, hero.cards, chosen.suitMap)) {
          setFlopNote("Your hand is outside the chart's range for this spot (a preflop deviation), so the flop can't be graded.")
        } else {
          setFlop(startPostflop(spotId, spot, strategy, chosen))
        }
        setPhase('npc')
      })
      .catch((err: Error) => {
        if (id !== handId.current) return
        setFlopNote(`Could not load the flop strategy. ${err.message}`)
        setPhase('npc')
      })
  }, [manifest, spotId, hand, hero.cards])

  // Drive opponents, hand the turn to the player, move onto the flop, and deal again after hands with no decision.
  useEffect(() => {
    if (phase !== 'npc') return
    if (flop) {
      if (flop.ended || !flop.node) return
      const node = flop.node
      const position = positionOf(flop.spot, node.p)
      if (position === hand.hero) {
        setPhase('hero')
        return
      }
      const npc = hand.seats.find((s) => s.position === position)!
      const timer = setTimeout(() => {
        setFlop((prev) => {
          if (!prev || prev.node !== node) return prev
          const probs = strategyFor(node, npc.cards, prev.suitMap)
          return applyFlopAction(prev, probs ? sampleIndex(probs) : fallbackIndex(node))
        })
      }, NPC_DELAY_MS)
      return () => clearTimeout(timer)
    }
    if (hand.ended) {
      if (waitingForFlop) {
        if (manifest) startFlop()
        return
      }
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
  }, [phase, hand, flop, setup, entries, decisionsThisHand, newHand, waitingForFlop, manifest, startFlop])

  const prompt = useMemo<Prompt | null>(() => {
    if (phase !== 'hero') return null
    if (flop?.node) {
      const player = playerOf(flop.spot, hand.hero)
      if (!player) return null
      const probs = strategyFor(flop.node, hero.cards, flop.suitMap) ?? flop.node.actions.map(() => 0)
      return {
        street: 'flop',
        options: flop.node.actions.map((a) => ({ label: actionLabel(a, flop, player), key: FLOP_KEYS[a.a], kind: a.a })),
        probs,
        title: `${POSITION_LABELS[hand.hero]} vs ${POSITION_LABELS[positionOf(flop.spot, player === 'ip' ? 'oop' : 'ip')]} · Flop`,
        flopNode: flop.node,
      }
    }
    const decision = decisionFor(hand, setup, entries)
    if (!decision) return null
    const raise = heroRaise(decision.scenario, setup, hand.hero, decision.villain)
    const label = (a: Action) => (a === 'raise' && raise ? raise.label : a === 'call' && !raise ? 'Call all-in' : a[0].toUpperCase() + a.slice(1))
    return {
      street: 'preflop',
      options: decision.actions.map((a) => ({ label: label(a), key: PREFLOP_KEYS[a], kind: a })),
      probs: decision.actions.map((a) => Math.round(decision.weights[a] * 100)),
      title: headline(decision.scenario, setup, hand.hero, decision.villain).title,
      preflop: decision,
    }
  }, [phase, flop, hand, hero.cards, setup, entries])

  function answer(index: number) {
    if (phase !== 'hero' || !prompt || index < 0 || index >= prompt.options.length) return
    const result = gradeIndex(prompt.probs, index)
    setVerdict({ prompt, guess: index, result })
    setScore((s) => addResult(s, result))
    setDecisionsThisHand((n) => n + 1)
    if (prompt.street === 'flop') setFlop((prev) => (prev ? applyFlopAction(prev, index) : prev))
    else if (prompt.preflop) setHand((prev) => act(prev, setup, prompt.preflop!.actions[index], prompt.preflop!))
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
      const index = Number.isInteger(digit) && digit >= 1 ? digit - 1 : prompt.options.findIndex((o) => o.key === key)
      if (index >= 0) answer(index)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const acting = flop?.node ? hand.seats.find((s) => s.position === positionOf(flop.spot, flop.node!.p)) ?? null : seatToAct(hand)
  const folded = useMemo(() => new Set(hand.seats.filter((s) => s.folded).map((s) => s.position)), [hand])

  const bets = useMemo(() => {
    const out: Partial<Record<Position, number>> = {}
    if (flop) {
      if (flop.bets.ip > 0) out[flop.spot.ip] = flop.bets.ip
      if (flop.bets.oop > 0) out[flop.spot.oop] = flop.bets.oop
      return out
    }
    for (const s of hand.seats) if (s.committed > 0) out[s.position] = s.committed
    return out
  }, [hand, flop])

  const labels = useMemo(() => {
    const out: Partial<Record<Position, string>> = {}
    const reveal = handOver && handOver.kind !== 'hero-folded' && handOver.kind !== 'walk' && handOver.kind !== 'fold'
    for (const s of hand.seats) {
      let last = s.lastAction
      if (flop) {
        const player = playerOf(flop.spot, s.position)
        const item = player ? [...flop.history].reverse().find((h) => h.player === player) : undefined
        if (item) last = shortActionLabel(item.action)
        else if (player) last = undefined
      }
      if (reveal && !s.folded && s.position !== hand.hero) out[s.position] = [last, s.hand.label].filter(Boolean).join(' · ')
      else if (last) out[s.position] = last
    }
    return out
  }, [hand, flop, handOver])

  const shown = prompt ?? verdict?.prompt ?? null
  const villain = shown?.preflop?.villain ?? (flop ? positionOf(flop.spot, playerOf(flop.spot, hand.hero) === 'ip' ? 'oop' : 'ip') : undefined)

  let title: string
  let subtitle: string
  if (shown) {
    title = shown.title
    subtitle = phase === 'hero' ? 'Your move' : shown.street === 'preflop' ? headline(shown.preflop!.scenario, setup, hand.hero, shown.preflop!.villain).subtitle : ''
  } else if (handOver) {
    title = 'Hand over'
    subtitle = handOver.message
  } else if (phase === 'loading' || waitingForFlop) {
    title = 'Going to the flop'
    subtitle = 'Dealing…'
  } else if (flop) {
    title = `${POSITION_LABELS[hand.hero]} vs ${villain ? POSITION_LABELS[villain] : ''} · Flop`
    subtitle = acting ? `${POSITION_LABELS[acting.position]} to act…` : ''
  } else {
    title = `You are ${POSITION_LABELS[hand.hero]}`
    subtitle = acting ? `${POSITION_LABELS[acting.position]} to act…` : ''
  }

  const preflopWeights = useMemo(() => (verdict?.prompt.preflop ? resolveActions(verdict.prompt.preflop.entry.range) : null), [verdict])

  return (
    <>
      <section className="card">
        <div className="score" aria-live="polite">
          <ScoreItem value={score.answered} label="answered" />
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
          pot={flop ? flop.spot.pot : undefined}
        />

        {flop && <BoardCards cards={flop.board} />}
        <HoleCards cards={hero.cards} />

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
          <VerdictView verdict={verdict} handOver={handOver?.message ?? null} onProceed={proceed} />
        ) : handOver ? (
          <div className="verdict" aria-live="polite">
            <strong>{handOver.message}</strong>
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
            {phase === 'loading' || waitingForFlop
              ? 'Dealing the flop…'
              : acting?.position === hand.hero
                ? 'No chart for this spot, you fold…'
                : acting
                  ? `${POSITION_LABELS[acting.position]} is thinking…`
                  : ''}
          </div>
        )}
      </section>

      {verdict && verdict.prompt.street === 'preflop' && preflopWeights && (
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

      {verdict && verdict.prompt.street === 'flop' && verdict.prompt.flopNode && (
        <section className="card">
          <div className="range-card__head">
            <div className="range-card__title">
              <h2>Flop strategy</h2>
              <span>{verdict.prompt.title}</span>
            </div>
          </div>
          <StrategyGrid node={verdict.prompt.flopNode} highlight={hero.hand.label} labels={verdict.prompt.options.map((o) => o.label)} />
          {flop && (
            <div className="notes">
              <p>
                Solved with TexasSolver, single 33% flop bet, 50% raises and all-in. Exploitability {flop.strategy.exploitability.toFixed(1)}% of the pot. Cells
                average all suit combinations of a hand; your exact combo may differ.
              </p>
            </div>
          )}
        </section>
      )}
    </>
  )
}

/** When an opponent's hand is missing from the solved range: check if possible, otherwise fold. */
function fallbackIndex(node: FlopNode): number {
  const check = node.actions.findIndex((a) => a.a === 'X')
  if (check >= 0) return check
  const fold = node.actions.findIndex((a) => a.a === 'F')
  return fold >= 0 ? fold : 0
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
  const bestLabel = prompt.options[best].label
  return (
    <>
      <div className={`actions${prompt.options.length > 3 ? ' actions--wrap' : ''}`} role="group" aria-label="Chart frequencies">
        {prompt.options.map((o, i) => {
          const classes = ['action-btn', `action-btn--${o.kind}`]
          if (i === guess) classes.push('action-btn--chosen')
          if (i === best) classes.push('action-btn--best')
          if (i !== guess && i !== best) classes.push('action-btn--dim')
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
          {result === 'correct' ? `${bestLabel} is the chart's move` : `The chart ${mostly ? 'mostly ' : ''}plays ${bestLabel.toLowerCase()}`}
          {result !== 'correct' && mostly ? ` (${prompt.probs[best]}%)` : ''}.{handOver ? ` ${handOver}` : ''}
        </span>
        <button type="button" className="btn btn--primary verdict__next" onClick={onProceed} autoFocus>
          {handOver ? 'Next hand' : 'Continue'}
        </button>
      </div>
    </>
  )
}
