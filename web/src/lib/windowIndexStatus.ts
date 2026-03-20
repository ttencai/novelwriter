import type { WindowIndexState } from '@/types/api'
import { readDocumentUiLocale } from '@/lib/uiLocale'
import { translateUiMessage, type UiLocale } from '@/lib/uiMessages'

export interface WindowIndexStatusMeta {
  text: string
  tone: 'muted' | 'success' | 'warning'
  requiresFallback: boolean
}

const ACTIVE_JOB_STATUSES = new Set(['queued', 'running'])

function localeOrDefault(locale?: UiLocale): UiLocale {
  return locale ?? readDocumentUiLocale() ?? 'zh'
}

export function isWindowIndexRebuilding(state: WindowIndexState | null | undefined): boolean {
  return Boolean(state?.job && ACTIVE_JOB_STATUSES.has(state.job.status))
}

export function getWindowIndexBootstrapStatusMeta(
  state: WindowIndexState | null | undefined,
  locale?: UiLocale,
): WindowIndexStatusMeta {
  const effectiveLocale = localeOrDefault(locale)
  if (!state) {
    return {
      text: translateUiMessage(effectiveLocale, 'worldModel.windowIndex.bootstrap.preparingContent'),
      tone: 'muted',
      requiresFallback: false,
    }
  }
  if (isWindowIndexRebuilding(state) && state.status !== 'fresh') {
    return {
      text: translateUiMessage(effectiveLocale, 'worldModel.windowIndex.bootstrap.organizingChapters'),
      tone: 'muted',
      requiresFallback: true,
    }
  }
  switch (state.status) {
    case 'fresh':
      return {
        text: translateUiMessage(effectiveLocale, 'worldModel.windowIndex.bootstrap.ready'),
        tone: 'success',
        requiresFallback: false,
      }
    case 'stale':
      return {
        text: translateUiMessage(effectiveLocale, 'worldModel.windowIndex.bootstrap.pendingSync'),
        tone: 'warning',
        requiresFallback: true,
      }
    case 'missing':
      return {
        text: translateUiMessage(effectiveLocale, 'worldModel.windowIndex.bootstrap.missing'),
        tone: 'warning',
        requiresFallback: true,
      }
    case 'failed':
      return {
        text: translateUiMessage(effectiveLocale, 'worldModel.windowIndex.bootstrap.failed'),
        tone: 'warning',
        requiresFallback: true,
      }
  }
}

export function getWindowIndexCopilotStatusMeta(
  state: WindowIndexState | null | undefined,
  locale?: UiLocale,
): WindowIndexStatusMeta {
  const effectiveLocale = localeOrDefault(locale)
  if (!state) {
    return {
      text: translateUiMessage(effectiveLocale, 'worldModel.windowIndex.copilot.preparingContent'),
      tone: 'muted',
      requiresFallback: false,
    }
  }
  if (isWindowIndexRebuilding(state) && state.status !== 'fresh') {
    return {
      text: translateUiMessage(effectiveLocale, 'worldModel.windowIndex.copilot.organizingContent'),
      tone: 'muted',
      requiresFallback: true,
    }
  }
  switch (state.status) {
    case 'fresh':
      return {
        text: translateUiMessage(effectiveLocale, 'worldModel.windowIndex.copilot.ready'),
        tone: 'success',
        requiresFallback: false,
      }
    case 'stale':
      return {
        text: translateUiMessage(effectiveLocale, 'worldModel.windowIndex.copilot.pendingSync'),
        tone: 'warning',
        requiresFallback: true,
      }
    case 'missing':
      return {
        text: translateUiMessage(effectiveLocale, 'worldModel.windowIndex.copilot.missing'),
        tone: 'warning',
        requiresFallback: true,
      }
    case 'failed':
      return {
        text: translateUiMessage(effectiveLocale, 'worldModel.windowIndex.copilot.failed'),
        tone: 'warning',
        requiresFallback: true,
      }
  }
}
