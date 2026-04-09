import { useCallback, useEffect, useMemo, useState } from 'react'
import '@/lib/uiMessagePacks/copilot'
import { Bot, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUiLocale } from '@/contexts/UiLocaleContext'
import { useNovelAssistantChat } from './NovelAssistantChatContext'
import { buildAssistantChatSessionKey } from './assistantChatSessionKey'
import { getCopilotWorkbenchMeta } from '@/components/novel-copilot/novelCopilotWorkbench'
import { buildAssistantChatLaunchArgs } from '@/components/novel-copilot/novelCopilotLauncher'
import { NovelCopilotComposer } from '@/components/novel-copilot/NovelCopilotComposer'
import { NovelCopilotModelPicker } from '@/components/novel-copilot/NovelCopilotModelPicker'
import { NovelCopilotSuggestionCard } from '@/components/novel-copilot/NovelCopilotSuggestionCard'
import { NovelCopilotSessionStrip } from '@/components/novel-copilot/NovelCopilotSessionStrip'
import { AiStatusPill } from '@/components/novel-copilot/AiStatusPill'
import {
  copilotHighlightLineClassName,
  copilotPanelClassName,
  copilotPanelMutedClassName,
  copilotPanelStrongClassName,
  copilotPillInteractiveClassName,
} from '@/components/novel-copilot/novelCopilotChrome'
import { api } from '@/services/api'
import { getLlmConfig, initializeLlmConfig, setLlmConfig } from '@/lib/llmConfigStore'
import { useToast } from '@/components/world-model/shared/useToast'

const sectionPanelClassName = `${copilotPanelClassName} rounded-[24px] p-4`
const dashedPanelClassName =
  `${copilotPanelMutedClassName} rounded-[22px] border-dashed px-4 py-4 text-center text-sm text-muted-foreground`
const assistantChatPanelHeightClassName = 'h-full max-h-[min(68vh,720px)]'

