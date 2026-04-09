import { useMemo, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUiLocale } from '@/contexts/UiLocaleContext'
import {
  copilotPanelClassName,
  copilotPillClassName,
  copilotPillInteractiveClassName,
} from './novelCopilotChrome'

export function NovelCopilotModelPicker({
  value,
  options,
  loading = false,
  disabled = false,
  onChange,
}: {
  value: string
  options: string[]
  loading?: boolean
  disabled?: boolean
  onChange: (nextValue: string) => void
}) {
  const { t } = useUiLocale()
  const [open, setOpen] = useState(false)

  const resolvedOptions = useMemo(() => {
    const next = Array.from(new Set(options.filter(Boolean)))
    if (value && !next.includes(value)) next.unshift(value)
    return next
  }, [options, value])

  const selectedLabel = loading
    ? t('copilot.drawer.modelLoading')
    : value || t('copilot.drawer.modelAuto')

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'flex h-11 w-full items-center justify-between gap-3 rounded-[16px] px-3 text-left text-sm text-foreground/88 outline-none disabled:cursor-not-allowed disabled:opacity-60',
            copilotPanelClassName,
            !disabled && 'transition-all duration-300 hover:border-[var(--nw-copilot-border-strong)] hover:bg-[var(--nw-copilot-pill-hover-bg)] focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent)/0.28)] focus-visible:ring-offset-0',
          )}
          aria-label={t('copilot.drawer.modelLabel')}
          aria-expanded={open}
          data-testid="copilot-model-select"
        >
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-foreground/90">{selectedLabel}</div>
          </div>
          <span className={cn('inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full', copilotPillClassName)}>
            <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform duration-200', open && 'rotate-180')} />
          </span>
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          sideOffset={10}
          align="start"
          className={cn(
            'z-50 w-[var(--radix-popover-trigger-width)] rounded-[20px] p-2',
            copilotPanelClassName,
          )}
        >
          <div className="mb-2 flex items-center justify-between px-2 pt-1">
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground/72">
              {t('copilot.drawer.modelLabel')}
            </div>
            <div className="text-[10px] text-muted-foreground/60">
              {resolvedOptions.length + 1}
            </div>
          </div>

          <div className="space-y-1">
            <button
              type="button"
              onClick={() => {
                onChange('')
                setOpen(false)
              }}
              className={cn(
                'flex w-full items-center justify-between gap-3 rounded-[16px] px-3 py-2.5 text-left text-sm text-foreground/85',
                copilotPillInteractiveClassName,
              )}
            >
              <span className="truncate">{t('copilot.drawer.modelAuto')}</span>
              {!value ? <Check className="h-4 w-4 shrink-0 text-[hsl(var(--accent))]" /> : null}
            </button>

            {resolvedOptions.map((model) => {
              const selected = model === value
              return (
                <button
                  key={model}
                  type="button"
                  onClick={() => {
                    onChange(model)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-[16px] px-3 py-2.5 text-left text-sm text-foreground/85',
                    copilotPillInteractiveClassName,
                    selected && 'border-[var(--nw-copilot-border-strong)] bg-[var(--nw-copilot-session-active-bg)]',
                  )}
                >
                  <span className="truncate">{model}</span>
                  {selected ? <Check className="h-4 w-4 shrink-0 text-[hsl(var(--accent))]" /> : null}
                </button>
              )
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
