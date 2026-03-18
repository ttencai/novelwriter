import type { PostcheckWarning, ProseWarning } from '@/types/api'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object'
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asMessageParams(value: unknown, fallbackKey?: string): Record<string, string | number | boolean | null> {
  const defaults: Record<string, string | number | boolean | null> = fallbackKey ? { term: fallbackKey } : {}
  if (!isRecord(value)) return defaults
  const out: Record<string, string | number | boolean | null> = {}
  for (const [key, raw] of Object.entries(value)) {
    if (
      raw == null ||
      typeof raw === 'string' ||
      typeof raw === 'number' ||
      typeof raw === 'boolean'
    ) {
      out[key] = raw ?? null
    }
  }
  if (fallbackKey && !('term' in out)) out.term = fallbackKey
  return out
}

export function normalizePostcheckWarning(value: unknown): PostcheckWarning | null {
  if (!isRecord(value)) return null
  const code = asNullableString(value.code)
  const term = asNullableString(value.term)
  if (!code || !term) return null

  return {
    code,
    term,
    message: asNullableString(value.message) ?? '',
    message_key: asNullableString(value.message_key) ?? `continuation.postcheck.warning.${code}`,
    message_params: asMessageParams(value.message_params, term),
    version: asNullableNumber(value.version),
    evidence: asNullableString(value.evidence),
  }
}

export function normalizeProseWarning(value: unknown): ProseWarning | null {
  if (!isRecord(value)) return null
  const code = asNullableString(value.code)
  if (!code) return null

  return {
    code,
    message: asNullableString(value.message) ?? '',
    message_key: asNullableString(value.message_key) ?? `continuation.prosecheck.warning.${code}`,
    message_params: asMessageParams(value.message_params),
    version: asNullableNumber(value.version),
    evidence: asNullableString(value.evidence),
  }
}
