import type { LegacySystemDisplayType } from '@/types/api'
import { readDocumentUiLocale } from '@/lib/uiLocale'
import { translateUiMessage, type UiLocale } from '@/lib/uiMessages'

export function isLegacyGraphDisplayType(displayType: string): displayType is Extract<LegacySystemDisplayType, 'graph'> {
  return displayType === 'graph'
}

export function getSystemDisplayTypeLabel(displayType: string, locale?: UiLocale): string {
  const effectiveLocale = locale ?? readDocumentUiLocale() ?? 'zh'
  switch (displayType) {
    case 'hierarchy':
      return translateUiMessage(effectiveLocale, 'worldModel.system.display.hierarchy')
    case 'timeline':
      return translateUiMessage(effectiveLocale, 'worldModel.system.display.timeline')
    case 'list':
      return translateUiMessage(effectiveLocale, 'worldModel.system.display.list')
    case 'graph':
      return translateUiMessage(effectiveLocale, 'worldModel.system.display.graph')
    default:
      return displayType || 'unknown'
  }
}
