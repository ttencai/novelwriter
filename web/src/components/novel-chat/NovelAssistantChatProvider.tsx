import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import {
  getDefaultCopilotInteractionLocale,
  normalizeCopilotInteractionLocale,
} from '@/types/copilot'
import { useNovelCopilotRuns, useNovelCopilotRunsState } from '@/hooks/novel-copilot/useNovelCopilotRuns'
import { useNovelCopilotSessionsState } from '@/hooks/novel-copilot/useNovelCopilotSessions'
import type { NovelShellRouteState } from '@/components/novel-shell/NovelShellRouteState'
import { buildAssistantChatLaunchArgs } from '@/components/novel-copilot/novelCopilotLauncher'
import { translateUiMessage } from '@/lib/uiMessages'
import { NovelAssistantChatContext } from './NovelAssistantChatContext'
import { buildAssistantChatSessionKey } from './assistantChatSessionKey'

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
  const hasAutoInitializedRef = useRef(false)
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
    if (!autoInitialize || novelId == null || sessionsState.focusedSessionId || hasAutoInitializedRef.current) return
    hasAutoInitializedRef.current = true
    const [prefill] = buildAssistantChatLaunchArgs()
    sessionsState.openDrawer(prefill, {
      displayTitle: translateUiMessage(effectiveInteractionLocale, 'copilot.chat.sessionTitle'),
      sessionKey: buildAssistantChatSessionKey(),
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
