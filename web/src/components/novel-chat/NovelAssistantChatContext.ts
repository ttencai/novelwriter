import { createContext, useContext } from 'react'
import type { NovelCopilotState } from '@/components/novel-copilot/NovelCopilotContext'

export type NovelAssistantChatState = NovelCopilotState

export const NovelAssistantChatContext = createContext<NovelAssistantChatState | null>(null)

export function useNovelAssistantChat() {
  const context = useContext(NovelAssistantChatContext)
  if (!context) {
    throw new Error('useNovelAssistantChat must be used within a NovelAssistantChatProvider')
  }
  return context
}

export function useOptionalNovelAssistantChat() {
  return useContext(NovelAssistantChatContext)
}
