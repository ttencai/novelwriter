// SPDX-FileCopyrightText: 2026 Isaac.X.Ω.Yuan
// SPDX-License-Identifier: AGPL-3.0-only

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import '@/lib/uiMessagePacks/novel'
import { Check, RefreshCw, Upload, Info, ChevronDown, ChevronRight, Loader2, Settings, MessageSquarePlus, Sparkles, X, FileSearch } from 'lucide-react'
import { NwButton } from '@/components/ui/nw-button'
import { PlainTextContent, type TextAnnotation } from '@/components/ui/plain-text-content'
import { FeedbackForm, type FeedbackAnswers } from '@/components/feedback/FeedbackForm'
import { DriftWarningPopover } from '@/components/generation/DriftWarningPopover'
import { ProseWarningsPanel } from '@/components/generation/ProseWarningsPanel'
import { getWhitelist, addToWhitelist } from '@/lib/postcheckWhitelistStorage'
import { setActiveWarnings } from '@/lib/postcheckActiveWarningsStorage'
import { getLlmApiErrorMessage } from '@/lib/llmErrorMessages'
import { readGenerationResultsDebug, readGenerationResultsWarnings, saveGenerationResultsDebug } from '@/lib/generationResultsDebugStorage'
import { useCreateChapter } from '@/hooks/novel/useCreateChapter'
import {
  setResultsProvenanceSearchParams,
} from '@/components/novel-shell/NovelShellRouteState'
import { api, streamContinuation, ApiError } from '@/services/api'
import { useAuth } from '@/contexts/AuthContext'
import { useUiLocale } from '@/contexts/UiLocaleContext'
import { downloadTextFile } from '@/lib/downloadTextFile'
import { cn } from '@/lib/utils'
import type { ContinueDebugSummary, ContinueRequest, ContinueResponse, Continuation, ContinuationPolishResponse, ContinuationReviewResponse, PostcheckWarning, ProseWarning } from '@/types/api'

interface VariantState {
  content: string
  continuationId: number | null
  isStreaming: boolean
  error: string | null
}

