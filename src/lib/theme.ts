export const THEMES = ['classic', 'cool'] as const
export type Theme = (typeof THEMES)[number]

export const THEME_SWATCHES: Record<Theme, { raise: string; call: string }> = {
  classic: { raise: '#ef6f6f', call: '#4fd06a' },
  cool: { raise: '#a6c8f7', call: '#f7f2a4' },
}

const THEME_KEY = 'open-range-viewer:theme'

export function loadTheme(): Theme {
  try {
    const value = window.localStorage.getItem(THEME_KEY)
    return value === 'cool' ? 'cool' : 'classic'
  } catch {
    return 'classic'
  }
}

export function saveTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_KEY, theme)
  } catch {
    // ignore
  }
}
