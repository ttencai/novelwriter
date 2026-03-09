const KEY_PREFIX = 'novwr_postcheck_whitelist_'

function storageKey(novelId: number): string | null {
  if (!Number.isFinite(novelId) || novelId <= 0) return null
  return `${KEY_PREFIX}${novelId}`
}

export function getWhitelist(novelId: number): string[] {
  try {
    const key = storageKey(novelId)
    if (!key) return []
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((v): v is string => typeof v === 'string')
  } catch {
    return []
  }
}

export function addToWhitelist(novelId: number, term: string): void {
  try {
    const key = storageKey(novelId)
    if (!key) return
    const current = getWhitelist(novelId)
    if (current.includes(term)) return
    localStorage.setItem(key, JSON.stringify([...current, term]))
  } catch {
    // ignore
  }
}
