import type { LlmConfig } from '@/lib/llmConfigStore'
import { translateUiMessage, type UiLocale } from '@/lib/uiMessages'
import { ApiError } from '@/services/api'

export function getLlmConfigWarning(config: LlmConfig, locale: UiLocale = 'zh'): string | null {
  const filled = [config.baseUrl, config.apiKey, config.model].filter(Boolean).length
  if (filled === 0 || filled === 3) return null
  return translateUiMessage(locale, 'llm.warning.partialConfig')
}

export function getLlmApiErrorMessage(err: ApiError, locale: UiLocale = 'zh'): string | null {
  switch (err.code) {
    case 'llm_config_incomplete':
      return translateUiMessage(locale, 'llm.error.incompleteConfig')
    case 'ai_manually_disabled':
      return translateUiMessage(locale, 'llm.error.aiDisabled')
    case 'ai_budget_hard_stop':
      return translateUiMessage(locale, 'llm.error.budgetHardStop')
    case 'ai_budget_meter_disabled':
    case 'ai_budget_meter_unavailable':
      return translateUiMessage(locale, 'llm.error.budgetUnavailable')
    case 'world_generate_llm_unavailable':
      return translateUiMessage(locale, 'llm.error.modelUnavailable')
    default:
      return null
  }
}
