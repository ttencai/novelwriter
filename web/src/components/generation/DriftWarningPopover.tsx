import { GlassSurface } from '@/components/ui/glass-surface'

const WARNING_LABELS: Record<string, string> = {
  unknown_term_quoted: '未知名词',
  unknown_term_bracketed: '未知名词',
  unknown_term_named: '未知称谓',
  unknown_address_token: '未知称谓',
}

export function DriftWarningPopover({
  code,
  term,
  onDismiss,
}: {
  code: string
  term: string
  onDismiss: () => void
}) {
  const label = WARNING_LABELS[code] ?? '未知词汇'

  return (
    <GlassSurface
      variant="floating"
      className="rounded-xl px-4 py-3 max-w-xs flex items-center gap-3"
    >
      <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-[hsl(217,91%,60%,0.2)] text-[hsl(217,91%,80%)]">
        {label}
      </span>
      <span className="text-sm font-semibold text-foreground">{term}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm px-1"
      >
        忽略
      </button>
    </GlassSurface>
  )
}
