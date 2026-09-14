import type { RangeEntry } from '@/data/types'
import { parseRangeEntries } from './rangeEntries'

export const USER_RANGES_KEY = 'open-range-viewer:user-ranges'

export function loadUserRangesText(): string {
  try {
    return window.localStorage.getItem(USER_RANGES_KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveUserRangesText(text: string): void {
  try {
    window.localStorage.setItem(USER_RANGES_KEY, text)
  } catch {
    // Storage unavailable (private mode etc.) – the in-memory copy still works.
  }
}

/** Parse and validate a JSON array of RangeEntry objects. Throws a readable error. */
export function parseUserRanges(text: string): RangeEntry[] {
  return parseRangeEntries(text)
}
