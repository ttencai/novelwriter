// SPDX-FileCopyrightText: 2026 Isaac.X.Ω.Yuan
// SPDX-License-Identifier: AGPL-3.0-only

import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { EmptyState } from '@/components/library/EmptyState'
import { WorkCard } from '@/components/library/WorkCard'
import { PageShell } from '@/components/layout/PageShell'
import { NwButton } from '@/components/ui/nw-button'
import { GlassCard } from '@/components/GlassCard'
import { useUiLocale } from '@/contexts/UiLocaleContext'
import { api } from '@/services/api'
import { novelKeys } from '@/hooks/novel/keys'
import { clearWorldOnboardingDismissed } from '@/lib/worldOnboardingStorage'

export function LibraryPage() {
  const { t } = useUiLocale()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: novels = [], isLoading: loading, error } = useQuery({
    queryKey: novelKeys.all,
    queryFn: () => api.listNovels(),
    staleTime: 30_000,
  })

  const deleteNovel = useMutation({
    mutationFn: (vars: { id: number, created_at?: string | null }) => api.deleteNovel(vars.id),
    onSuccess: (_data, vars) => {
      clearWorldOnboardingDismissed(vars.id, vars.created_at)
      queryClient.invalidateQueries({ queryKey: novelKeys.all })
    },
  })

  function handleDelete(id: number) {
    if (!window.confirm(t('library.confirm.delete'))) return
    const novel = novels.find((n) => n.id === id)
    deleteNovel.mutate({ id, created_at: novel?.created_at })
  }

  function handleCreate() {
    fileInputRef.current?.click()
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const title = file.name.replace(/\.txt$/i, '')
    try {
      const result = await api.uploadNovel(file, title)
      queryClient.invalidateQueries({ queryKey: novelKeys.all })
      navigate(`/novel/${result.novel_id}`)
    } catch (err) {
      alert(err instanceof Error ? err.message : t('library.error.uploadFailed'))
    }
    e.target.value = ''
  }

  const createButton = (
    <NwButton
      data-testid="library-create-novel"
      onClick={handleCreate}
      variant="accent"
      className="rounded-full px-6 py-2.5 text-sm font-semibold shadow-[0_0_24px_hsl(var(--accent)/0.35)]"
    >
      <Plus size={18} />
      {t('library.create')}
    </NwButton>
  )

  return (
    <PageShell className="h-screen" navbarProps={{ position: 'static' }} mainClassName="overflow-hidden">
      <input
        ref={fileInputRef}
        data-testid="library-file-input"
        type="file"
        accept=".txt"
        className="hidden"
        onChange={handleFileSelected}
      />
      <div className="flex flex-col flex-1 px-12 py-10 gap-8 overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between gap-6">
          <div className="flex flex-col gap-1">
            <h1 className="m-0 font-mono text-2xl font-bold text-foreground">
              {t('library.title')}
            </h1>
            <p className="m-0 text-sm text-muted-foreground">
              {t('library.description')}
            </p>
          </div>
          {createButton}
        </div>

        {/* Loading */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {[0, 1, 2, 3].map((i) => (
              <GlassCard
                key={i}
                className="h-40 animate-pulse"
              />
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-sm text-[hsl(var(--color-warning))]">
            {t('library.error.load')}: {error instanceof Error ? error.message : t('library.error.unknown')}
          </p>
        )}

        {/* Empty */}
        {!loading && !error && novels.length === 0 && (
          <EmptyState onCreate={handleCreate} />
        )}

        {/* Card Grid */}
        {!loading && !error && novels.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {novels.map((novel) => (
              <WorkCard key={novel.id} novel={novel} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </PageShell>
  )
}
