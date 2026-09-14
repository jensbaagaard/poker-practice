'use client'

export interface SegmentedOption<T extends string | number> {
  value: T
  label: string
  disabled?: boolean
}

interface Props<T extends string | number> {
  options: SegmentedOption<T>[]
  value: T | undefined
  onChange: (value: T) => void
  mini?: boolean
  ariaLabel?: string
}

export function Segmented<T extends string | number>({ options, value, onChange, mini, ariaLabel }: Props<T>) {
  return (
    <div className={`segmented${mini ? ' segmented--mini' : ''}`} role="radiogroup" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          role="radio"
          aria-checked={opt.value === value}
          disabled={opt.disabled}
          className={`segmented__btn${opt.value === value ? ' segmented__btn--active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
