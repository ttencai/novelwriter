import type { PostcheckWarning } from '@/types/api'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object'
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asMessageParams(value: unknown, term: string): Record<string, string | number | boolean | null> {
  if (!isRecord(value)) return { term }
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
  if (!('term' in out)) out.term = term
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
