import type {
  CopilotContextStage,
  CopilotContextSurface,
  OpenNovelCopilotOptions,
  CopilotPrefill,
} from '@/types/copilot'
import type { NovelShellRouteState } from '@/components/novel-shell/NovelShellRouteState'
import { resolveCurrentUiLocale } from '@/lib/uiLocale'
import { translateUiMessage } from '@/lib/uiMessages'

export type NovelCopilotLaunchArgs = [
  prefill: CopilotPrefill,
  options?: OpenNovelCopilotOptions,
]

type CopilotRouteContext = Pick<NovelShellRouteState, 'surface' | 'stage' | 'worldTab'>

function buildWholeBookContext(routeState: CopilotRouteContext | null | undefined) {
  if (!routeState?.surface) return undefined

  if (routeState.surface === 'atlas') {
    const tab = routeState.worldTab ?? 'systems'
    return {
      surface: 'atlas' as const,
      tab,
    }
  }

  return {
    surface: 'studio' as const,
    stage: routeState.stage ?? 'write',
  }
}

export function buildWholeBookCopilotLaunchArgs(
  routeState?: CopilotRouteContext | null,
): NovelCopilotLaunchArgs {
  const locale = resolveCurrentUiLocale()
  return [
    {
      mode: 'research',
      scope: 'whole_book',
      context: buildWholeBookContext(routeState),
    },
    { displayTitle: translateUiMessage(locale, 'copilot.session.title.wholeBook') },
  ]
}

export function buildAssistantChatLaunchArgs(): NovelCopilotLaunchArgs {
  const locale = resolveCurrentUiLocale()
  return [
    {
      mode: 'research',
      scope: 'whole_book',
    },
    { displayTitle: translateUiMessage(locale, 'copilot.chat.sessionTitle') },
  ]
}

export function buildCurrentEntityCopilotLaunchArgs({
  entityId,
  entityName,
  surface,
  stage,
}: {
  entityId: number
  entityName?: string | null
  surface?: CopilotContextSurface
  stage?: CopilotContextStage
}): NovelCopilotLaunchArgs {
  const locale = resolveCurrentUiLocale()
  return [
    {
      mode: 'current_entity',
      scope: 'current_entity',
      context: surface === 'atlas'
        ? {
            entity_id: entityId,
            surface: 'atlas',
            tab: 'entities',
          }
        : {
            entity_id: entityId,
            ...(surface ? { surface } : {}),
            ...(stage ? { stage } : {}),
          },
    },
    { displayTitle: entityName?.trim() || translateUiMessage(locale, 'copilot.session.title.entityWithId', { id: entityId }) },
  ]
}

export function buildRelationshipResearchCopilotLaunchArgs({
  entityId,
  entityName,
  surface,
  stage,
}: {
  entityId?: number | null
  entityName?: string | null
  surface: CopilotContextSurface
  stage?: CopilotContextStage
}): NovelCopilotLaunchArgs {
  const locale = resolveCurrentUiLocale()
  const normalizedEntityId = typeof entityId === 'number' ? entityId : undefined
  const displayTitle = entityName?.trim()
    ? translateUiMessage(locale, 'copilot.session.title.relationshipWithName', { name: entityName.trim() })
    : normalizedEntityId != null
      ? translateUiMessage(locale, 'copilot.session.title.relationshipWithEntityId', { id: normalizedEntityId })
      : translateUiMessage(locale, 'copilot.session.title.relationshipContext')

  return [
    {
      mode: 'research',
      scope: 'current_tab',
      context: surface === 'atlas'
        ? {
            entity_id: normalizedEntityId,
            surface: 'atlas',
            tab: 'relationships',
          }
        : {
            entity_id: normalizedEntityId,
            surface,
            tab: 'relationships',
            ...(stage ? { stage } : {}),
          },
    },
    { displayTitle },
  ]
}

export function buildDraftCleanupCopilotLaunchArgs({
  surface,
  stage,
}: {
  surface: CopilotContextSurface
  stage?: CopilotContextStage
}): NovelCopilotLaunchArgs {
  const locale = resolveCurrentUiLocale()
  return [
    {
      mode: 'draft_cleanup',
      scope: 'current_tab',
      context: surface === 'atlas'
        ? {
            surface: 'atlas',
            tab: 'review',
          }
        : {
            surface,
            tab: 'review',
            ...(stage ? { stage } : {}),
          },
    },
    { displayTitle: translateUiMessage(locale, 'copilot.session.title.draftCleanup') },
  ]
}
