'use client'

import { useState } from 'react'
import type { RangeEntry } from '@/data/types'
import { PLAYER_COUNTS } from '@/lib/positions'
import {
  FORMAT_LABELS,
  FORMATS,
  hasOpenSizeChoice,
  OPEN_SIZES,
  RANGE_TYPE_DESCRIPTIONS,
  RANGE_TYPE_LABELS,
  rangeTypeOptions,
  stackOptions,
  type Format,
  type RangeType,
} from '@/lib/scenarios'
import { THEMES, THEME_SWATCHES, type Theme } from '@/lib/theme'
import type { Source, ViewerState } from '@/lib/viewerState'
import { Segmented } from './Segmented'
import { UserRangesEditor } from './UserRangesEditor'

interface Props {
  state: ViewerState
  onChange: (patch: Partial<ViewerState>) => void
  theme: Theme
  onTheme: (theme: Theme) => void
  userRangesText: string
  onUserRangesText: (text: string) => void
  /** The currently loaded built-in set, offered as a starting point for user ranges. */
  template: RangeEntry[] | null
}

export function SetupPanel({ state, onChange, theme, onTheme, userRangesText, onUserRangesText, template }: Props) {
  const [open, setOpen] = useState(false)
  const description = RANGE_TYPE_DESCRIPTIONS[state.rangeType]
  const stacks = stackOptions(state.format)

  return (
    <div className="card" style={{ padding: 0 }}>
      <button type="button" className="setup-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="setup-toggle__left">
          <SlidersIcon />
          Customize setup
        </span>
        <span aria-hidden>{open ? '︿' : '﹀'}</span>
      </button>

      {open && (
        <div className="setup-body">
          <div className="setup-section">RANGE SOURCE</div>
          <div className="subcard">
            <div className="field">
              <div className="field__label">Source</div>
              <Segmented<Source>
                ariaLabel="Range source"
                options={[
                  { value: 'builtin', label: 'Built-in' },
                  { value: 'user', label: 'Your ranges' },
                ]}
                value={state.source}
                onChange={(source) => onChange({ source })}
              />
            </div>
          </div>
          {state.source === 'user' && <UserRangesEditor text={userRangesText} onSave={onUserRangesText} template={template} />}

          <div className="setup-section">GAME SETUP</div>
          <div className="subcard">
            <div className="field">
              <div className="field__label">
                Format
                <span
                  className="info"
                  title="Cash sets are 100bb deep without antes. MTT sets assume a big blind ante and come in five stack depths."
                >
                  i
                </span>
              </div>
              <Segmented<Format>
                ariaLabel="Format"
                options={FORMATS.map((f) => ({ value: f, label: FORMAT_LABELS[f] }))}
                value={state.format}
                onChange={(format) => onChange({ format })}
              />
            </div>
          </div>
          <div className="subcard">
            <div className="field">
              <div className="field__label">Players</div>
              <Segmented<number>
                ariaLabel="Players"
                options={PLAYER_COUNTS.map((p) => ({ value: p, label: String(p) }))}
                value={state.players}
                onChange={(players) => onChange({ players: players as ViewerState['players'] })}
              />
            </div>
          </div>
          <div className="subcard">
            <div className="field">
              <div className="field__label">
                Stack
                {stacks.length === 1 && (
                  <span className="info" title="Cash charts are only available at 100bb. Switch to MTT for shorter stacks.">
                    i
                  </span>
                )}
              </div>
              <Segmented<number>
                ariaLabel="Stack"
                options={stacks.map((s) => ({ value: s, label: `${s} bb` }))}
                value={state.stack}
                onChange={(stack) => onChange({ stack: stack as ViewerState['stack'] })}
              />
            </div>
          </div>
          <div className="subcard">
            <div className="field">
              <div className="field__label">
                Range Type
                <span className="info" title="How mixed solver strategies are simplified into a chart. Simple and Pro exist for cash only.">
                  i
                </span>
              </div>
              <Segmented<RangeType>
                ariaLabel="Range type"
                options={rangeTypeOptions(state.format).map((t) => ({ value: t, label: RANGE_TYPE_LABELS[t] }))}
                value={state.rangeType}
                onChange={(rangeType) => onChange({ rangeType })}
              />
              <div className="callout">
                <strong>{description.lead}</strong> {description.text}
              </div>
            </div>
          </div>
          {hasOpenSizeChoice(state) && (
            <div className="subcard">
              <div className="field">
                <div className="field__label">
                  Open size
                  <span className="info" title="The cash GTO sets were solved for three raise-first-in sizes. The small blind opens 0.5bb larger.">
                    i
                  </span>
                </div>
                <Segmented<number>
                  ariaLabel="Open size"
                  options={OPEN_SIZES.map((s) => ({ value: s, label: `${s} bb` }))}
                  value={state.openSize}
                  onChange={(openSize) => onChange({ openSize: openSize as ViewerState['openSize'] })}
                />
              </div>
            </div>
          )}

          <div className="setup-section">THEME</div>
          <div className="theme-picker">
            <div className="theme-picker__box">
              <div className="theme-picker__title">Select theme</div>
              <div className="theme-picker__row">
                {THEMES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`theme-swatch${t === theme ? ' theme-swatch--active' : ''}`}
                    onClick={() => onTheme(t)}
                    aria-label={`${t} theme`}
                    aria-pressed={t === theme}
                  >
                    <span style={{ background: THEME_SWATCHES[t].raise }} />
                    <span style={{ background: THEME_SWATCHES[t].call }} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SlidersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
      <circle cx="9" cy="7" r="2" fill="var(--card)" />
      <circle cx="15" cy="12" r="2" fill="var(--card)" />
      <circle cx="7" cy="17" r="2" fill="var(--card)" />
    </svg>
  )
}
