export type ReasoningEffort = '' | 'low' | 'medium' | 'high'

export interface LlmConfig {
  baseUrl: string
  apiKey: string
  model: string
  reasoningEffort: ReasoningEffort
}

const EMPTY_CONFIG: LlmConfig = {
  baseUrl: '',
  apiKey: '',
  model: '',
  reasoningEffort: '',
}

const STORAGE_KEY = 'novwr_llm_config_v1'


function normalizeReasoningEffort(value: unknown): ReasoningEffort {
  return value === 'low' || value === 'medium' || value === 'high' ? value : ''
}

function normalize(value: Partial<LlmConfig>): LlmConfig {
  return {
    baseUrl: (value.baseUrl ?? '').trim(),
    apiKey: (value.apiKey ?? '').trim(),
    model: (value.model ?? '').trim(),
    reasoningEffort: normalizeReasoningEffort(value.reasoningEffort),
  }
}

function readStoredConfig(): LlmConfig {
  if (typeof localStorage === 'undefined') return { ...EMPTY_CONFIG }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...EMPTY_CONFIG }
    const parsed = JSON.parse(raw) as Partial<LlmConfig>
    return normalize(parsed)
  } catch {
    return { ...EMPTY_CONFIG }
  }
}

function writeStoredConfig(value: LlmConfig): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // Ignore storage errors; in-memory config still works for this tab.
  }
}

function clearStoredConfig(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore storage errors; in-memory config still clears.
  }
}

let currentConfig: LlmConfig = readStoredConfig()

export function getLlmConfig(): LlmConfig {
  return { ...currentConfig }
}

export function setLlmConfig(value: Partial<LlmConfig>): LlmConfig {
  currentConfig = normalize({ ...currentConfig, ...value })
  writeStoredConfig(currentConfig)
  return getLlmConfig()
}

export function initializeLlmConfig(value: Partial<LlmConfig>): LlmConfig {
  const defaults = normalize({ ...EMPTY_CONFIG, ...value })
  const stored = readStoredConfig()
  if (stored.baseUrl || stored.apiKey || stored.model || stored.reasoningEffort) {
    currentConfig = normalize({
      baseUrl: stored.baseUrl || defaults.baseUrl,
      apiKey: stored.apiKey || defaults.apiKey,
      model: stored.model || defaults.model,
      reasoningEffort: stored.reasoningEffort || defaults.reasoningEffort,
    })
    return getLlmConfig()
  }

  currentConfig = normalize({
    baseUrl: currentConfig.baseUrl || defaults.baseUrl,
    apiKey: currentConfig.apiKey || defaults.apiKey,
    model: currentConfig.model || defaults.model,
    reasoningEffort: currentConfig.reasoningEffort || defaults.reasoningEffort,
  })
  return getLlmConfig()
}

export function clearLlmConfig(): void {
  currentConfig = { ...EMPTY_CONFIG }
  clearStoredConfig()
}