export function NovelAssistantChatPanel({
  className,
}: {
  className?: string
}) {
  const {
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
  } = useNovelAssistantChat()
  const { locale, t } = useUiLocale()
  const { toast } = useToast()
  const [retryingRunId, setRetryingRunId] = useState<string | null>(null)
  const [composerValue, setComposerValue] = useState('')
  const [modelOptions, setModelOptions] = useState<string[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [selectedModel, setSelectedModel] = useState(() => getLlmConfig().model)

  const focusedSessionMeta =
    focusedSessionId == null
      ? null
      : sessions.find((session) => session.sessionId === focusedSessionId) ?? null
  const session = focusedSession ?? focusedSessionMeta

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
  }, [selectedModel, t, toast])

  const persistSelectedModel = useCallback((nextModel: string) => {
    setSelectedModel(nextModel)
    setLlmConfig({ model: nextModel })
  }, [])

  const handleResetSession = useCallback(() => {
    if (!session) return
    removeSession(session.sessionId)
    setComposerValue('')
  }, [removeSession, session])

  const handleSubmit = useCallback((prompt: string) => {
    if (!session) return
    persistSelectedModel(selectedModel)
    void submitPrompt(session.sessionId, prompt, session.prefill.scope, session.prefill.context)
  }, [persistSelectedModel, selectedModel, session, submitPrompt])

  const handleCreateSession = useCallback(() => {
    const [prefill] = buildAssistantChatLaunchArgs()
    openDrawer(
      prefill,
      {
        displayTitle: t('copilot.chat.sessionTitle'),
        sessionKey: buildAssistantChatSessionKey(),
      },
    )
  }, [openDrawer, t])

  const workbenchMeta = useMemo(() => {
    if (!session) return null
    return getCopilotWorkbenchMeta(session.prefill, session.displayTitle, locale)
  }, [locale, session])

  const sessionRuns = session ? getSessionRuns(session.sessionId) : []
  const focusedStatus =
    activeRun?.status === 'queued' || activeRun?.status === 'running'
      ? 'running'
      : activeRun?.status === 'error' || activeRun?.status === 'interrupted'
        ? 'error'
        : session
          ? 'connected'
          : 'idle'
  const isFocusedSessionBusy = activeRun?.status === 'queued' || activeRun?.status === 'running'

  const handleRetryInterruptedRun = useCallback((runId: string) => {
    if (!session || retryingRunId === runId || isFocusedSessionBusy) return
    setRetryingRunId(runId)
    void retryInterruptedRun(session.sessionId, runId).finally(() => {
      setRetryingRunId((current) => (current === runId ? null : current))
    })
  }, [isFocusedSessionBusy, retryInterruptedRun, retryingRunId, session])

  if (!session || !workbenchMeta) {
    return (
      <div className={cn(assistantChatPanelHeightClassName, 'rounded-[24px] p-4', copilotPanelClassName, className)}>
        <div className="text-sm text-muted-foreground">{t('copilot.chat.connecting')}</div>
      </div>
    )
  }

  return (
    <section className={cn(assistantChatPanelHeightClassName, 'min-h-0 flex flex-col overflow-hidden rounded-[24px]', copilotPanelClassName, className)} data-testid="novel-assistant-chat-panel">
      <div className="relative shrink-0 border-b border-[var(--nw-copilot-border)] bg-[linear-gradient(180deg,hsl(var(--background)/0.16),transparent)] px-4 py-4">
        <div className={cn('pointer-events-none absolute inset-x-4 top-0 h-px opacity-80', copilotHighlightLineClassName)} />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-[20px] text-foreground/82', copilotPanelStrongClassName)}>
                <Bot className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-medium tracking-[0.01em] text-foreground/90">{t('copilot.chat.title')}</h3>
                  <AiStatusPill status={focusedStatus} />
                </div>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleResetSession}
            className={cn(
              'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[18px] text-muted-foreground hover:text-foreground',
              copilotPillInteractiveClassName,
            )}
            aria-label={t('copilot.chat.reset')}
            title={t('copilot.chat.reset')}
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {sessions.length > 1 ? (
        <NovelCopilotSessionStrip
          sessions={sessions}
          focusedSessionId={focusedSessionId}
          getSessionStatus={(sessionId) => getSessionRun(sessionId)?.status ?? null}
          onFocusSession={focusSession}
          onRemoveSession={removeSession}
          onCreateSession={handleCreateSession}
        />
      ) : null}

      <div className="nw-scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {sessionRuns.length === 0 ? (
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
        ) : (
          <div className="animate-in flex flex-col justify-end space-y-4 fade-in slide-in-from-bottom-2 duration-500">
            {sessionRuns.map((run, index) => {
              const isLatestRun = index === sessionRuns.length - 1
              const pendingSuggestions = run.suggestions.filter((suggestion) => suggestion.status === 'pending')
              const appliedSuggestions = run.suggestions.filter((suggestion) => suggestion.status === 'applied')

              return (
                <div key={run.run_id} className="space-y-4" data-testid={`assistant-chat-run-${run.run_id}`}>
                  {!isLatestRun && <div className="mx-12 border-t border-[var(--nw-copilot-border)]/60" />}

                  <div className="flex justify-end">
                    <div className={cn(copilotPanelStrongClassName, 'max-w-[88%] rounded-[24px] rounded-tr-md px-4 py-3')}>
                      <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground/70">
                        {isLatestRun ? t('copilot.drawer.currentRequest') : t('copilot.drawer.previousRequest')}
                      </div>
                      <div className="text-[13px] leading-relaxed text-foreground/95">{run.prompt}</div>
                    </div>
                  </div>

                  {run.status === 'interrupted' ? (
                    <div className={cn(copilotPanelMutedClassName, 'rounded-[22px] border-[hsl(var(--color-danger)/0.22)] px-4 py-3 [background:linear-gradient(160deg,hsl(var(--color-danger)/0.08),transparent)]')}>
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
                          {isLatestRun ? (
                            <button
                              type="button"
                              onClick={() => handleRetryInterruptedRun(run.run_id)}
                              disabled={isFocusedSessionBusy || retryingRunId === run.run_id}
                              className={cn('inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-[11px] font-medium tracking-[0.01em] text-foreground/85 disabled:cursor-not-allowed disabled:opacity-55', copilotPillInteractiveClassName)}
                            >
                              <RotateCcw className={cn('h-3.5 w-3.5', retryingRunId === run.run_id && 'animate-spin')} />
                              {retryingRunId === run.run_id ? t('copilot.drawer.retryingInterrupted') : t('copilot.drawer.retryInterrupted')}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {run.status === 'error' ? (
                    <div className={cn(dashedPanelClassName, 'border-[hsl(var(--color-danger)/0.22)] text-[hsl(var(--color-danger))] [background:linear-gradient(160deg,hsl(var(--color-danger)/0.08),transparent)]')}>
                      {run.error ?? t('copilot.drawer.errorFallback')}
                    </div>
                  ) : null}

                  {run.status === 'completed' && run.answer ? (
                    <div className={cn(copilotPanelClassName, 'rounded-[22px] rounded-tl-md px-4 py-3')}>
                      <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground/70">
                        {t('copilot.chat.badge')}
                      </div>
                      <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/90">{run.answer}</div>
                    </div>
                  ) : null}

                  {run.status === 'completed' && pendingSuggestions.length > 0 ? (
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
                            onApply={(id) => void applySuggestions(session.sessionId, run.run_id, [id])}
                            onDismiss={(id) => void dismissSuggestions(session.sessionId, run.run_id, [id])}
                          />
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {run.status === 'completed' && appliedSuggestions.length > 0 ? (
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
                          />
                        ))}
                      </div>
                    </section>
                  ) : null}
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
          disabled={isFocusedSessionBusy}
          label={workbenchMeta.composerLabel}
          placeholder={workbenchMeta.composerPlaceholder}
          value={composerValue}
          onValueChange={setComposerValue}
          focusSignal={0}
        />
      </div>
    </section>
  )
}
