import type React from 'react'
import { useEffect, useState, useRef, useCallback } from 'react'
import { Bot, RotateCcw, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUiLocale } from '@/contexts/UiLocaleContext'
import { getCopilotScopeLabel } from './novelCopilotHelpers'
import { useNovelCopilot } from './NovelCopilotContext'
import { useNovelAssistantChat } from '@/components/novel-chat/NovelAssistantChatContext'
import { buildAssistantChatSessionKey } from '@/components/novel-chat/assistantChatSessionKey'
import type { CopilotEvidence, CopilotSuggestionTarget } from '@/types/copilot'
import {
  useOptionalNovelShell,
} from '@/components/novel-shell/NovelShellContext'
import {
  clampNovelShellDrawerWidth,
  DEFAULT_NOVEL_SHELL_DRAWER_WIDTH,
} from '@/components/novel-shell/novelShellChromeState'
import { NovelCopilotComposer } from './NovelCopilotComposer'
import { NovelCopilotQuickActions } from './NovelCopilotQuickActions'
import { NovelCopilotResearchProcess } from './NovelCopilotResearchProcess'
import { NovelCopilotSuggestionCard } from './NovelCopilotSuggestionCard'
import { AiStatusPill } from './AiStatusPill'
import { NovelCopilotSessionStrip } from './NovelCopilotSessionStrip'
import { NovelCopilotModelPicker } from './NovelCopilotModelPicker'
import { buildAssistantChatLaunchArgs, buildWholeBookCopilotLaunchArgs } from './novelCopilotLauncher'
import { getCopilotWorkbenchMeta } from './novelCopilotWorkbench'
import {
  copilotDrawerShellClassName,
  copilotHighlightLineClassName,
  copilotPanelClassName,
  copilotPanelMutedClassName,
  copilotPanelStrongClassName,
  copilotPillClassName,
  copilotPillInteractiveClassName,
} from './novelCopilotChrome'
import { api } from '@/services/api'
import { getLlmConfig, initializeLlmConfig, setLlmConfig } from '@/lib/llmConfigStore'
import { useToast } from '@/components/world-model/shared/useToast'

const sectionPanelClassName =
  `${copilotPanelClassName} rounded-[24px] p-4`
const dashedPanelClassName =
  `${copilotPanelMutedClassName} rounded-[22px] border-dashed px-4 py-4 text-center text-sm text-muted-foreground`

