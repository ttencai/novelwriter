import { useEffect, useMemo, type ReactNode } from 'react'
import {
  getDefaultCopilotInteractionLocale,
  normalizeCopilotInteractionLocale,
} from '@/types/copilot'
import { useNovelCopilotRuns, useNovelCopilotRunsState } from '@/hooks/novel-copilot/useNovelCopilotRuns'
import { useNovelCopilotSessionsState } from '@/hooks/novel-copilot/useNovelCopilotSessions'
import type { NovelShellRouteState } from '@/components/novel-shell/NovelShellRouteState'
import { buildWholeBookCopilotLaunchArgs } from '@/components/novel-copilot/novelCopilotLauncher'
import { translateUiMessage } from '@/lib/uiMessages'
import { NovelAssistantChatContext } from './NovelAssistantChatContext'

export function NovelAssistantChatProvider({
  children,
  novelId = null,
  interactionLocale,
  routeState,
  autoInitialize = true,
}: {
  children: ReactNode
  novelId?: number | null
  interactionLocale?: string
  routeState?: Pick<NovelShellRouteState, 'surface' | 'stage' | 'worldTab'> | null
  autoInitialize?: boolean
}) {
  const effectiveInteractionLocale = normalizeCopilotInteractionLocale(
    interactionLocale ?? getDefaultCopilotInteractionLocale(),
  )
  const sessionsState = useNovelCopilotSessionsState({
    novelId,
    interactionLocale: effectiveInteractionLocale,
    entrypoint: 'assistant_chat',
  })
  const runsState = useNovelCopilotRunsState(sessionsState.sessions)
  const controllerState = useNovelCopilotRuns({
    sessions: sessionsState.sessions,
    focusedSessionId: sessionsState.focusedSessionId,
    runsBySessionId: runsState.runsBySessionId,
    setRunsBySessionId: runsState.setRunsBySessionId,
    timeoutIdsRef: runsState.timeoutIdsRef,
    resolveBackendSessionId: sessionsState.resolveBackendSessionId,
  })

  useEffect(() => {
    if (!autoInitialize || novelId == null || sessionsState.focusedSessionId) return
    const [prefill] = buildWholeBookCopilotLaunchArgs(routeState)
    sessionsState.openDrawer(prefill, {
      displayTitle: translateUiMessage(effectiveInteractionLocale, 'copilot.chat.sessionTitle'),
    })
  }, [autoInitialize, effectiveInteractionLocale, novelId, routeState, sessionsState])

  const value = useMemo(() => ({
    ...sessionsState,
    ...controllerState,
  }), [sessionsState, controllerState])

  return (
    <NovelAssistantChatContext.Provider value={value}>
      {children}
    </NovelAssistantChatContext.Provider>
  )
}
