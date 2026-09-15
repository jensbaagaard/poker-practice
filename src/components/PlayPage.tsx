'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { RangeEntry } from '@/data/types'
import { DEFAULT_GAME_MODE, GAME_MODE_INFO, GAME_MODES, isGameMode, type GameMode } from '@/lib/gameModes'
import type { TrainerSetup } from '@/lib/trainer'
import { loadRangeSet, rangeSetFor, rangeSetLabel } from '@/lib/rangeSets'
import { loadTheme } from '@/lib/theme'
import { fromSearchParams, normalize, toSetupSearchParams, DEFAULT_STATE } from '@/lib/viewerState'
import { isPosition, positionsFor } from '@/lib/positions'
import { loadHandIndex, type HandIndex } from '@/lib/fullHands'
import { FullHandTrainer } from './FullHandTrainer'
import { HandTrainer } from './HandTrainer'
import { Segmented } from './Segmented'
import { TopNav } from './TopNav'
import { TrainerSetupPanel } from './TrainerSetupPanel'

interface LoadedSet {
  id: string
  entries: RangeEntry[]
}

const FULL_HANDS_SETUP: TrainerSetup = { format: 'cash', stack: 100, rangeType: 'pto', openSize: 2.5, players: 6 }

/** Setup from URL parameters, reusing the viewer's parsing and normalisation of the chart-set fields. */
function pickSetup(params: URLSearchParams): TrainerSetup {
  const { format, stack, rangeType, openSize, players } = fromSearchParams(params)
  const seat = params.get('seat')
  return { format, stack, rangeType, openSize, players, seat: isPosition(seat) && positionsFor(players).includes(seat) ? seat : undefined }
}

function setupParamsOf(setup: TrainerSetup): URLSearchParams {
  const params = toSetupSearchParams(setup)
  if (setup.seat) params.set('seat', setup.seat)
  return params
}

export function PlayPage() {
  const searchParams = useSearchParams()
  const [mode, setMode] = useState<GameMode>(() => {
    const value = searchParams.get('mode')
    return isGameMode(value) ? value : DEFAULT_GAME_MODE
  })
  const [setup, setSetup] = useState<TrainerSetup>(() => pickSetup(new URLSearchParams(searchParams.toString())))
  const [loaded, setLoaded] = useState<LoadedSet | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [handIndex, setHandIndex] = useState<HandIndex | null>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = loadTheme()
  }, [])

  const setupParams = useMemo(() => setupParamsOf(setup), [setup])

  useEffect(() => {
    const params = new URLSearchParams(setupParams)
    if (mode !== DEFAULT_GAME_MODE) params.set('mode', mode)
    const next = `?${params.toString()}`
    if (window.location.search !== next) window.history.replaceState(null, '', next)
  }, [mode, setupParams])

  // Full hands are generated from the Cash 100bb PTO charts, so that set is fixed in that mode.
  const fullHands = mode === 'full-hands'
  const effectiveSetup: TrainerSetup = fullHands ? { ...FULL_HANDS_SETUP, seat: setup.seat } : setup
  const set = rangeSetFor(effectiveSetup)
  const setId = set?.id

  useEffect(() => {
    if (!fullHands || handIndex) return
    let cancelled = false
    loadHandIndex().then((idx) => {
      if (!cancelled) setHandIndex(idx)
    })
    return () => {
      cancelled = true
    }
  }, [fullHands, handIndex])

  useEffect(() => {
    if (!setId) return
    let cancelled = false
    setLoadError(null)
    loadRangeSet(setId)
      .then((entries) => {
        if (!cancelled) setLoaded({ id: setId, entries })
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [setId])

  function updateSetup(patch: Partial<TrainerSetup>) {
    setSetup((prev) => {
      const merged = { ...prev, ...patch }
      return pickSetup(setupParamsOf({ ...normalize({ ...DEFAULT_STATE, ...merged }), seat: merged.seat }))
    })
  }

  const entries = loaded && loaded.id === setId ? loaded.entries : null
  const setLabel = set ? rangeSetLabel(set) : ''

  return (
    <main className="page">
      <TopNav active="play" setupParams={setupParams} />

      {GAME_MODES.length > 1 && (
        <section className="card">
          <div className="field">
            <div className="field__label">Game mode</div>
            <Segmented<GameMode>
              ariaLabel="Game mode"
              options={GAME_MODES.map((m) => ({ value: m, label: GAME_MODE_INFO[m].label }))}
              value={mode}
              onChange={setMode}
            />
          </div>
        </section>
      )}

      {loadError ? (
        <section className="card">
          <div className="empty">Could not load the built-in charts. {loadError}</div>
        </section>
      ) : entries && fullHands ? (
        handIndex ? (
          <FullHandTrainer key={`${setId}-${setup.seat ?? 'any'}`} entries={entries} setup={effectiveSetup} index={handIndex} />
        ) : (
          <section className="card">
            <div className="empty">Loading hands…</div>
          </section>
        )
      ) : entries ? (
        <HandTrainer key={setId} entries={entries} setup={setup} />
      ) : (
        <section className="card">
          <div className="empty">Loading charts…</div>
        </section>
      )}

      <TrainerSetupPanel setup={effectiveSetup} onChange={updateSetup} seatOnly={fullHands} />

      <footer className="footer">
        {GAME_MODE_INFO[mode].description}
        <br />
        Answers are graded against the {setLabel} charts.
      </footer>
    </main>
  )
}