function buildCopilotSessionKey() {
  return `nck_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function NovelCopilotDrawer({
  onLocateTarget,
}: {
  novelId: number
  onLocateTarget?: (target: CopilotSuggestionTarget) => void
}) {
  const {
    isOpen,
    closeDrawer,
    sessions,
    focusedSessionId,
    focusSession,
    removeSession,
    openDrawer,
    focusedSession,
    activeRun,
    getSessionRun,
    getSessionRuns,
    submitPrompt,
    retryInterruptedRun,
    applySuggestions,
    dismissSuggestions,
  } = useNovelCopilot()
  const shell = useOptionalNovelShell()
  const focusedSessionMeta =
    focusedSessionId == null
      ? null
      : sessions.find((session) => session.sessionId === focusedSessionId) ?? null

  if (!isOpen) return null

  return (
    <ActiveNovelCopilotDrawer
      onLocateTarget={onLocateTarget}
      shell={shell}
      closeDrawer={closeDrawer}
      sessions={sessions}
      focusedSessionId={focusedSessionId}
      focusSession={focusSession}
      removeSession={removeSession}
      openDrawer={openDrawer}
      focusedSessionMeta={focusedSessionMeta}
      focusedSession={focusedSession}
      activeRun={activeRun}
      getSessionRun={getSessionRun}
      getSessionRuns={getSessionRuns}
      submitPrompt={submitPrompt}
      retryInterruptedRun={retryInterruptedRun}
      applySuggestions={applySuggestions}
      dismissSuggestions={dismissSuggestions}
    />
  )
}

function formatEvidencePrompt(evidence: CopilotEvidence, locale: string) {
  const chapterNumber = typeof evidence.source_ref?.chapter_number === 'number'
    ? evidence.source_ref.chapter_number
    : null
  const chapterLabel = chapterNumber
    ? (locale === 'zh' ? `第${chapterNumber}章` : `Chapter ${chapterNumber}`)
    : evidence.title
  if (locale === 'zh') {
    return `请基于这段章节引用继续分析：\n【${chapterLabel}】${evidence.title}\n「${evidence.excerpt}」\n\n我想确认这段引用说明了什么？它对当前设定/关系/剧情有什么影响？`
  }
  return `Please continue the analysis based on this chapter quote:\n[${chapterLabel}] ${evidence.title}\n"${evidence.excerpt}"\n\nWhat does this quote imply, and how does it affect the current setting, relationship, or plot?`
}

function ActiveNovelCopilotDrawer({
  onLocateTarget,
  shell,
  closeDrawer,
  sessions,
  focusedSessionId,
  focusSession,
  removeSession,
  openDrawer,
  focusedSessionMeta,
  focusedSession,
  activeRun: activeRunProp,
  getSessionRun: getSessionRunProp,
  getSessionRuns: getSessionRunsProp,
  submitPrompt: submitPromptProp,
  retryInterruptedRun: retryInterruptedRunProp,
  applySuggestions: applySuggestionsProp,
  dismissSuggestions: dismissSuggestionsProp,
}: {
  onLocateTarget?: (target: CopilotSuggestionTarget) => void
  shell: ReturnType<typeof useOptionalNovelShell>
  closeDrawer: () => void
  sessions: ReturnType<typeof useNovelCopilot>['sessions']
  focusedSessionId: string | null
  focusSession: ReturnType<typeof useNovelCopilot>['focusSession']
  removeSession: ReturnType<typeof useNovelCopilot>['removeSession']
  openDrawer: ReturnType<typeof useNovelCopilot>['openDrawer']
  focusedSessionMeta: ReturnType<typeof useNovelCopilot>['sessions'][number] | null
  focusedSession: ReturnType<typeof useNovelCopilot>['focusedSession']
  activeRun: ReturnType<typeof useNovelCopilot>['activeRun']
  getSessionRun: ReturnType<typeof useNovelCopilot>['getSessionRun']
  getSessionRuns: ReturnType<typeof useNovelCopilot>['getSessionRuns']
  submitPrompt: ReturnType<typeof useNovelCopilot>['submitPrompt']
  retryInterruptedRun: ReturnType<typeof useNovelCopilot>['retryInterruptedRun']
  applySuggestions: ReturnType<typeof useNovelCopilot>['applySuggestions']
  dismissSuggestions: ReturnType<typeof useNovelCopilot>['dismissSuggestions']
}) {
  const { locale, t } = useUiLocale()
  const assistantChat = useNovelAssistantChat()
  const { toast } = useToast()
  const [fallbackDrawerWidth, setFallbackDrawerWidth] = useState(DEFAULT_NOVEL_SHELL_DRAWER_WIDTH)
  const [isDragging, setIsDragging] = useState(false)
  const [retryingRunId, setRetryingRunId] = useState<string | null>(null)
  const [composerValue, setComposerValue] = useState('')
  const [composerFocusSignal, setComposerFocusSignal] = useState(0)
  const [modelOptions, setModelOptions] = useState<string[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [selectedModel, setSelectedModel] = useState(() => getLlmConfig().model)
  const [useResearchSession, setUseResearchSession] = useState(true)
  const setFallbackDrawerWidthClamped = useCallback((nextWidth: number) => {
    setFallbackDrawerWidth(clampNovelShellDrawerWidth(nextWidth))
  }, [])
  const drawerWidth = shell?.shellState.drawerWidth ?? fallbackDrawerWidth
  const setDrawerWidth = shell?.shellState.setDrawerWidth ?? setFallbackDrawerWidthClamped
  const isDraggingRef = useRef(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(DEFAULT_NOVEL_SHELL_DRAWER_WIDTH)
  const drawerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [closeDrawer])

  useEffect(() => {
    let cancelled = false

    const hydrateModelOptions = async () => {
      const currentConfig = getLlmConfig()
      setSelectedModel(currentConfig.model)
      setModelsLoading(true)
      try {
        const defaults = await api.getLlmConfigDefaults()
        const merged = initializeLlmConfig({
          baseUrl: defaults.base_url,
          apiKey: defaults.api_key,
          model: defaults.model,
        })
        if (cancelled) return
        setSelectedModel(merged.model)

        if (merged.baseUrl && merged.apiKey) {
          const res = await api.listLlmModels()
          if (cancelled) return
          const ids = res.models.map((item) => item.id)
          setModelOptions(ids)
          if (!merged.model && ids.length > 0) {
            setSelectedModel(ids[0])
            setLlmConfig({ model: ids[0] })
          }
        } else {
          setModelOptions(merged.model ? [merged.model] : [])
        }
      } catch {
        if (cancelled) return
        setModelOptions((current) => current.length > 0 ? current : (selectedModel ? [selectedModel] : []))
        toast(t('copilot.drawer.modelLoadFailed'))
      } finally {
        if (!cancelled) setModelsLoading(false)
      }
    }

    void hydrateModelOptions()

    return () => {
      cancelled = true
    }
  }, [toast, t])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    isDraggingRef.current = true
    setIsDragging(true)
    startXRef.current = e.clientX
    startWidthRef.current = drawerWidth
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'
  }, [drawerWidth])

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!isDraggingRef.current) return
      const delta = startXRef.current - e.clientX
      let newWidth = startWidthRef.current + delta
      // Cap at 50% of parent width (atlas-design-spec §Spatial Zone Contracts)
      const parentWidth = drawerRef.current?.parentElement?.clientWidth
      if (parentWidth) newWidth = Math.min(newWidth, parentWidth * 0.5)
      setDrawerWidth(newWidth)
    }
    const handlePointerUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false
        setIsDragging(false)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }
    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', handlePointerUp)
    return () => {
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', handlePointerUp)
    }
  }, [setDrawerWidth])

  const persistSelectedModel = useCallback((nextModel: string) => {
    setSelectedModel(nextModel)
    setLlmConfig({ model: nextModel })
  }, [])

  const ensureAssistantSession = useCallback(() => {
    if (assistantChat.focusedSessionId) return
    const [prefill] = buildAssistantChatLaunchArgs()
    assistantChat.openDrawer(prefill, {
      displayTitle: t('copilot.chat.sessionTitle'),
      sessionKey: buildAssistantChatSessionKey(),
    })
  }, [assistantChat, t])

  const handleConversationModeChange = useCallback((nextUseResearchSession: boolean) => {
    setUseResearchSession(nextUseResearchSession)
    if (nextUseResearchSession) {
      if (!focusedSessionMeta) {
        openDrawer(...buildWholeBookCopilotLaunchArgs(shell?.routeState))
      }
      return
    }
    ensureAssistantSession()
  }, [ensureAssistantSession, focusedSessionMeta, openDrawer, shell?.routeState])

  const activeSessions = useResearchSession ? sessions : assistantChat.sessions
  const activeFocusedSessionId = useResearchSession ? focusedSessionId : assistantChat.focusedSessionId
  const activeFocusSession = useResearchSession ? focusSession : assistantChat.focusSession
  const activeRemoveSession = useResearchSession ? removeSession : assistantChat.removeSession
  const activeFocusedSessionMeta =
    activeFocusedSessionId == null
      ? null
      : activeSessions.find((candidate) => candidate.sessionId === activeFocusedSessionId) ?? null
  const session = useResearchSession
    ? (focusedSession ?? focusedSessionMeta)
    : (assistantChat.focusedSession ?? activeFocusedSessionMeta)
  const activeRun = useResearchSession ? activeRunProp : assistantChat.activeRun
  const activeGetSessionRun = useResearchSession ? getSessionRunProp : assistantChat.getSessionRun
  const activeGetSessionRuns = useResearchSession ? getSessionRunsProp : assistantChat.getSessionRuns
  const activeSubmitPrompt = useResearchSession ? submitPromptProp : assistantChat.submitPrompt
  const activeRetryInterruptedRun = useResearchSession ? retryInterruptedRunProp : assistantChat.retryInterruptedRun
  const activeApplySuggestions = useResearchSession ? applySuggestionsProp : assistantChat.applySuggestions
  const activeDismissSuggestions = useResearchSession ? dismissSuggestionsProp : assistantChat.dismissSuggestions
  const workbenchMeta = useResearchSession && session
    ? getCopilotWorkbenchMeta(session.prefill, session.displayTitle, locale)
    : null
  const quickActionPrompts = workbenchMeta
    ? Object.fromEntries(workbenchMeta.quickActions.map((action) => [action.id, action.prompt]))
    : {}
  const scopeLabel = useResearchSession && session ? getCopilotScopeLabel(session.prefill, locale) : null
  const sessionRuns = session ? activeGetSessionRuns(session.sessionId) : []
  const focusedStatus =
    !session
      ? 'idle'
      : activeRun?.status === 'queued' || activeRun?.status === 'running'
        ? 'running'
        : activeRun?.status === 'error' || activeRun?.status === 'interrupted'
          ? 'error'
          : 'connected'
  const isFocusedSessionBusy = session != null && (activeRun?.status === 'queued' || activeRun?.status === 'running')

  const handleCreateSession = useCallback(() => {
    if (!useResearchSession) {
      const [prefill] = buildAssistantChatLaunchArgs()
      assistantChat.openDrawer(prefill, {
        displayTitle: t('copilot.chat.sessionTitle'),
        sessionKey: buildCopilotSessionKey(),
      })
      return
    }

    if (session) {
      openDrawer(session.prefill, {
        displayTitle: session.displayTitle,
        sessionKey: buildCopilotSessionKey(),
      })
      return
    }

    const [prefill, options] = buildWholeBookCopilotLaunchArgs(shell?.routeState)
    openDrawer(prefill, {
      ...options,
      sessionKey: buildCopilotSessionKey(),
    })
  }, [assistantChat, openDrawer, session, shell, t, useResearchSession])

  const handleAction = (action: string) => {
    if (!useResearchSession || !session) return
    persistSelectedModel(selectedModel)
    void activeSubmitPrompt(
      session.sessionId,
      quickActionPrompts[action] ?? t('copilot.drawer.fallbackPrompt'),
      session.prefill.scope,
      session.prefill.context,
      action,
    )
  }

  const handleSubmit = (prompt: string) => {
    if (!session) return
    persistSelectedModel(selectedModel)
    void activeSubmitPrompt(session.sessionId, prompt, session.prefill.scope, session.prefill.context)
  }

  const handleAskAboutEvidence = useCallback((evidence: CopilotEvidence) => {
    setComposerValue(formatEvidencePrompt(evidence, locale))
    setComposerFocusSignal((current) => current + 1)
  }, [locale])

  const handleRetryInterruptedRun = useCallback((runId: string) => {
    if (!session || retryingRunId === runId || isFocusedSessionBusy) return

    setRetryingRunId(runId)
    void activeRetryInterruptedRun(session.sessionId, runId).finally(() => {
      setRetryingRunId((current) => (current === runId ? null : current))
    })
  }, [activeRetryInterruptedRun, isFocusedSessionBusy, retryingRunId, session])

  return (
    <>
      <div
        ref={drawerRef}
        className={cn(
          'relative shrink-0 flex flex-col overflow-hidden transition-none border-l',
          copilotDrawerShellClassName,
          'shadow-[var(--nw-copilot-shell-shadow)]'
        )}
        style={{ width: drawerWidth, transition: isDragging ? 'none' : 'width 0.3s cubic-bezier(0.19,1,0.22,1)' }}
        data-testid="novel-copilot-drawer"
        data-state="open"
        aria-hidden={false}
      >
        <div
          className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-[hsl(var(--accent)/0.15)] active:bg-[hsl(var(--accent)/0.3)] z-50 transition-colors"
          onPointerDown={handlePointerDown}
        />

        <div className="absolute inset-0 bg-[var(--nw-copilot-shell-bg)]" />
        <div className="pointer-events-none absolute inset-0 overflow-hidden [mix-blend-mode:var(--nw-copilot-glow-blend)] opacity-[var(--nw-copilot-glow-op)] z-0">
          <div className="absolute -right-20 top-0 h-64 w-64 rounded-full bg-[radial-gradient(circle,var(--nw-copilot-glow-1),transparent_68%)]" />
          <div className="absolute -left-16 bottom-0 h-56 w-56 rounded-full bg-[radial-gradient(circle,var(--nw-copilot-glow-2),transparent_74%)]" />
          <div className="absolute inset-x-10 top-20 h-24 rounded-full bg-[radial-gradient(circle,var(--nw-copilot-glow-3),transparent_72%)] blur-2xl" />
        </div>

        <div className="relative flex h-full flex-col">
          <div className="shrink-0 border-b border-[var(--nw-copilot-border)] bg-[linear-gradient(180deg,hsl(var(--background)/0.16),transparent)]">
            <div className="relative flex items-center justify-between gap-4 px-5 py-4">
              <div className={cn('pointer-events-none absolute inset-x-5 top-0 h-px opacity-80', copilotHighlightLineClassName)} />
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-3">
                  <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-[20px] text-foreground/82', copilotPanelStrongClassName)}>
                    <Bot className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-medium tracking-[0.01em] text-foreground/90">Novel Copilot</h2>
                      <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.16em] text-muted-foreground/80', copilotPillClassName)}>
                        Novel Copilot
                      </span>
                    </div>
                    <div className="mt-3 flex flex-col items-start gap-1.5">
                      <div className="px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/72">
                        {t('copilot.drawer.modeSwitch')}
                      </div>
                      <div className={cn('inline-flex items-center rounded-[16px] border p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]', copilotPanelMutedClassName, 'border-[var(--nw-copilot-border)]')}>
                        <button
                          type="button"
                          onClick={() => handleConversationModeChange(false)}
                          data-testid="copilot-mode-chat"
                          className={cn(
                            'rounded-[12px] px-3 py-1.5 text-[11px] font-semibold tracking-[0.01em] transition-all duration-200',
                            !useResearchSession
                              ? 'bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] shadow-[0_10px_24px_hsl(var(--accent)/0.28)]'
                              : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground',
                          )}
                        >
                          {t('copilot.drawer.modeChat')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleConversationModeChange(true)}
                          data-testid="copilot-mode-research"
                          className={cn(
                            'rounded-[12px] px-3 py-1.5 text-[11px] font-semibold tracking-[0.01em] transition-all duration-200',
                            useResearchSession
                              ? 'bg-foreground/12 text-foreground shadow-[0_10px_24px_rgba(15,23,42,0.16)]'
                              : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground',
                          )}
                        >
                          {t('copilot.drawer.modeResearch')}
                        </button>
                      </div>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <AiStatusPill status={focusedStatus} />
                      {scopeLabel ? (
                        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.16em] text-muted-foreground/80', copilotPillClassName)}>
                          {scopeLabel}
                        </span>
                      ) : null}
                      <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] text-muted-foreground/75', copilotPillClassName)}>
                        {t('copilot.drawer.sessionsCount', { count: activeSessions.length })}
                      </span>
                    </div>
                    <div className="mt-2 truncate text-[11px] text-muted-foreground/70">
                      {session
                        ? (
                          useResearchSession
                            ? t('copilot.drawer.currentWorkspace', { title: session.displayTitle })
                            : t('copilot.chat.currentSession', { title: session.displayTitle })
                        )
                        : t('copilot.drawer.emptyCurrentWorkspace')}
                    </div>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={closeDrawer}
                className={cn(
                  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[18px] text-muted-foreground hover:text-foreground',
                  copilotPillInteractiveClassName,
                )}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <NovelCopilotSessionStrip
            sessions={activeSessions}
            focusedSessionId={activeFocusedSessionId}
            getSessionStatus={(sessionId) => activeGetSessionRun(sessionId)?.status ?? null}
            onFocusSession={activeFocusSession}
            onRemoveSession={activeRemoveSession}
            onCreateSession={handleCreateSession}
          />

          <div className="nw-scrollbar-thin flex-1 overflow-y-auto px-4 py-5">
            {!session && (
              <div className="animate-in space-y-3 fade-in duration-500" data-testid="novel-copilot-empty-state">
                <div className={cn('relative overflow-hidden rounded-[24px] px-4 py-4', copilotPanelStrongClassName)}>
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-[radial-gradient(circle_at_top_left,var(--nw-copilot-glow-4),transparent_62%)] [mix-blend-mode:var(--nw-copilot-glow-blend)] opacity-[var(--nw-copilot-glow-op)]" />
                  <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-[radial-gradient(circle_at_right,var(--nw-copilot-glow-2),transparent_68%)] [mix-blend-mode:var(--nw-copilot-glow-blend)] opacity-[calc(var(--nw-copilot-glow-op)*0.8)]" />
                  <div className="relative">
                    <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground/70">
                      {useResearchSession ? t('copilot.card.workbenchEyebrow') : t('copilot.chat.badge')}
                    </div>
                    <div className="mt-1.5 text-sm font-medium text-foreground/90">
                      {useResearchSession ? t('copilot.drawer.emptyTitle') : t('copilot.chat.title')}
                    </div>
                    <div className="mt-2 text-[13px] leading-relaxed text-muted-foreground/80">
                      {useResearchSession ? t('copilot.drawer.emptyDescription') : t('copilot.chat.emptyHint')}
                    </div>
                    <button
                      type="button"
                      onClick={() => (
                        useResearchSession
                          ? openDrawer(...buildWholeBookCopilotLaunchArgs(shell?.routeState))
                          : ensureAssistantSession()
                      )}
                      data-testid="novel-copilot-open-whole-book"
                      className={cn(
                        'mt-4 inline-flex items-center rounded-full px-3.5 py-2 text-[12px] font-medium text-foreground/88',
                        copilotPillInteractiveClassName,
                      )}
                    >
                      {useResearchSession ? t('copilot.drawer.emptyCta') : t('copilot.drawer.modeChat')}
                    </button>
                  </div>
                </div>
                <div className={dashedPanelClassName}>
                  {useResearchSession ? t('copilot.drawer.emptyHint') : t('copilot.chat.emptyHint')}
                </div>
              </div>
            )}

            {session && sessionRuns.length === 0 && useResearchSession && workbenchMeta && (
              <div className="animate-in space-y-3 fade-in duration-700">
                <div className={cn('relative overflow-hidden rounded-[24px] px-4 py-4', copilotPanelStrongClassName)}>
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-[radial-gradient(circle_at_top_left,var(--nw-copilot-glow-4),transparent_62%)] [mix-blend-mode:var(--nw-copilot-glow-blend)] opacity-[var(--nw-copilot-glow-op)]" />
                  <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-[radial-gradient(circle_at_right,var(--nw-copilot-glow-2),transparent_68%)] [mix-blend-mode:var(--nw-copilot-glow-blend)] opacity-[calc(var(--nw-copilot-glow-op)*0.8)]" />
                  <div className="relative flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground/70">
                        {workbenchMeta.introEyebrow}
                      </div>
                      <div className="mt-1.5 text-sm font-medium text-foreground/90">
                        {workbenchMeta.introTitle}
                      </div>
                    </div>
                    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium text-foreground/76', copilotPillClassName)}>
                      {t('copilot.drawer.workspace')}
                    </span>
                  </div>
                </div>
                <NovelCopilotQuickActions
                  actions={workbenchMeta.quickActions}
                  onAction={handleAction}
                  disabled={isFocusedSessionBusy}
                />
              </div>
            )}

            {session && sessionRuns.length === 0 && !useResearchSession && (
              <div className="animate-in space-y-3 fade-in duration-700">
                <div className={cn('relative overflow-hidden rounded-[24px] px-4 py-4', copilotPanelStrongClassName)}>
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-[radial-gradient(circle_at_top_left,var(--nw-copilot-glow-4),transparent_62%)] [mix-blend-mode:var(--nw-copilot-glow-blend)] opacity-[var(--nw-copilot-glow-op)]" />
                  <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-[radial-gradient(circle_at_right,var(--nw-copilot-glow-2),transparent_68%)] [mix-blend-mode:var(--nw-copilot-glow-blend)] opacity-[calc(var(--nw-copilot-glow-op)*0.8)]" />
                  <div className="relative space-y-2">
                    <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground/70">
                      {t('copilot.chat.badge')}
                    </div>
                    <div className="text-sm font-medium text-foreground/90">
                      {t('copilot.chat.emptyHint')}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {session && sessionRuns.length > 0 && (
              <div className="animate-in flex flex-col justify-end space-y-4 fade-in slide-in-from-bottom-2 duration-500">
                {sessionRuns.map((run, index) => {
                  const isLatestRun = index === sessionRuns.length - 1
                  const pendingSuggestions = run.suggestions.filter((suggestion) => suggestion.status === 'pending')
                  const appliedSuggestions = run.suggestions.filter((suggestion) => suggestion.status === 'applied')

                  return (
                    <div key={run.run_id} className="space-y-4" data-testid={`copilot-run-${run.run_id}`}>
                      {!isLatestRun && <div className="mx-12 border-t border-[var(--nw-copilot-border)]/60" />}

                      <div className="flex justify-end">
                        <div className={cn(copilotPanelStrongClassName, 'max-w-[88%] rounded-[24px] rounded-tr-md px-4 py-3')}>
                          <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground/70">
                            {isLatestRun ? t('copilot.drawer.currentRequest') : t('copilot.drawer.previousRequest')}
                          </div>
                          <div className="text-[13px] leading-relaxed text-foreground/95">{run.prompt}</div>
                        </div>
                      </div>

                      {run.status === 'interrupted' && (
                        <div
                          className={cn(
                            copilotPanelMutedClassName,
                            'rounded-[22px] border-[hsl(var(--color-danger)/0.22)] px-4 py-3 [background:linear-gradient(160deg,hsl(var(--color-danger)/0.08),transparent)]',
                          )}
                        >
                          <div className="flex flex-col gap-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-[hsl(var(--color-danger))]/85">
                                  {t('copilot.drawer.interrupted')}
                                </div>
                                <div className="mt-1 text-[13px] leading-relaxed text-[hsl(var(--color-danger))]">
                                  {run.error ?? t('copilot.drawer.interruptedFallback')}
                                </div>
                              </div>
                              {isLatestRun && (
                                <button
                                  type="button"
                                  onClick={() => handleRetryInterruptedRun(run.run_id)}
                                  disabled={isFocusedSessionBusy || retryingRunId === run.run_id}
                                  className={cn(
                                    'inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-[11px] font-medium tracking-[0.01em] text-foreground/85 disabled:cursor-not-allowed disabled:opacity-55',
                                    copilotPillInteractiveClassName,
                                  )}
                                >
                                  <RotateCcw className={cn('h-3.5 w-3.5', retryingRunId === run.run_id && 'animate-spin')} />
                                  {retryingRunId === run.run_id ? t('copilot.drawer.retryingInterrupted') : t('copilot.drawer.retryInterrupted')}
                                </button>
                              )}
                            </div>
                            {isLatestRun && (
                              <div className="flex items-start justify-between gap-3 text-[11px] leading-relaxed text-muted-foreground/72">
                                <span>
                                  {t('copilot.drawer.retryHint')}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {run.status === 'error' && (
                        <div className={cn(dashedPanelClassName, 'border-[hsl(var(--color-danger)/0.22)] text-[hsl(var(--color-danger))] [background:linear-gradient(160deg,hsl(var(--color-danger)/0.08),transparent)]')}>
                          {run.error ?? t('copilot.drawer.errorFallback')}
                        </div>
                      )}

                      {run.status === 'completed' && run.answer && (
                        <div className={cn(copilotPanelClassName, 'rounded-[22px] rounded-tl-md px-4 py-3')}>
                          <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground/70">
                            {useResearchSession ? t('copilot.drawer.analysisResult') : t('copilot.chat.badge')}
                          </div>
                          <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/90">{run.answer}</div>
                        </div>
                      )}

                      {useResearchSession && (run.trace?.length > 0 || run.evidence?.length > 0) && (
                        <NovelCopilotResearchProcess
                          trace={run.trace}
                          evidence={run.evidence}
                          onAskAboutEvidence={handleAskAboutEvidence}
                        />
                      )}

                      {run.status === 'completed' && pendingSuggestions.length > 0 && (
                        <section className={sectionPanelClassName}>
                          <div className="mb-3 flex items-center justify-between gap-3 px-1">
                            <h3 className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground/80">
                              {t('copilot.drawer.suggestions')}
                            </h3>
                            <div className="text-[10px] font-medium tracking-[0.05em] text-muted-foreground/60">{t('copilot.drawer.pendingSuggestions', { count: pendingSuggestions.length })}</div>
                          </div>
                          <div className="space-y-3">
                            {pendingSuggestions.map((s) => (
                              <NovelCopilotSuggestionCard
                                key={s.suggestion_id}
                                suggestion={s}
                                onApply={(id) => void activeApplySuggestions(session.sessionId, run.run_id, [id])}
                                onDismiss={(id) => void activeDismissSuggestions(session.sessionId, run.run_id, [id])}
                                onLocateTarget={onLocateTarget}
                              />
                            ))}
                          </div>
                        </section>
                      )}

                      {run.status === 'completed' && appliedSuggestions.length > 0 && (
                        <section className={sectionPanelClassName}>
                          <div className="mb-3 flex items-center justify-between gap-3 px-1">
                            <h3 className="text-[10px] font-medium uppercase tracking-[0.2em] text-foreground/70">
                              {t('copilot.drawer.applied')}
                            </h3>
                            <div className="text-[10px] font-medium tracking-[0.05em] text-muted-foreground/60">{t('copilot.drawer.appliedSuggestions', { count: appliedSuggestions.length })}</div>
                          </div>
                          <div className="space-y-3">
                            {appliedSuggestions.map((s) => (
                              <NovelCopilotSuggestionCard
                                key={s.suggestion_id}
                                suggestion={s}
                                mode="applied"
                                onApply={() => undefined}
                                onDismiss={() => undefined}
                                onLocateTarget={onLocateTarget}
                              />
                            ))}
                          </div>
                        </section>
                      )}

                      {run.status === 'completed' && pendingSuggestions.length === 0 && appliedSuggestions.length === 0 && !run.answer && (
                        <div className={dashedPanelClassName}>{t('copilot.drawer.noSuggestions')}</div>
                      )}

                      {run.status === 'completed' && pendingSuggestions.length === 0 && appliedSuggestions.length > 0 && (
                        <div className={dashedPanelClassName}>
                          {t('copilot.drawer.allHandled')}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-[var(--nw-copilot-border)] bg-[linear-gradient(180deg,hsl(var(--foreground)/0.03),transparent)] p-4">
            <div className={cn('mb-3 rounded-[18px] px-3 py-2.5', copilotPanelMutedClassName)}>
              <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground/72">
                {t('copilot.drawer.modelLabel')}
              </div>
              <NovelCopilotModelPicker
                value={selectedModel}
                options={modelOptions}
                loading={modelsLoading}
                disabled={isFocusedSessionBusy || modelsLoading}
                onChange={persistSelectedModel}
              />
            </div>
            <NovelCopilotComposer
              onSubmit={handleSubmit}
              disabled={isFocusedSessionBusy || !session}
              label={
                useResearchSession
                  ? (workbenchMeta?.composerLabel ?? t('copilot.drawer.emptyComposerLabel'))
                  : t('copilot.chat.composerLabel')
              }
              placeholder={
                useResearchSession
                  ? (workbenchMeta?.composerPlaceholder ?? t('copilot.drawer.emptyComposerPlaceholder'))
                  : t('copilot.chat.composerPlaceholder')
              }
              value={composerValue}
              onValueChange={setComposerValue}
              focusSignal={composerFocusSignal}
            />
          </div>
        </div>
      </div>
    </>
  )
}
