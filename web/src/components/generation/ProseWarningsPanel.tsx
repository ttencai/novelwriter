// SPDX-FileCopyrightText: 2026 Isaac.X.Ω.Yuan
// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { renderWarningMessage } from '@/lib/warningMessages'
import type { ProseWarning } from '@/types/api'

const RULE_CODE_LABELS: Record<string, string> = {
  repeated_ngram: '重复短语',
  long_paragraph: '段落过长',
  abnormal_sentence_length: '句子过长',
  summary_tone: '总结式语气',
}

function ruleLabel(code: string): string {
  return RULE_CODE_LABELS[code] ?? code
}

export function ProseWarningsPanel({ warnings }: { warnings: ProseWarning[] }) {
  const [isOpen, setIsOpen] = useState(false)
  const groupedWarnings = warnings.reduce<Map<string, ProseWarning[]>>((groups, warning) => {
    const existing = groups.get(warning.code)
    if (existing) {
      existing.push(warning)
    } else {
      groups.set(warning.code, [warning])
    }
    return groups
  }, new Map())

  if (warnings.length === 0) return null

  return (
    <div
      className={cn(
        'shrink-0 rounded-[10px] border overflow-hidden transition-colors',
        isOpen
          ? 'border-[hsl(var(--color-status-draft)/0.4)] bg-[hsl(var(--color-status-draft)/0.04)]'
          : 'border-[var(--nw-glass-border)] bg-[hsl(var(--background)/0.35)]',
      )}
    >
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className={cn(
          'w-full px-4 py-3 flex items-center justify-between gap-3 text-left transition-colors',
          !isOpen && 'hover:bg-[hsl(var(--background)/0.45)]',
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle
            size={14}
            className={isOpen ? 'text-[hsl(var(--color-status-draft))]' : 'text-muted-foreground'}
          />
          <span
            className={cn(
              'text-xs truncate',
              isOpen ? 'text-[hsl(var(--color-status-draft))]' : 'text-muted-foreground',
            )}
          >
            文本质量检查（{warnings.length} 项提示）
          </span>
        </div>
        {isOpen ? (
          <ChevronDown size={14} className="text-[hsl(var(--color-status-draft))] shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-muted-foreground shrink-0" />
        )}
      </button>

      {isOpen ? (
        <div className="px-4 pb-3 space-y-3">
          {Array.from(groupedWarnings.entries()).map(([code, items]) => (
            <div key={code} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-[hsl(var(--color-status-draft)/0.3)] bg-[hsl(var(--color-status-draft)/0.08)] px-2 py-0.5 text-[10px] font-medium text-[hsl(var(--color-status-draft))]">
                  {ruleLabel(code)}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {items.length} 项
                </span>
              </div>

              {items.map((warning, i) => (
                <div
                  key={`${warning.code}-${warning.version ?? 'all'}-${i}`}
                  className="rounded-lg border border-[var(--nw-glass-border)] bg-[hsl(var(--background)/0.25)] px-3 py-2.5 space-y-1"
                >
                  <div className="flex items-center gap-2">
                    {warning.version != null ? (
                      <span className="inline-flex items-center rounded-full border border-[var(--nw-glass-border)] px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        候选 {warning.version}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {renderWarningMessage(warning)}
                  </p>
                  {warning.evidence ? (
                    <p className="text-[11px] text-muted-foreground/70 font-mono leading-relaxed break-words">
                      {warning.evidence}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
