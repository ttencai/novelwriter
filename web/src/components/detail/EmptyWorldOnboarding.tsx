import { Sparkles, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GlassSurface } from '@/components/ui/glass-surface'
import { useUiLocale } from '@/contexts/UiLocaleContext'

export function EmptyWorldOnboarding({
  className,
  onGenerate,
  onBootstrap,
  onDismiss,
  bootstrapPending,
  bootstrapError,
}: {
  className?: string
  onGenerate: () => void
  onBootstrap: () => void
  onDismiss: () => void
  bootstrapPending?: boolean
  bootstrapError?: string | null
}) {
  const { t } = useUiLocale()
  return (
    <div className={cn('flex flex-1 items-center justify-center px-8 py-10', className)} data-testid="world-onboarding">
      <div className="w-full max-w-4xl space-y-6">
        <div className="space-y-2">
          <div className="text-2xl font-light text-foreground tracking-tight">
            {t('worldModel.onboarding.title')}
          </div>
          <div className="text-sm text-muted-foreground">
            {t('worldModel.onboarding.description')}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <GlassSurface
            asChild
            variant="container"
            hoverable
            className="nw-preserve-backdrop-blur rounded-2xl p-6 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <button
              type="button"
              onClick={onGenerate}
              data-testid="world-onboarding-generate"
            >
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-xl bg-[hsl(var(--color-accent)/0.18)] border border-[hsl(var(--color-accent)/0.28)] flex items-center justify-center text-[hsl(var(--color-accent))]">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="text-base font-semibold text-foreground">{t('worldModel.onboarding.generateTitle')}</div>
                  <div className="text-sm text-muted-foreground">
                    {t('worldModel.onboarding.generateDescription')}
                  </div>
                </div>
              </div>
            </button>
          </GlassSurface>

          <GlassSurface
            asChild
            variant="container"
            hoverable
            className="nw-preserve-backdrop-blur rounded-2xl p-6 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <button
              type="button"
              onClick={onBootstrap}
              disabled={bootstrapPending}
              data-testid="world-onboarding-bootstrap"
            >
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-xl bg-[hsl(var(--foreground)/0.08)] border border-[var(--nw-glass-border)] flex items-center justify-center text-foreground/80">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="text-base font-semibold text-foreground">{t('worldModel.onboarding.extractTitle')}</div>
                  <div className="text-sm text-muted-foreground">
                    {t('worldModel.onboarding.extractDescription')}
                  </div>
                  {bootstrapPending ? (
                    <div className="text-xs text-muted-foreground pt-1">{t('worldModel.common.processing')}</div>
                  ) : null}
                </div>
              </div>
            </button>
          </GlassSurface>
        </div>

        {bootstrapError ? (
          <div className="rounded-xl border border-[hsl(var(--color-warning)/0.35)] bg-[hsl(var(--color-warning)/0.08)] px-4 py-3 text-sm text-[hsl(var(--color-warning))] whitespace-pre-wrap">
            {bootstrapError}
          </div>
        ) : null}

        <div className="pt-1">
          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4"
            onClick={onDismiss}
            data-testid="world-onboarding-dismiss"
          >
            {t('worldModel.onboarding.dismiss')}
          </button>
        </div>
      </div>
    </div>
  )
}
