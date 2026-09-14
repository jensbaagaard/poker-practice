'use client'

import { useRef, useState } from 'react'
import type { RangeEntry } from '@/data/types'
import { parseUserRanges } from '@/lib/userRanges'

interface Props {
  text: string
  onSave: (text: string) => void
  /** The currently loaded built-in set, or null while it loads. */
  template: RangeEntry[] | null
}

export function UserRangesEditor({ text, onSave, template }: Props) {
  const [draft, setDraft] = useState(text)
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  async function loadFile(file: File | undefined) {
    if (!file) return
    const text = await file.text()
    setDraft(text)
    try {
      const entries = parseUserRanges(text)
      onSave(text)
      setStatus({ kind: 'ok', message: `Loaded and saved ${entries.length} ranges from ${file.name}.` })
    } catch (err) {
      setStatus({ kind: 'error', message: (err as Error).message })
    }
  }

  function save() {
    try {
      const entries = parseUserRanges(draft)
      onSave(draft)
      setStatus({ kind: 'ok', message: `Saved ${entries.length} range${entries.length === 1 ? '' : 's'} in this browser.` })
    } catch (err) {
      setStatus({ kind: 'error', message: (err as Error).message })
    }
  }

  function loadTemplate() {
    if (!template) return
    setDraft(JSON.stringify(template, null, 2))
    setStatus(null)
  }

  return (
    <div className="subcard editor">
      <p className="editor__help">
        Paste a JSON array of range entries. Each entry names a <code>scenario</code>, the <code>hero</code> seats (and{' '}
        <code>villain</code> seats when facing a bet) and a <code>range</code> with <code>raise</code> and <code>call</code>{' '}
        strings such as <code>&quot;22+, A2s+, KTs+, A5s:0.5&quot;</code>. Ranges are stored only in this browser.
      </p>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        spellCheck={false}
        placeholder='[{"id": "my-btn-open", "scenario": "open", "hero": ["BTN"], "range": {"raise": "22+, A2s+, K5s+"}}]'
        aria-label="Your ranges as JSON"
      />
      <div className="editor__actions">
        <button type="button" className="btn btn--primary" onClick={save}>
          Save ranges
        </button>
        <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
          Load from file
        </button>
        <button type="button" className="btn" onClick={loadTemplate} disabled={!template}>
          Load current built-in set as template
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            void loadFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>
      {status && <div className={`editor__status editor__status--${status.kind}`}>{status.message}</div>}
    </div>
  )
}
