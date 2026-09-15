'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { RangeEntry } from '@/data/types'
import { DEFAULT_GAME_MODE, GAME_MODE_INFO, GAME_MODES, isGameMode, type GameMode } from '@/lib/gameModes'
import type { TrainerSetup } from '@/lib/preflopGuess'
import { loadRangeSet, rangeSetFor, rangeSetLabel } from '@/lib/rangeSets'
import { loadTheme } from '@/lib/theme'
import { fromSearchParams, normalize, toSetupSearchParams, DEFAULT_STATE } from '@/lib/viewerState'
import { isPosition, positionsFor } from '@/lib/positions'
import { HandTrainer } from './HandTrainer'
import { Segmented } from './Segmented'
import { TopNav } from './TopNav'
import { TrainerSetupPanel } from './TrainerSetupPanel'

interface LoadedSet {
  id: string
  entries: RangeEntry[]
}

function pickSetup(params: URLSearchParams, seat?: string | null): TrainerSetup {
  const { format, stack, rangeType, openSize, players } = fromSearchParams(params)
  const wanted = seat ?? params.get('seat')
  return { format, stack, rangeType, openSize, players, seat: isPosition(wanted) && positionsFor(players).includes(wanted) ? wanted : undefined }
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

  useEffect(() => {
    document.documentElement.dataset.theme = loadTheme()
  }, [])

  const setupParams = useMemo(() => {
    const params = toSetupSearchParams(setup)
    if (setup.seat) params.set('seat', setup.seat)
    return params
  }, [setup])

  useEffect(() => {
    const params = new URLSearchParams(setupParams)
    if (mode !== DEFAULT_GAME_MODE) params.set('mode', mode)
    const next = `?${params.toString()}`
    if (window.location.search !== next) window.history.replaceState(null, '', next)
  }, [mode, setupParams])

  const set = rangeSetFor(setup)
  const setId = set?.id

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
      return pickSetup(toSetupSearchParams(normalize({ ...DEFAULT_STATE, ...merged })), merged.seat ?? '')
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
      ) : entries ? (
        <HandTrainer key={setId} entries={entries} setup={setup} />
      ) : (
        <section className="card">
          <div className="empty">Loading charts…</div>
        </section>
      )}

      <TrainerSetupPanel setup={setup} onChange={updateSetup} />

      <footer className="footer">
        {GAME_MODE_INFO[mode].description}
        <br />
        Answers are graded against the {setLabel} charts.
      </footer>
    </main>
  )
}
