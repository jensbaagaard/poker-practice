'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { RangeEntry } from '@/data/types'
import type { Hand } from '@/lib/hands'
import { POSITION_LABELS, type Position } from '@/lib/positions'
import { actionTotals, resolveActions } from '@/lib/range'
import { loadRangeSet, rangeSetFor, rangeSetLabel } from '@/lib/rangeSets'
import { resolveRange } from '@/lib/resolve'
import {
  headline,
  heroOptions,
  SCENARIO_LABELS,
  SCENARIO_SHAPE,
  SCENARIOS,
  tableBets,
  villainOptions,
  type RangeType,
  type Scenario,
} from '@/lib/scenarios'
import { loadTheme, saveTheme, type Theme } from '@/lib/theme'
import { loadUserRangesText, parseUserRanges, saveUserRangesText } from '@/lib/userRanges'
import { fromSearchParams, normalize, toSearchParams, toSetupSearchParams, type ViewerState } from '@/lib/viewerState'
import { Legend } from './Legend'
import { RangeGrid } from './RangeGrid'
import { Segmented } from './Segmented'
import { SetupPanel } from './SetupPanel'
import { TableDiagram } from './TableDiagram'
import { TopNav } from './TopNav'

interface LoadedSet {
  id: string
  entries: RangeEntry[]
}

export function RangeViewer() {
  const searchParams = useSearchParams()
  const [state, setState] = useState<ViewerState>(() => fromSearchParams(new URLSearchParams(searchParams.toString())))
  const [theme, setTheme] = useState<Theme>('classic')
  const [userRangesText, setUserRangesText] = useState('')
  const [hovered, setHovered] = useState<Hand | null>(null)
  const [loaded, setLoaded] = useState<LoadedSet | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    setTheme(loadTheme())
    setUserRangesText(loadUserRangesText())
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    const next = `?${toSearchParams(state).toString()}`
    if (window.location.search !== next) window.history.replaceState(null, '', next)
  }, [state])

  const set = rangeSetFor(state)
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

  const userRanges = useMemo<RangeEntry[]>(() => {
    try {
      return parseUserRanges(userRangesText)
    } catch {
      return []
    }
  }, [userRangesText])

  const builtinEntries = loaded && loaded.id === setId ? loaded.entries : null
  const entries = state.source === 'user' ? userRanges : builtinEntries
  const resolved = useMemo(() => (entries ? resolveRange(entries, state) : null), [entries, state])
  const weights = useMemo(() => (resolved ? resolveActions(resolved.entry.range) : null), [resolved])
  const totals = useMemo(() => (weights ? actionTotals(weights) : null), [weights])
  const availableScenarios = useMemo(() => new Set(entries?.map((e) => e.scenario)), [entries])

  const heroes = heroOptions(state.scenario, state.players)
  const villains = villainOptions(state.scenario, state.players, state.hero)
  const head = headline(state.scenario, state, state.hero, state.villain)
  const bets = tableBets(state.scenario, state, state.hero, state.villain)
  const setLabel = set ? rangeSetLabel(set) : 'Built-in'
  const subtitle = [head.subtitle, state.source === 'builtin' ? setLabel : 'Your ranges'].filter(Boolean).join(' · ')

  function update(patch: Partial<ViewerState>) {
    setState((prev) => normalize({ ...prev, ...patch }))
  }

  function changeTheme(next: Theme) {
    setTheme(next)
    saveTheme(next)
  }

  function changeUserRanges(text: string) {
    setUserRangesText(text)
    saveUserRangesText(text)
  }

  const hoveredWeights = hovered && weights ? weights.get(hovered.label) : undefined

  let emptyMessage: string
  if (state.source === 'user') {
    emptyMessage = 'No chart in your ranges covers this spot. Add an entry in Customize setup → Your ranges.'
  } else if (loadError) {
    emptyMessage = `Could not load the built-in charts. ${loadError}`
  } else if (!entries) {
    emptyMessage = 'Loading charts…'
  } else {
    emptyMessage = `The ${setLabel} set has no chart for this spot.`
  }

  return (
    <main className="page">
      <TopNav active="viewer" setupParams={toSetupSearchParams(state)} />

      <section className="card range-card">
        <div className="range-card__head">
          <div className="range-card__title">
            <h2>{head.title}</h2>
            {subtitle && <span>{subtitle}</span>}
          </div>
          <Segmented<RangeType>
            mini
            ariaLabel="Quick range type"
            options={[
              { value: 'pto', label: 'PTO' },
              { value: 'gto', label: 'GTO' },
            ]}
            value={state.rangeType}
            onChange={(rangeType) => update({ rangeType })}
          />
        </div>

        {weights && totals ? (
          <>
            <RangeGrid weights={weights} onHover={setHovered} />
            <Legend totals={totals} />
            <div className="hover-info" aria-live="polite">
              {hovered && hoveredWeights ? (
                <>
                  <strong>{hovered.label}</strong> · raise {Math.round(hoveredWeights.raise * 100)}% · call{' '}
                  {Math.round(hoveredWeights.call * 100)}% · fold {Math.round(hoveredWeights.fold * 100)}%
                </>
              ) : (
                'Hover a hand for details'
              )}
            </div>
          </>
        ) : (
          <div className="empty" aria-live="polite">
            {emptyMessage}
          </div>
        )}

        {resolved && resolved.notes.length > 0 && (
          <div className="notes">
            {resolved.notes.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <div className="field">
          <div className="field__label">Scenario</div>
          <Segmented<Scenario>
            ariaLabel="Scenario"
            options={SCENARIOS.map((s) => ({
              value: s,
              label: SCENARIO_LABELS[s],
              disabled: entries !== null && !availableScenarios.has(s),
            }))}
            value={state.scenario}
            onChange={(scenario) => update({ scenario })}
          />
        </div>
      </section>

      <section className="card">
        <div className="field">
          <div className="field__label">Hero position</div>
          <Segmented<Position>
            ariaLabel="Hero position"
            options={heroes.map((p) => ({ value: p, label: POSITION_LABELS[p] }))}
            value={state.hero}
            onChange={(hero) => update({ hero })}
          />
        </div>
      </section>

      {SCENARIO_SHAPE[state.scenario].needsVillain && (
        <section className="card">
          <div className="field">
            <div className="field__label">Villain position</div>
            <Segmented<Position>
              ariaLabel="Villain position"
              options={villains.map((p) => ({ value: p, label: POSITION_LABELS[p] }))}
              value={state.villain}
              onChange={(villain) => update({ villain })}
            />
          </div>
        </section>
      )}

      <TableDiagram players={state.players} hero={state.hero} villain={state.villain} bets={bets} />

      <SetupPanel
        state={state}
        onChange={update}
        theme={theme}
        onTheme={changeTheme}
        userRangesText={userRangesText}
        onUserRangesText={changeUserRanges}
        template={builtinEntries}
      />

      <footer className="footer">
        Preflop charts for study only. Frequencies in spots after the open are shown given that the hero reached that spot.
        <br />
        MIT licensed. Contributions welcome.
      </footer>
    </main>
  )
}
