import { cn } from '@/lib/utils'
import { useUiLocale } from '@/contexts/UiLocaleContext'
import { useWorldEntities } from '@/hooks/world/useEntities'
import { useWorldRelationships } from '@/hooks/world/useRelationships'
import { useWorldSystems } from '@/hooks/world/useSystems'

export type DraftReviewKind = 'entities' | 'relationships' | 'systems'

export function DraftReviewSummaryCard({
  novelId,
  onOpen,
  className,
}: {
  novelId: number
  onOpen: (kind?: DraftReviewKind) => void
  className?: string
}) {
  const { t } = useUiLocale()
  const { data: draftEntities = [] } = useWorldEntities(novelId, { status: 'draft' })
  const { data: draftRelationships = [] } = useWorldRelationships(novelId, { status: 'draft' })
  const { data: draftSystems = [] } = useWorldSystems(novelId, { status: 'draft' })

  const total = draftEntities.length + draftRelationships.length + draftSystems.length

  if (total === 0) return null

  return (
    <div
      className={cn('flex items-center gap-1.5 px-3 py-2', className)}
      data-testid="draft-review-summary-card"
    >
      <span className="text-xs font-medium text-foreground">{t('worldModel.common.draftReview')}</span>
      <span className="text-xs tabular-nums text-[hsl(var(--color-status-draft))]">{total}</span>
      <span className="text-xs text-muted-foreground/50">·</span>
      <CountSpan label={t('worldModel.common.entities')} count={draftEntities.length} onClick={() => onOpen('entities')} />
      <span className="text-xs text-muted-foreground/50">·</span>
      <CountSpan label={t('worldModel.common.relationships')} count={draftRelationships.length} onClick={() => onOpen('relationships')} />
      <span className="text-xs text-muted-foreground/50">·</span>
      <CountSpan label={t('worldModel.common.systems')} count={draftSystems.length} onClick={() => onOpen('systems')} />
      <button
        type="button"
        className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => onOpen()}
      >
        {t('worldModel.draftReview.viewAll')}
      </button>
    </div>
  )
}

function CountSpan({ label, count, onClick }: { label: string; count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      className={cn(
        'text-xs tabular-nums transition-colors',
        count > 0
          ? 'text-muted-foreground hover:text-foreground'
          : 'text-muted-foreground/40',
      )}
      onClick={onClick}
      disabled={count === 0}
    >
      {label} {count}
    </button>
  )
}
