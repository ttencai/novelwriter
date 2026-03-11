import type { PostcheckWarning } from '@/types/api'
import { normalizePostcheckWarning } from '@/lib/postcheckWarnings'

const KEY_PREFIX = 'novwr_postcheck_active_'

function storageKey(novelId: number, chapterNumber: number): string | null {
  if (!Number.isFinite(novelId) || novelId <= 0) return null
  if (!Number.isFinite(chapterNumber) || chapterNumber <= 0) return null
  return `${KEY_PREFIX}${novelId}_${chapterNumber}`
}

/**
 * Read active warnings for a chapter.
 * When `createdAt` is provided, stored warnings whose `createdAt` doesn't match
 * are treated as stale (chapter number was reused after deletion) and discarded.
 */
export function getActiveWarnings(
  novelId: number,
  chapterNumber: number,
  createdAt?: string,
): PostcheckWarning[] {
  try {
    const key = storageKey(novelId, chapterNumber)
    if (!key) return []
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)

    // New format: { createdAt, warnings }
    if (parsed != null && typeof parsed === 'object' && !Array.isArray(parsed) && 'warnings' in parsed) {
      const stored = parsed as { createdAt?: string; warnings?: unknown }
      if (createdAt && stored.createdAt && stored.createdAt !== createdAt) {
        localStorage.removeItem(key)
        return []
      }
      if (!Array.isArray(stored.warnings)) return []
      return stored.warnings.map(normalizePostcheckWarning).filter((warning): warning is PostcheckWarning => warning != null)
    }

    // Legacy format (bare array) — can't validate freshness, discard
    if (Array.isArray(parsed)) {
      localStorage.removeItem(key)
      return []
    }

    return []
  } catch {
    return []
  }
}

export function setActiveWarnings(
  novelId: number,
  chapterNumber: number,
  warnings: PostcheckWarning[],
  createdAt?: string,
): void {
  try {
    const key = storageKey(novelId, chapterNumber)
    if (!key) return
    if (warnings.length === 0) {
      localStorage.removeItem(key)
      return
    }
    localStorage.setItem(key, JSON.stringify({ createdAt: createdAt ?? '', warnings }))
  } catch {
    // ignore
  }
}
