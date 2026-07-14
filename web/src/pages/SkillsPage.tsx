import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Folder, RefreshCw } from 'lucide-react'
import { GlassCard } from '@/components/GlassCard'
import { NwButton } from '@/components/ui/nw-button'
import { cn } from '@/lib/utils'
import { api } from '@/services/api'
import type { SkillGroup } from '@/types/api'

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <GlassCard className="min-h-[108px] rounded-2xl p-6">
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      <div className="mt-4 font-mono text-3xl font-bold tracking-tight text-foreground">{value}</div>
    </GlassCard>
  )
}

function SkillGroupRow({ group }: { group: SkillGroup }) {
  const [open, setOpen] = useState(false)
  return (
    <GlassCard className="overflow-hidden rounded-2xl">
      <button
        type="button"
        className="flex min-h-[74px] w-full items-center gap-4 px-6 text-left transition-colors hover:bg-[var(--nw-glass-bg-hover)]"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronRight className={cn('h-5 w-5 text-muted-foreground transition-transform', open && 'rotate-90')} />
        <Folder className="h-5 w-5 text-accent" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <span className="truncate text-base font-semibold text-foreground">{group.name}</span>
            <span className="text-sm text-muted-foreground">{group.skill_count} 个</span>
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground">{group.path}</div>
        </div>
        <span className="text-sm font-semibold text-accent">{group.enabled_count} 已启用</span>
      </button>
      {open ? (
        <div className="border-t border-[var(--nw-glass-border)] px-6 py-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {group.skills.map((skill) => (
              <div key={skill.path} className="rounded-xl border border-[var(--nw-glass-border)] bg-[hsl(var(--background)/0.28)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="truncate font-medium text-foreground">{skill.name}</div>
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', skill.enabled ? 'bg-[hsl(var(--accent)/0.14)] text-accent' : 'bg-[var(--nw-glass-bg)] text-muted-foreground')}>
                    {skill.enabled ? '启用' : '停用'}
                  </span>
                </div>
                <div className="mt-2 truncate text-xs text-muted-foreground">{skill.path}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </GlassCard>
  )
}

export function SkillsPage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['skills'],
    queryFn: () => api.listSkills(),
    staleTime: 10_000,
  })

  const summary = data?.summary ?? { total: 0, common: 0, user: 0, enabled: 0 }
  const groups = data?.groups ?? []

  return (
    <div className="flex-1 px-6 py-10 md:px-12">
      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-7">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">SKILLS</div>
            <h1 className="mt-4 font-mono text-[30px] font-bold tracking-tight text-foreground md:text-[34px]">
              内置 Skills 与个人扩展
            </h1>
            <p className="mt-5 max-w-4xl text-sm leading-7 text-muted-foreground">
              共用 skills 会在创建用户时复制到个人目录。每个用户只修改自己的 skills，互不影响。
            </p>
          </div>
          <div className="flex items-center gap-3">
            <NwButton variant="glass" className="rounded-full px-6 py-2.5 text-sm font-semibold" disabled>
              导入 Skill 包
            </NwButton>
            <NwButton variant="ghost" className="rounded-full px-5 py-2.5 text-sm font-semibold" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
              重新扫描
            </NwButton>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <StatCard label="已识别 skills" value={summary.total} />
          <StatCard label="共用" value={summary.common} />
          <StatCard label="个人" value={summary.user} />
          <StatCard label="已启用" value={summary.enabled} />
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-5">
            {[0, 1, 2].map((item) => <GlassCard key={item} className="h-[74px] animate-pulse rounded-2xl" />)}
          </div>
        ) : error ? (
          <GlassCard className="rounded-2xl p-6 text-sm text-[hsl(var(--color-warning))]">
            加载失败
          </GlassCard>
        ) : groups.length === 0 ? (
          <GlassCard className="rounded-2xl p-10 text-center text-sm text-muted-foreground">
            暂无 skills
          </GlassCard>
        ) : (
          <div className="flex flex-col gap-5">
            {groups.map((group) => <SkillGroupRow key={group.path} group={group} />)}
          </div>
        )}
      </div>
    </div>
  )
}