export function ContinuationResultsStage({
  novelId,
  activeChapterNum,
  activeChapterReference,
  latestChapterNum,
  showInjectionSummaryRail,
  onToggleInjectionSummaryRail,
  onDebugChange,
}: {
  novelId: number
  activeChapterNum: number | null
  activeChapterReference?: string | null
  latestChapterNum: number | null
  showInjectionSummaryRail: boolean
  onToggleInjectionSummaryRail: () => void
  onDebugChange: (debug: ContinueDebugSummary | null) => void
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, refreshQuota } = useAuth()
  const { locale, t } = useUiLocale()
  const state = location.state as {
    streamParams?: ContinueRequest
    novelId?: number
    response?: ContinueResponse
    studioResultsDebug?: ContinueDebugSummary | null
  } | null

  const stateBelongsToNovel = state?.novelId === novelId
  const legacyResponse = stateBelongsToNovel ? state?.response : undefined
  const legacyVersions: Continuation[] = legacyResponse?.continuations ?? []
  const scopedStudioResultsDebug = stateBelongsToNovel ? state?.studioResultsDebug ?? null : null

  const searchParams = new URLSearchParams(location.search)
  const persisted = searchParams.get('continuations')
  const [persistedVersions, setPersistedVersions] = useState<Continuation[] | null>(null)
  const [persistedDebug, setPersistedDebug] = useState<ContinueDebugSummary | null>(null)
  const [persistedError, setPersistedError] = useState<string | null>(null)
  const [reloadAttempt, setReloadAttempt] = useState(0)

  const initialStreamRef = useRef<
    | {
      novelId: number
      params: ContinueRequest
    }
    | null
    | undefined
  >(undefined)
  if (initialStreamRef.current === undefined) {
    initialStreamRef.current =
      !persisted && state?.streamParams && state?.novelId === novelId
        ? { novelId: state.novelId, params: state.streamParams }
        : null
  }
  const streamCtx = initialStreamRef.current

  const [variants, setVariants] = useState<VariantState[]>([])
  const [activeTab, setActiveTab] = useState(0)
  const [isDone, setIsDone] = useState(false)
  const [streamError, setStreamError] = useState<string | null>(null)
  const [isQuotaExhausted, setIsQuotaExhausted] = useState(false)
  const [showFeedbackForm, setShowFeedbackForm] = useState(false)
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false)
  const [streamDebug, setStreamDebug] = useState<ContinueDebugSummary | null>(null)
  const [streamAttempt, setStreamAttempt] = useState(0)
  const abortRef = useRef(false)
  const abortCtrlRef = useRef<AbortController | null>(null)
  const continuationMapRef = useRef<Map<number, number>>(new Map())
  const totalVariantsRef = useRef<number>(0)
  const latestLocationRef = useRef({ pathname: location.pathname, search: location.search })
  latestLocationRef.current = { pathname: location.pathname, search: location.search }

  const isStreamMode = streamCtx != null
  const nonStreamVersions = persistedVersions ?? legacyVersions
  const isLegacyMode = !isStreamMode && nonStreamVersions.length > 0
  const isReloadMode = !isStreamMode && legacyVersions.length === 0 && !!persisted

  const [reloadedWarnings, setReloadedWarnings] = useState<PostcheckWarning[]>([])
  const [whitelist, setWhitelist] = useState<string[]>(() => getWhitelist(novelId))
  const [continuationContentOverrides, setContinuationContentOverrides] = useState<Record<number, string>>({})
  const [deAiOpen, setDeAiOpen] = useState(false)
  const [deAiLoading, setDeAiLoading] = useState(false)
  const [deAiAdopting, setDeAiAdopting] = useState(false)
  const [deAiError, setDeAiError] = useState<string | null>(null)
  const [deAiPreview, setDeAiPreview] = useState<ContinuationPolishResponse | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewRewriting, setReviewRewriting] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [reviewPreview, setReviewPreview] = useState<ContinuationReviewResponse | null>(null)
  const [reviewerModel, setReviewerModel] = useState('')
  const [reviewModelOptions, setReviewModelOptions] = useState<string[]>([])
  const [reviewModelsLoading, setReviewModelsLoading] = useState(false)
  const createChapter = useCreateChapter(novelId)

  const handleDismissTerm = useCallback((term: string) => {
    addToWhitelist(novelId, term)
    setWhitelist((prev) => [...prev, term])
  }, [novelId])

  const driftAnnotations: TextAnnotation[] = useMemo(() => {
    let warnings: PostcheckWarning[] | undefined
    if (isStreamMode) {
      if (!isDone) return []
      warnings = streamDebug?.drift_warnings
    } else if (legacyResponse?.debug?.drift_warnings?.length) {
      warnings = legacyResponse.debug.drift_warnings
    } else if (reloadedWarnings.length > 0) {
      warnings = reloadedWarnings
    }
    if (!warnings?.length) return []

    const targetVersion = activeTab + 1
    return warnings
      .filter((warning) => (warning.version == null || warning.version === targetVersion) && !whitelist.includes(warning.term))
      .map((warning) => ({
        id: `drift-${warning.code}-${warning.term}`,
        term: warning.term,
        className: 'nw-drift-highlight',
        renderPopover: ({ onClose }: { onClose: () => void }) => (
          <DriftWarningPopover
            code={warning.code}
            term={warning.term}
            onDismiss={() => {
              handleDismissTerm(warning.term)
              onClose()
            }}
          />
        ),
      }))
  }, [activeTab, handleDismissTerm, isDone, isStreamMode, legacyResponse?.debug, reloadedWarnings, streamDebug, whitelist])

  useEffect(() => {
    if (!streamCtx) return

    abortRef.current = false
    abortCtrlRef.current?.abort()
    const ctrl = new AbortController()
    abortCtrlRef.current = ctrl

    continuationMapRef.current = new Map()
    totalVariantsRef.current = 0
    setVariants([])
    setActiveTab(0)
    setIsDone(false)
    setStreamError(null)
    setStreamDebug(null)
    setIsQuotaExhausted(false)
    setShowFeedbackForm(false)

    const consume = async () => {
      try {
        for await (const event of streamContinuation(streamCtx.novelId, streamCtx.params, { signal: ctrl.signal })) {
          if (abortRef.current || ctrl.signal.aborted) break

          switch (event.type) {
            case 'start':
              totalVariantsRef.current = event.total_variants
              if ('debug' in event) setStreamDebug((event as { debug: ContinueDebugSummary }).debug)
              setVariants(
                Array.from({ length: event.total_variants }, () => ({
                  content: '',
                  continuationId: null,
                  isStreaming: true,
                  error: null,
                })),
              )
              break
            case 'token':
              setVariants((prev) => prev.map((variant, index) => (
                index === event.variant
                  ? { ...variant, content: variant.content + event.content }
                  : variant
              )))
              break
            case 'variant_done':
              continuationMapRef.current.set(event.variant, event.continuation_id)
              setVariants((prev) => prev.map((variant, index) => (
                index === event.variant
                  ? {
                    ...variant,
                    content: event.content ?? variant.content,
                    continuationId: event.continuation_id,
                    isStreaming: false,
                    error: null,
                  }
                  : variant
              )))
              break
            case 'done': {
              setIsDone(true)
              const doneDebug = 'debug' in event ? (event as { debug: ContinueDebugSummary }).debug : null
              if (doneDebug) setStreamDebug(doneDebug)

              const total = totalVariantsRef.current
              const entries = Array.from(continuationMapRef.current.entries()).sort((a, b) => a[0] - b[0])
              const mapping = entries.map(([variant, id]) => `${variant}:${id}`).join(',')

              if (mapping && total && activeChapterNum !== null) {
                if (doneDebug) saveGenerationResultsDebug(novelId, mapping, doneDebug)

                const currentSearchParams = new URLSearchParams(latestLocationRef.current.search)
                const currentStage = currentSearchParams.get('stage')
                let nextSearchParams = new URLSearchParams(currentSearchParams)

                if (currentStage === 'results' || currentStage == null) {
                  nextSearchParams = setResultsProvenanceSearchParams(nextSearchParams, null)
                  nextSearchParams.set('continuations', mapping)
                  nextSearchParams.set('total_variants', String(total))
                } else {
                  nextSearchParams = setResultsProvenanceSearchParams(nextSearchParams, {
                    chapterNum: activeChapterNum,
                    continuations: mapping,
                    totalVariants: total,
                  })
                }
                navigate(
                  {
                    pathname: latestLocationRef.current.pathname,
                    search: nextSearchParams.toString(),
                  },
                  { replace: true, state: null },
                )
              }
              break
            }
            case 'error':
              if (event.variant != null) {
                setVariants((prev) => prev.map((variant, index) => (
                  index === event.variant
                    ? { ...variant, error: event.message, isStreaming: false }
                    : variant
                )))
              } else {
                setStreamError(event.message)
              }
              break
          }
        }
      } catch (err) {
        if (abortRef.current || ctrl.signal.aborted) return
        if (err instanceof ApiError && err.status === 429) {
          setIsQuotaExhausted(true)
          setStreamError(t('continuation.results.quotaExhausted'))
        } else if (err instanceof ApiError) {
          const llmMessage = getLlmApiErrorMessage(err, locale)
          if (llmMessage) {
            setStreamError(llmMessage)
          } else if (err.status === 503) {
            setStreamError(t('continuation.results.serviceBusy'))
          } else {
            setStreamError(t('continuation.results.requestFailed', { status: err.status }))
          }
        } else {
          setStreamError(err instanceof Error ? err.message : 'Stream failed')
        }
      }
    }

    void consume()
    return () => {
      abortRef.current = true
      ctrl.abort()
    }
  }, [activeChapterNum, locale, navigate, novelId, streamAttempt, streamCtx, t])

  useEffect(() => {
    if (!isReloadMode || !persisted) return

    const storedDebug = readGenerationResultsDebug(novelId, persisted)
    setPersistedDebug(storedDebug)
    setReloadedWarnings(readGenerationResultsWarnings(novelId, persisted))

    const ids = persisted
      .split(',')
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map((pair) => {
        const [, idRaw] = pair.split(':')
        return Number.parseInt((idRaw ?? '').trim(), 10)
      })
      .filter((id) => Number.isFinite(id))

    if (ids.length === 0) {
      setPersistedError('Invalid continuation link')
      return
    }

    setPersistedVersions(null)
    setPersistedError(null)
    api.getContinuations(novelId, ids)
      .then(setPersistedVersions)
      .catch((err) => setPersistedError(err instanceof Error ? err.message : 'Failed to load continuations'))
  }, [isReloadMode, novelId, persisted, reloadAttempt])

  const currentVariant = isStreamMode ? variants[activeTab] : undefined
  const currentLegacyVersion = isLegacyMode ? nonStreamVersions[activeTab] : undefined
  const currentContinuationId = currentVariant?.continuationId ?? currentLegacyVersion?.id ?? null
  const rawCurrentContent = currentVariant?.content ?? currentLegacyVersion?.content ?? ''
  const currentContent = currentContinuationId != null
    ? continuationContentOverrides[currentContinuationId] ?? rawCurrentContent
    : rawCurrentContent
  const allDone = isLegacyMode || isDone
  const tabCount = isStreamMode ? variants.length : nonStreamVersions.length

  const debug = isStreamMode ? streamDebug : legacyResponse?.debug ?? persistedDebug ?? scopedStudioResultsDebug
  const summary = debug
    ? {
      entities: debug.injected_entities.length,
      relationships: debug.injected_relationships.length,
      systems: debug.injected_systems.length,
    }
    : null

  useEffect(() => {
    onDebugChange(debug)
  }, [debug, onDebugChange])

  const canEditCurrentContent = allDone && currentContinuationId != null

  const handleCurrentContentChange = useCallback((value: string) => {
    if (currentContinuationId == null) return
    setContinuationContentOverrides((prev) => ({ ...prev, [currentContinuationId]: value }))
  }, [currentContinuationId])

  const persistCurrentContent = useCallback(async () => {
    if (!canEditCurrentContent || currentContinuationId == null || !currentContent || currentContent === rawCurrentContent) return
    const updated = await api.updateContinuation(novelId, currentContinuationId, currentContent)
    setContinuationContentOverrides((prev) => ({ ...prev, [updated.id]: updated.content }))
    setVariants((prev) => prev.map((variant) => (
      variant.continuationId === updated.id ? { ...variant, content: updated.content } : variant
    )))
    setPersistedVersions((prev) => prev?.map((item) => (
      item.id === updated.id ? { ...item, content: updated.content } : item
    )) ?? prev)
  }, [canEditCurrentContent, currentContent, currentContinuationId, novelId, rawCurrentContent])

  const handleAdopt = useCallback(() => {
    if (!currentContent) return
    createChapter.mutate(
      { content: currentContent, chapter_number: (latestChapterNum ?? 0) + 1 },
      {
        onSuccess: (chapter) => {
          const currentDebug = isStreamMode ? streamDebug : legacyResponse?.debug ?? persistedDebug ?? scopedStudioResultsDebug
          const allWarnings = currentDebug?.drift_warnings ?? (reloadedWarnings.length > 0 ? reloadedWarnings : undefined)
          if (allWarnings?.length) {
            const targetVersion = activeTab + 1
            const activeWarnings = allWarnings.filter(
              (warning) => (warning.version == null || warning.version === targetVersion) && !whitelist.includes(warning.term),
            )
            if (activeWarnings.length > 0) {
              setActiveWarnings(novelId, chapter.chapter_number, activeWarnings, chapter.created_at)
            }
          }
          navigate(`/novel/${novelId}?chapter=${chapter.chapter_number}`, { state: null })
        },
      },
    )
  }, [
    activeTab,
    createChapter,
    currentContent,
    isStreamMode,
    latestChapterNum,
    legacyResponse?.debug,
    navigate,
    novelId,
    persistedDebug,
    reloadedWarnings,
    scopedStudioResultsDebug,
    streamDebug,
    whitelist,
  ])

  const handleDeAi = useCallback(async () => {
    if (!currentContinuationId || !currentContent || !allDone) return
    setDeAiOpen(true)
    setDeAiLoading(true)
    setDeAiError(null)
    setDeAiPreview(null)
    try {
      await persistCurrentContent()
      const preview = await api.deAiContinuation(novelId, currentContinuationId)
      setDeAiPreview(preview)
    } catch (err) {
      if (err instanceof ApiError) {
        const llmMessage = getLlmApiErrorMessage(err, locale)
        setDeAiError(llmMessage ?? t('continuation.results.deAiFailed'))
      } else {
        setDeAiError(err instanceof Error ? err.message : t('continuation.results.deAiFailed'))
      }
    } finally {
      setDeAiLoading(false)
    }
  }, [allDone, currentContent, currentContinuationId, locale, novelId, persistCurrentContent, t])

  const handleAcceptDeAi = useCallback(async () => {
    if (!deAiPreview) return
    setDeAiAdopting(true)
    setDeAiError(null)
    try {
      const updated = await api.updateContinuation(novelId, deAiPreview.continuation_id, deAiPreview.polished_content)
      setContinuationContentOverrides((prev) => ({ ...prev, [updated.id]: updated.content }))
      setVariants((prev) => prev.map((variant) => (
        variant.continuationId === updated.id ? { ...variant, content: updated.content } : variant
      )))
      setPersistedVersions((prev) => prev?.map((item) => (
        item.id === updated.id ? { ...item, content: updated.content } : item
      )) ?? prev)
      setDeAiOpen(false)
      setDeAiPreview(null)
    } catch (err) {
      setDeAiError(err instanceof Error ? err.message : t('continuation.results.deAiAdoptFailed'))
    } finally {
      setDeAiAdopting(false)
    }
  }, [deAiPreview, novelId, t])

  const handleLoadReviewModels = useCallback(async () => {
    setReviewModelsLoading(true)
    try {
      const res = await api.listLlmModels()
      setReviewModelOptions(res.models.map((item) => item.id).filter(Boolean))
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : t('continuation.results.reviewModelsFailed'))
    } finally {
      setReviewModelsLoading(false)
    }
  }, [t])

  const handleOpenReview = useCallback(() => {
    setReviewOpen(true)
    setReviewError(null)
    if (reviewModelOptions.length === 0 && !reviewModelsLoading) {
      void handleLoadReviewModels()
    }
  }, [handleLoadReviewModels, reviewModelOptions.length, reviewModelsLoading])

  const handleSubmitReview = useCallback(async () => {
    if (currentContinuationId == null || !currentContent.trim()) {
      setReviewError(t('continuation.results.reviewNotReady'))
      return
    }
    setReviewLoading(true)
    setReviewError(null)
    setReviewPreview(null)
    try {
      await persistCurrentContent()
      const preview = await api.reviewContinuation(novelId, currentContinuationId, reviewerModel.trim())
      setReviewPreview(preview)
    } catch (err) {
      if (err instanceof ApiError) {
        const llmMessage = getLlmApiErrorMessage(err, locale)
        setReviewError(llmMessage ?? t('continuation.results.reviewFailed'))
      } else {
        setReviewError(err instanceof Error ? err.message : t('continuation.results.reviewFailed'))
      }
    } finally {
      setReviewLoading(false)
    }
  }, [currentContent, currentContinuationId, locale, novelId, persistCurrentContent, reviewerModel, t])

  const handleRewriteFromReview = useCallback(async () => {
    if (!reviewPreview || currentContinuationId == null) return
    setReviewRewriting(true)
    setReviewError(null)
    try {
      const updated = await api.rewriteContinuationWithReview(
        novelId,
        currentContinuationId,
        reviewPreview.review_text,
        reviewPreview.rewrite_instruction,
      )
      setContinuationContentOverrides((prev) => ({ ...prev, [updated.id]: updated.content }))
      setVariants((prev) => prev.map((variant, index) => (
        index === activeTab ? { ...variant, continuationId: updated.id, content: updated.content, isStreaming: false, error: null } : variant
      )))
      setPersistedVersions((prev) => {
        const base = prev ?? nonStreamVersions
        if (base.length === 0) return prev
        return base.map((item, index) => (index === activeTab ? updated : item))
      })

      const nextSearchParams = new URLSearchParams(location.search)
      const mappingRaw = nextSearchParams.get('continuations')
      if (mappingRaw) {
        const nextMapping = mappingRaw
          .split(',')
          .map((pair) => pair.trim())
          .filter(Boolean)
          .map((pair) => {
            const [variantRaw, idRaw] = pair.split(':')
            const variant = Number.parseInt((variantRaw ?? '').trim(), 10)
            const id = Number.parseInt((idRaw ?? '').trim(), 10)
            if (variant === activeTab || id === currentContinuationId) return `${Number.isFinite(variant) ? variant : activeTab}:${updated.id}`
            return pair
          })
          .join(',')
        if (nextMapping) {
          nextSearchParams.set('continuations', nextMapping)
          navigate(
            { pathname: location.pathname, search: nextSearchParams.toString() },
            { replace: true, state: null },
          )
        }
      }

      setReviewOpen(false)
      setReviewPreview(null)
    } catch (err) {
      if (err instanceof ApiError) {
        const llmMessage = getLlmApiErrorMessage(err, locale)
        setReviewError(llmMessage ?? t('continuation.results.rewriteFailed'))
      } else {
        setReviewError(err instanceof Error ? err.message : t('continuation.results.rewriteFailed'))
      }
    } finally {
      setReviewRewriting(false)
    }
  }, [activeTab, currentContinuationId, locale, location.pathname, location.search, navigate, nonStreamVersions, novelId, reviewPreview, t])

  const handleExportAll = () => {
    const versions = isStreamMode ? variants : nonStreamVersions
    if (versions.length === 0) return
    const content = versions
      .map((variant, index) => {
        const id = isStreamMode ? (variant as VariantState).continuationId : (variant as Continuation).id
        const versionContent = id != null ? continuationContentOverrides[id] ?? variant.content : variant.content
        return `${t('continuation.results.exportVersionHeader', { n: index + 1 })}\n\n${versionContent}\n`
      })
      .join('\n\n')
    downloadTextFile(`continuation_versions_${new Date().toISOString().slice(0, 10)}.txt`, content)
  }

  const handleFeedbackSubmit = async (answers: FeedbackAnswers) => {
    setFeedbackSubmitting(true)
    try {
      await api.submitFeedback(answers)
      await refreshQuota()
      setShowFeedbackForm(false)
      setIsQuotaExhausted(false)
      setStreamError(null)
      setStreamAttempt((value) => value + 1)
    } finally {
      setFeedbackSubmitting(false)
    }
  }

  const renderCurrentContent = (annotations?: TextAnnotation[]) => {
    if (canEditCurrentContent) {
      return (
        <textarea
          data-testid="continuation-result-editor"
          value={currentContent}
          onChange={(event) => handleCurrentContentChange(event.target.value)}
          onBlur={() => { void persistCurrentContent().catch(() => undefined) }}
          aria-label={t('continuation.results.badge')}
          placeholder={t('continuation.results.emptyContent')}
          className="nw-scrollbar-thin flex-1 min-h-0 w-full resize-none overflow-y-auto rounded-xl border border-[var(--nw-glass-border)] bg-[hsl(var(--background)/0.35)] px-5 py-4 text-[15px] leading-8 text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-[hsl(var(--accent)/0.45)] focus:bg-[hsl(var(--background)/0.5)] focus:ring-2 focus:ring-[hsl(var(--accent)/0.16)]"
        />
      )
    }

    return (
      <PlainTextContent
        content={currentContent}
        className="flex-1 min-h-0 overflow-y-auto nw-scrollbar-thin"
        emptyLabel={t('continuation.results.emptyContent')}
        annotations={annotations}
      />
    )
  }

  if (!isStreamMode && !isLegacyMode) {
    if (isReloadMode && !persistedError && !persistedVersions) {
      return (
        <div className="flex flex-1 items-center justify-center flex-col gap-4">
          <Loader2 size={24} className="animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{t('continuation.results.loading')}</span>
        </div>
      )
    }

    if (isReloadMode && persistedError) {
      return (
        <div className="flex flex-1 items-center justify-center flex-col gap-4">
          <span className="text-sm text-destructive">{persistedError}</span>
          <div className="flex items-center gap-3">
            <NwButton
              onClick={() => setReloadAttempt((value) => value + 1)}
              variant="accent"
              className="rounded-[10px] px-5 py-2.5 text-sm font-semibold shadow-[0_0_18px_hsl(var(--accent)/0.25)]"
            >
              {t('continuation.results.retry')}
            </NwButton>
            <NwButton
              onClick={() => navigate(`/novel/${novelId}`, { state: null })}
              variant="glass"
              className="rounded-[10px] px-5 py-2.5 text-sm font-semibold"
            >
              {t('continuation.results.back')}
            </NwButton>
          </div>
        </div>
      )
    }

    return (
      <div className="flex flex-1 items-center justify-center flex-col gap-4">
        <span className="text-sm text-muted-foreground">{t('continuation.results.noResults')}</span>
        <NwButton
          onClick={() => navigate(`/novel/${novelId}`, { state: null })}
          variant="accent"
          className="rounded-[10px] px-5 py-2.5 text-sm font-semibold shadow-[0_0_18px_hsl(var(--accent)/0.25)]"
        >
          {t('continuation.results.returnToWorkspace')}
        </NwButton>
      </div>
    )
  }

  if (streamError) {
    return (
      <>
        <div className="flex flex-1 items-center justify-center flex-col gap-5">
          <span className="text-base font-semibold text-destructive">{streamError}</span>

          {isQuotaExhausted && !user?.feedback_submitted ? (
            <div className="flex flex-col items-center gap-3 max-w-md text-center">
              <p className="text-sm text-muted-foreground">{t('continuation.results.quotaFeedback')}</p>
              <NwButton
                onClick={() => setShowFeedbackForm(true)}
                variant="accent"
                className="rounded-[10px] px-6 py-2.5 text-sm font-semibold shadow-[0_0_18px_hsl(var(--accent)/0.25)]"
              >
                <MessageSquarePlus size={16} />
                {t('continuation.results.submitFeedbackUnlock')}
              </NwButton>
            </div>
          ) : null}

          {isQuotaExhausted && user?.feedback_submitted ? (
            <div className="flex flex-col items-center gap-3 max-w-md text-center">
              <p className="text-sm text-muted-foreground">{t('continuation.results.feedbackAlreadyClaimed')}</p>
              <NwButton
                onClick={() => navigate('/settings')}
                variant="accent"
                className="rounded-[10px] px-6 py-2.5 text-sm font-semibold shadow-[0_0_18px_hsl(var(--accent)/0.25)]"
              >
                <Settings size={16} />
                {t('continuation.results.goToSettings')}
              </NwButton>
            </div>
          ) : null}

          {!isQuotaExhausted ? (
            <div className="flex items-center gap-3">
              <NwButton
                onClick={() => setStreamAttempt((value) => value + 1)}
                variant="accent"
                className="rounded-[10px] px-5 py-2.5 text-sm font-semibold shadow-[0_0_18px_hsl(var(--accent)/0.25)]"
              >
                {t('continuation.results.retry')}
              </NwButton>
              <NwButton
                onClick={() => navigate(`/novel/${novelId}?stage=write`, { state: null })}
                variant="glass"
                className="rounded-[10px] px-5 py-2.5 text-sm font-semibold"
              >
                {t('continuation.results.back')}
              </NwButton>
            </div>
          ) : null}

          {isQuotaExhausted ? (
            <NwButton
              onClick={() => navigate(`/novel/${novelId}`, { state: null })}
              variant="glass"
              className="rounded-[10px] px-5 py-2.5 text-sm font-semibold"
            >
              {t('continuation.results.returnToWorkspace')}
            </NwButton>
          ) : null}
        </div>

      {showFeedbackForm ? (
          <FeedbackForm
            onSubmit={handleFeedbackSubmit}
            onCancel={() => setShowFeedbackForm(false)}
            submitting={feedbackSubmitting}
          />
        ) : null}
      </>
    )
  }

  return (
    <>
      <div className="flex-1 min-w-0 flex flex-col gap-5 px-8 py-6 lg:px-12 overflow-hidden">
        <div className="shrink-0 border-b border-[var(--nw-glass-border)] pb-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-[var(--nw-glass-border)] bg-background/20 px-2.5 py-1 text-[11px] font-medium text-foreground/88">
                  {t('continuation.results.badge')}
                </span>
                {activeChapterNum !== null ? (
                  <span className="inline-flex items-center rounded-full border border-[var(--nw-glass-border)] bg-background/20 px-2.5 py-1 text-[11px] text-muted-foreground">
                    {t('continuation.results.continuationOf', { chapter: activeChapterReference ?? `Ch. ${activeChapterNum}` })}
                  </span>
                ) : null}
                {isStreamMode && !isDone ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--accent)/0.3)] bg-[hsl(var(--accent)/0.08)] px-2.5 py-1 text-[11px] text-accent">
                    <Loader2 size={10} className="animate-spin" />
                    {t('continuation.results.generating')}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap justify-end">
              <NwButton
                data-testid="results-adopt-button"
                onClick={handleAdopt}
                disabled={createChapter.isPending || !currentContent || !allDone}
                variant="accent"
                className="rounded-[10px] px-5 py-2.5 text-sm font-semibold shadow-[0_0_18px_hsl(var(--accent)/0.25)] disabled:cursor-default"
              >
                <Check size={16} />
                {t('continuation.results.adopt')}
              </NwButton>

              <NwButton
                data-testid="results-deai-button"
                onClick={handleDeAi}
                disabled={!currentContinuationId || !currentContent || !allDone || deAiLoading}
                variant="accentOutline"
                className="rounded-[10px] px-4 py-2 text-sm font-medium"
              >
                {deAiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {t('continuation.results.deAi')}
              </NwButton>

              <NwButton
                data-testid="results-review-button"
                onClick={handleOpenReview}
                disabled={!currentContinuationId || !currentContent || !allDone || reviewLoading}
                variant="accentOutline"
                className="rounded-[10px] px-4 py-2 text-sm font-medium"
              >
                {reviewLoading ? <Loader2 size={14} className="animate-spin" /> : <FileSearch size={14} />}
                {t('continuation.results.review')}
              </NwButton>

              <NwButton
                onClick={() => navigate(`/novel/${novelId}?stage=write`, { state: null })}
                variant="glass"
                className="rounded-[10px] px-4 py-2 text-sm font-medium"
              >
                <RefreshCw size={14} />
                {t('continuation.results.regenerate')}
              </NwButton>

              <NwButton
                onClick={handleExportAll}
                disabled={!allDone}
                variant="glass"
                className="rounded-[10px] px-4 py-2 text-sm font-medium"
              >
                <Upload size={14} />
                {t('continuation.results.exportAll')}
              </NwButton>
            </div>
          </div>
        </div>

        {tabCount > 0 ? (
          <div className="shrink-0 flex items-center">
            {Array.from({ length: tabCount }, (_, index) => {
              const variant = isStreamMode ? variants[index] : undefined
              const isActive = index === activeTab
              const isVariantStreaming = variant?.isStreaming
              const isVariantDone = isLegacyMode || variant?.continuationId != null
              const hasError = variant?.error

              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => setActiveTab(index)}
                  className={cn(
                    'px-6 py-2.5 text-sm border-b-2 transition-colors flex items-center gap-2',
                    isActive
                      ? 'border-b-accent text-foreground font-semibold'
                      : 'border-b-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t('continuation.results.version', { n: index + 1 })}
                  {isVariantStreaming ? <Loader2 size={14} className="animate-spin" /> : null}
                  {hasError ? <span className="text-destructive text-xs">!</span> : null}
                  {isVariantDone && !isVariantStreaming && !hasError && isStreamMode ? (
                    <Check size={14} className="text-green-500" />
                  ) : null}
                </button>
              )
            })}
          </div>
        ) : null}

        {isStreamMode ? (
          !currentVariant ? (
            <div className="flex-1 min-h-0 flex items-center justify-center">
              <Loader2 size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : currentVariant.error ? (
            <div className="flex-1 min-h-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <span className="text-sm text-destructive">{currentVariant.error}</span>
                <NwButton
                  onClick={() => setStreamAttempt((value) => value + 1)}
                  variant="accent"
                  className="rounded-[10px] px-5 py-2.5 text-sm font-semibold shadow-[0_0_18px_hsl(var(--accent)/0.25)]"
                >
                  {t('continuation.results.retry')}
                </NwButton>
              </div>
            </div>
          ) : currentContent || canEditCurrentContent ? (
            renderCurrentContent(driftAnnotations)
          ) : currentVariant.isStreaming || !currentVariant.continuationId ? (
            <div className="flex-1 min-h-0 flex items-center justify-center">
              <Loader2 size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : (
            <PlainTextContent
              content=""
              className="flex-1 min-h-0 overflow-y-auto nw-scrollbar-thin"
              emptyLabel={t('continuation.results.emptyContent')}
            />
          )
        ) : (
          renderCurrentContent(driftAnnotations)
        )}

        {summary ? (
          <button
            type="button"
            onClick={onToggleInjectionSummaryRail}
            className={cn(
              'shrink-0 rounded-[10px] border px-4 py-3 flex items-center justify-between gap-3 text-left transition-colors',
              showInjectionSummaryRail
                ? 'border-[hsl(var(--accent)/0.3)] bg-[hsl(var(--accent)/0.06)]'
                : 'border-[var(--nw-glass-border)] bg-[hsl(var(--background)/0.35)] hover:bg-[hsl(var(--background)/0.45)]',
            )}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Info size={14} className={showInjectionSummaryRail ? 'text-accent' : 'text-muted-foreground'} />
              <span className={cn('text-xs truncate', showInjectionSummaryRail ? 'text-accent' : 'text-muted-foreground')}>
                {t('continuation.results.injectionSummary', { entities: summary.entities, relationships: summary.relationships, systems: summary.systems })}
              </span>
            </div>
            {showInjectionSummaryRail ? (
              <ChevronDown size={14} className="text-accent shrink-0" />
            ) : (
              <ChevronRight size={14} className="text-muted-foreground shrink-0" />
            )}
          </button>
        ) : null}

        {(() => {
          const proseWarnings: ProseWarning[] | undefined = isStreamMode
            ? (isDone ? streamDebug?.prose_warnings : undefined)
            : (legacyResponse?.debug?.prose_warnings ?? persistedDebug?.prose_warnings ?? scopedStudioResultsDebug?.prose_warnings)
          const targetVersion = activeTab + 1
          const filtered = proseWarnings?.filter((w) => w.version == null || w.version === targetVersion) ?? []
          if (filtered.length === 0) return null
          return (
            <ProseWarningsPanel warnings={filtered} />
          )
        })()}
      </div>

      {deAiOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--nw-backdrop)] p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="flex h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[var(--nw-glass-border-hover)] bg-[hsl(var(--nw-modal-bg))] shadow-[0_24px_80px_var(--nw-backdrop)]">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--nw-glass-border)] px-5 py-4">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground">{t('continuation.results.deAiTitle')}</div>
                <div className="mt-1 text-xs text-muted-foreground">{t('continuation.results.deAiSubtitle')}</div>
              </div>
              <button
                type="button"
                onClick={() => setDeAiOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-[var(--nw-glass-bg-hover)] hover:text-foreground"
                aria-label={t('dialog.cancel')}
              >
                <X size={16} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden p-5">
              {deAiLoading ? (
                <div className="flex min-h-[360px] items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 size={18} className="animate-spin" />
                  {t('continuation.results.deAiProcessing')}
                </div>
              ) : deAiPreview ? (
                <div className="grid h-full min-h-0 gap-4 lg:grid-cols-2">
                  <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--nw-glass-border)] bg-background/20">
                    <div className="border-b border-[var(--nw-glass-border)] px-4 py-3 text-xs font-semibold text-muted-foreground">
                      {t('continuation.results.deAiOriginal')}
                    </div>
                    <div className="nw-scrollbar-thin min-h-0 flex-1 overflow-y-auto p-4 text-sm leading-8 text-foreground/85 whitespace-pre-wrap select-text">
                      {deAiPreview.original_content}
                    </div>
                  </div>
                  <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[hsl(var(--accent)/0.35)] bg-[hsl(var(--accent)/0.06)]">
                    <div className="border-b border-[hsl(var(--accent)/0.25)] px-4 py-3 text-xs font-semibold text-accent">
                      {t('continuation.results.deAiPolished')}
                    </div>
                    <div className="nw-scrollbar-thin min-h-0 flex-1 overflow-y-auto p-4 text-sm leading-8 text-foreground whitespace-pre-wrap select-text">
                      {deAiPreview.polished_content}
                    </div>
                  </div>
                </div>
              ) : null}

              {deAiError ? (
                <div className="mt-4 rounded-lg border border-[hsl(var(--color-warning)/0.35)] bg-[hsl(var(--color-warning)/0.10)] px-3 py-2 text-xs text-[hsl(var(--color-warning))]">
                  {deAiError}
                </div>
              ) : null}
            </div>

            <div className="flex justify-end gap-2 border-t border-[var(--nw-glass-border)] px-5 py-4">
              <NwButton
                onClick={() => setDeAiOpen(false)}
                variant="glass"
                className="rounded-[10px] px-4 py-2 text-sm font-medium"
              >
                {t('dialog.cancel')}
              </NwButton>
              <NwButton
                onClick={handleAcceptDeAi}
                disabled={!deAiPreview || deAiLoading || deAiAdopting}
                variant="accent"
                className="rounded-[10px] px-5 py-2 text-sm font-semibold"
              >
                {deAiAdopting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {t('continuation.results.adopt')}
              </NwButton>
            </div>
          </div>
        </div>
      ) : null}

        {reviewOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--nw-backdrop)] p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="flex h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[var(--nw-glass-border-hover)] bg-[hsl(var(--nw-modal-bg))] shadow-[0_24px_80px_var(--nw-backdrop)]">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--nw-glass-border)] px-5 py-4">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground">{t('continuation.results.reviewTitle')}</div>
                <div className="mt-1 text-xs text-muted-foreground">{t('continuation.results.reviewSubtitle')}</div>
              </div>
              <button
                type="button"
                onClick={() => setReviewOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-[var(--nw-glass-bg-hover)] hover:text-foreground"
                aria-label={t('dialog.cancel')}
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex shrink-0 flex-col gap-3 border-b border-[var(--nw-glass-border)] px-5 py-4 md:flex-row md:items-end">
              <div className="min-w-0 flex-1 space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="continuation-review-model">
                  {t('continuation.results.reviewModel')}
                </label>
                <input
                  id="continuation-review-model"
                  list="continuation-review-model-options"
                  value={reviewerModel}
                  onChange={(event) => setReviewerModel(event.target.value)}
                  placeholder={t('continuation.results.reviewModelAuto')}
                  className="h-10 w-full rounded-[10px] border border-[var(--nw-glass-border)] bg-background/25 px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-[hsl(var(--accent)/0.45)] focus:ring-2 focus:ring-[hsl(var(--accent)/0.16)]"
                />
                <datalist id="continuation-review-model-options">
                  {reviewModelOptions.map((model) => (
                    <option key={model} value={model} />
                  ))}
                </datalist>
              </div>
              <div className="flex gap-2">
                <NwButton
                  onClick={handleLoadReviewModels}
                  disabled={reviewModelsLoading}
                  variant="glass"
                  className="rounded-[10px] px-4 py-2 text-sm font-medium"
                >
                  {reviewModelsLoading ? <Loader2 size={14} className="animate-spin" /> : null}
                  {t('continuation.results.fetchModels')}
                </NwButton>
                <NwButton
                  onClick={handleSubmitReview}
                  disabled={reviewLoading}
                  variant="accent"
                  className="rounded-[10px] px-4 py-2 text-sm font-semibold"
                >
                  {reviewLoading ? <Loader2 size={14} className="animate-spin" /> : <FileSearch size={14} />}
                  {t('continuation.results.startReview')}
                </NwButton>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden p-5">
              {reviewLoading ? (
                <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 size={18} className="animate-spin" />
                  {t('continuation.results.reviewProcessing')}
                </div>
              ) : reviewPreview ? (
                <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                  <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--nw-glass-border)] bg-background/20">
                    <div className="border-b border-[var(--nw-glass-border)] px-4 py-3 text-xs font-semibold text-muted-foreground">
                      {t('continuation.results.reviewOriginal')}
                    </div>
                    <div className="nw-scrollbar-thin min-h-0 flex-1 overflow-y-auto p-4 text-sm leading-8 text-foreground/85 whitespace-pre-wrap select-text">
                      {reviewPreview.original_content}
                    </div>
                  </div>
                  <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[hsl(var(--accent)/0.35)] bg-[hsl(var(--accent)/0.06)]">
                    <div className="border-b border-[hsl(var(--accent)/0.25)] px-4 py-3 text-xs font-semibold text-accent">
                      {t('continuation.results.reviewReport')}
                    </div>
                    <div className="nw-scrollbar-thin min-h-0 flex-1 overflow-y-auto p-4 text-sm leading-8 text-foreground whitespace-pre-wrap select-text">
                      {reviewPreview.review_text}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  {t('continuation.results.reviewEmpty')}
                </div>
              )}

              {reviewError ? (
                <div className="mt-4 rounded-lg border border-[hsl(var(--color-warning)/0.35)] bg-[hsl(var(--color-warning)/0.10)] px-3 py-2 text-xs text-[hsl(var(--color-warning))]">
                  {reviewError}
                </div>
              ) : null}
            </div>

            <div className="flex justify-end gap-2 border-t border-[var(--nw-glass-border)] px-5 py-4">
              <NwButton
                onClick={() => setReviewOpen(false)}
                variant="glass"
                className="rounded-[10px] px-4 py-2 text-sm font-medium"
              >
                {t('dialog.cancel')}
              </NwButton>
              <NwButton
                onClick={handleRewriteFromReview}
                disabled={!reviewPreview || reviewLoading || reviewRewriting}
                variant="accent"
                className="rounded-[10px] px-5 py-2 text-sm font-semibold"
              >
                {reviewRewriting ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                {t('continuation.results.rewriteWithReview')}
              </NwButton>
            </div>
          </div>
        </div>
      ) : null}


      {showFeedbackForm ? (
        <FeedbackForm
          onSubmit={handleFeedbackSubmit}
          onCancel={() => setShowFeedbackForm(false)}
          submitting={feedbackSubmitting}
        />
      ) : null}
    </>
  )
}
