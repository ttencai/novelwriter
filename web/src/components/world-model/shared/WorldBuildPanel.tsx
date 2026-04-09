import '@/lib/uiMessagePacks/novel'
import { NovelCopilotCard } from '@/components/novel-copilot/NovelCopilotCard'
import { NovelCopilotDrawer } from '@/components/novel-copilot/NovelCopilotDrawer'
import { useOptionalNovelCopilot } from '@/components/novel-copilot/NovelCopilotContext'
import {
  NovelCopilotProvider,
} from '@/components/novel-copilot/NovelCopilotProvider'
import { NovelAssistantChatPanel } from '@/components/novel-chat/NovelAssistantChatPanel'
import { useOptionalNovelAssistantChat } from '@/components/novel-chat/NovelAssistantChatContext'
import { NovelAssistantChatProvider } from '@/components/novel-chat/NovelAssistantChatProvider'
import { useOptionalNovelShell } from '@/components/novel-shell/NovelShellContext'
import { ToastProvider } from '@/components/world-model/shared/Toast'
import { useUiLocale } from '@/contexts/UiLocaleContext'

export function WorldBuildPanel({
  novelId,
  className,
  variant = 'default',
  showAssistantChat = false,
}: {
  novelId: number
  className?: string
  variant?: 'default' | 'compact'
  showAssistantChat?: boolean
}) {
  const copilot = useOptionalNovelCopilot()
  const assistantChat = useOptionalNovelAssistantChat()
  const shell = useOptionalNovelShell()
  const { locale } = useUiLocale()

  const renderAssistantChat = () => (showAssistantChat ? <NovelAssistantChatPanel className="mt-3" /> : null)

  if (copilot && assistantChat) {
    return (
      <div className={className}>
        <NovelCopilotCard novelId={novelId} variant={variant} />
        {renderAssistantChat()}
      </div>
    )
  }

  return (
    <ToastProvider>
      <NovelCopilotProvider
        key={`${novelId}:${locale}`}
        novelId={novelId}
        interactionLocale={locale}
      >
        <NovelAssistantChatProvider
          key={`assistant-chat:${novelId}:${locale}`}
          novelId={novelId}
          interactionLocale={locale}
          routeState={shell?.routeState}
        >
          <div className={className}>
            <NovelCopilotCard novelId={novelId} variant={variant} />
            {renderAssistantChat()}
          </div>
          <NovelCopilotDrawer novelId={novelId} />
        </NovelAssistantChatProvider>
      </NovelCopilotProvider>
    </ToastProvider>
  )
}
