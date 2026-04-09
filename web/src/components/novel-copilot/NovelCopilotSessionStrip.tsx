import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUiLocale } from '@/contexts/UiLocaleContext'
import type { CopilotRunStatus, NovelCopilotSession } from '@/types/copilot'
import { getCopilotScopeLabel } from './novelCopilotHelpers'
import { getCopilotRunStatusMeta } from './novelCopilotView'
import {
  copilotHighlightLineClassName,
  copilotPillClassName,
  copilotPillInteractiveClassName,
  copilotSessionActiveClassName,
  copilotSessionInactiveClassName,
  copilotSessionRailClassName,
} from './novelCopilotChrome'

export function NovelCopilotSessionStrip({
  sessions,
  focusedSessionId,
  getSessionStatus,
  onFocusSession,
  onRemoveSession,
  onCreateSession,
}: {
  sessions: NovelCopilotSession[]
  focusedSessionId: string | null
  getSessionStatus: (sessionId: string) => CopilotRunStatus | null
  onFocusSession: (sessionId: string) => void
  onRemoveSession: (sessionId: string) => void
  onCreateSession: () => void
}) {
  const { locale, t } = useUiLocale()
  if (sessions.length === 0) return null

  return (
    <div
      className="shrink-0 border-b border-[var(--nw-copilot-border)] bg-[linear-gradient(180deg,hsl(var(--background)/0.16),transparent)] px-4 py-3"
      data-testid="novel-copilot-session-strip"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/68">
            {t('copilot.sessionStrip.title')}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground/62">
            {t('copilot.sessionStrip.hint')}
          </div>
        </div>
        <div className={cn('inline-flex items-center rounded-full px-2 py-1 text-[10px] font-medium text-muted-foreground', copilotPillClassName)}>
          {t('copilot.drawer.sessionsCount', { count: sessions.length })}
        </div>
      </div>
      <div className={cn('rounded-[24px] p-2.5', copilotSessionRailClassName)}>
        <div className="flex gap-2.5 overflow-x-auto scrollbar-hide snap-x snap-mandatory">
          {sessions.map((session) => {
            const isFocused = session.sessionId === focusedSessionId
            const statusMeta = getCopilotRunStatusMeta(getSessionStatus(session.sessionId), locale)

            return (
              <div
                key={session.sessionId}
                className={cn(
                  'group relative min-w-[172px] max-w-[224px] shrink-0 snap-start overflow-hidden rounded-[20px] p-0 text-left transition-all duration-300',
                  isFocused
                    ? cn(copilotSessionActiveClassName, '-translate-y-0.5')
                    : cn(copilotSessionInactiveClassName, 'hover:-translate-y-0.5 hover:border-[var(--nw-copilot-border-strong)] hover:[background:var(--nw-copilot-pill-hover-bg)]'),
                )}
                data-testid={`novel-copilot-session-${session.sessionId}`}
                data-state={isFocused ? 'active' : 'inactive'}
              >
                <button
                  type="button"
                  onClick={() => onFocusSession(session.sessionId)}
                  className="block w-full px-3.5 py-3 pr-10 text-left"
                >
                  <div className={cn(
                    'pointer-events-none absolute inset-x-3 top-0 h-px opacity-70',
                    copilotHighlightLineClassName,
                    isFocused && 'opacity-95',
                  )} />
                  <div className={cn('pointer-events-none absolute inset-x-6 bottom-0 h-px opacity-55', copilotHighlightLineClassName)} />
                  <div className="mb-2 flex items-center gap-1.5">
                    <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', statusMeta.dotClassName)} />
                    <span className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/72">
                      {getCopilotScopeLabel(session.prefill, locale)}
                    </span>
                  </div>
                  <div className="truncate text-sm font-semibold text-foreground">
                    {session.displayTitle}
                  </div>
                  <div className="mt-2.5 flex items-center gap-2">
                    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em]', copilotPillClassName, statusMeta.toneClassName)}>
                      {statusMeta.label}
                    </span>
                    {isFocused ? (
                      <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-foreground/82', copilotPillClassName)}>
                        {t('copilot.sessionStrip.current')}
                      </span>
                    ) : null}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    onRemoveSession(session.sessionId)
                  }}
                  aria-label={t('copilot.sessionStrip.close')}
                  data-role="close-session"
                  className={cn(
                    'absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground/72 transition-all hover:text-foreground',
                    copilotPillInteractiveClassName,
                    !isFocused && 'opacity-80 group-hover:opacity-100 group-focus-within:opacity-100',
                  )}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })}
          <button
            type="button"
            onClick={onCreateSession}
            aria-label={t('copilot.sessionStrip.create')}
            data-testid="novel-copilot-create-session"
            className={cn(
              'group shrink-0 self-center rounded-full border border-dashed transition-all duration-300 hover:-translate-y-0.5 hover:border-[var(--nw-copilot-border-strong)] hover:[background:var(--nw-copilot-pill-hover-bg)]',
              copilotSessionInactiveClassName,
            )}
            title={t('copilot.sessionStrip.create')}
          >
            <span
              className={cn(
                'inline-flex h-12 w-12 items-center justify-center rounded-full text-foreground/86',
                copilotPillInteractiveClassName,
              )}
            >
              <Plus className="h-5 w-5" />
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
