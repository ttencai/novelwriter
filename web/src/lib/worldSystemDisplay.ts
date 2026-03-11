import { LABELS } from '@/constants/labels'
import type { LegacySystemDisplayType } from '@/types/api'

export function isLegacyGraphDisplayType(displayType: string): displayType is Extract<LegacySystemDisplayType, 'graph'> {
  return displayType === 'graph'
}

export function getSystemDisplayTypeLabel(displayType: string): string {
  switch (displayType) {
    case 'hierarchy':
      return LABELS.SYSTEM_TYPE_HIERARCHY
    case 'timeline':
      return LABELS.SYSTEM_TYPE_TIMELINE
    case 'list':
      return LABELS.SYSTEM_TYPE_LIST
    case 'graph':
      return LABELS.SYSTEM_TYPE_GRAPH_LEGACY
    default:
      return displayType || 'unknown'
  }
}
