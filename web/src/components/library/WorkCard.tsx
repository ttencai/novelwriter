import { Link } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { GlassCard } from '@/components/GlassCard'
import { useUiLocale } from '@/contexts/UiLocaleContext'
import { NwButton } from '@/components/ui/nw-button'
import { formatRelativeTime } from '@/lib/formatRelativeTime'
import { translateUiMessage } from '@/lib/uiMessages'
import type { Novel } from '@/types/api'

export function WorkCard({
  novel,
  onDelete,
}: {
  novel: Novel
  onDelete: (id: number) => void
}) {
  const { locale } = useUiLocale()

  return (
    <Link to={`/novel/${novel.id}`} className="block no-underline">
      <GlassCard hoverable className="p-6 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h3 className="font-mono text-lg font-semibold text-foreground truncate">
            {novel.title}
          </h3>
          <div className="text-sm text-muted-foreground">
            {translateUiMessage(locale, 'library.workCard.meta', {
              chapterCount: novel.total_chapters,
              relativeTime: formatRelativeTime(novel.updated_at, locale),
            })}
          </div>
        </div>

        {novel.author ? (
          <p className="text-sm text-muted-foreground nw-line-clamp-2">
            {novel.author}
          </p>
        ) : null}

        <div className="mt-auto flex justify-end">
          <NwButton
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onDelete(novel.id)
            }}
            variant="dangerSoft"
            className="rounded-lg px-3 py-1.5 text-sm"
          >
            <Trash2 size={14} />
            {translateUiMessage(locale, 'library.workCard.delete')}
          </NwButton>
        </div>
      </GlassCard>
    </Link>
  )
}
