import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UiLocaleProvider } from '@/contexts/UiLocaleContext'
import '@/lib/uiMessagePacks/novel'
import { EntityNavigator } from '@/components/atlas/entities/EntityNavigator'
import { EntityDetail } from '@/components/world-model/entities/EntityDetail'

const mocks = vi.hoisted(() => ({
  useWorldEntities: vi.fn(),
  useWorldEntity: vi.fn(),
  usePendingEntityChanges: vi.fn(),
  applyMutate: vi.fn(),
  rejectMutate: vi.fn(),
}))

vi.mock('@/hooks/world/useEntities', () => ({
  useWorldEntities: (...args: unknown[]) => mocks.useWorldEntities(...args),
  useWorldEntity: (...args: unknown[]) => mocks.useWorldEntity(...args),
  useCreateEntity: () => ({ mutate: vi.fn(), isPending: false }),
  useConfirmEntities: () => ({ mutate: vi.fn(), isPending: false }),
  useRejectEntities: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateEntity: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteEntity: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateAttribute: () => ({ mutate: vi.fn(), isPending: false }),
  useReorderAttributes: () => ({ mutate: vi.fn(), isPending: false }),
}))

vi.mock('@/hooks/world/useEntityChanges', () => ({
  usePendingEntityChanges: (...args: unknown[]) => mocks.usePendingEntityChanges(...args),
  useApplyEntityChange: () => ({ mutate: mocks.applyMutate, isPending: false }),
  useRejectEntityChange: () => ({ mutate: mocks.rejectMutate, isPending: false }),
}))

vi.mock('@/components/novel-copilot/NovelCopilotContext', () => ({
  useNovelCopilot: () => ({ openDrawer: vi.fn() }),
}))

vi.mock('@/components/world-model/shared/useToast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

const entity = {
  id: 9,
  novel_id: 7,
  name: '林野',
  entity_type: 'Character',
  description: '宣传委员',
  aliases: [],
  origin: 'manual',
  worldpack_pack_id: null,
  worldpack_key: null,
  status: 'confirmed',
  created_at: '2026-03-03T00:00:00Z',
  updated_at: '2026-03-03T00:00:00Z',
  attributes: [],
} as const

const proposal = {
  id: 21,
  novel_id: 7,
  chapter_id: 4,
  chapter_number: 4,
  entity_id: 9,
  entity_name: '林野',
  summary: '林野升任调查组组长',
  evidence: '正式成为调查组组长',
  delta: {
    attributes: [{
      key: '身份',
      old_value: '宣传委员',
      new_value: '调查组组长',
      mode: 'replace',
      evidence: '正式成为调查组组长',
    }],
  },
  status: 'pending',
  created_at: '2026-03-03T00:00:00Z',
  updated_at: '2026-03-03T00:00:00Z',
} as const

function renderWithLocale(node: React.ReactNode) {
  return render(<UiLocaleProvider>{node}</UiLocaleProvider>)
}

describe('entity change review', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.documentElement.lang = 'zh-CN'
    mocks.useWorldEntities.mockReturnValue({ data: [entity], isLoading: false })
    mocks.useWorldEntity.mockReturnValue({ data: entity })
    mocks.usePendingEntityChanges.mockReturnValue({ data: [proposal] })
  })

  it('marks the changed entity in the navigator', () => {
    renderWithLocale(
      <EntityNavigator
        novelId={7}
        selectedEntityId={null}
        onSelectEntity={vi.fn()}
      />,
    )

    expect(screen.getByTestId('entity-change-dot-9')).toBeInTheDocument()
  })

  it('shows evidence and applies the reviewed change', async () => {
    const user = userEvent.setup()
    renderWithLocale(<EntityDetail novelId={7} entityId={9} />)

    expect(screen.getByTestId('entity-change-card-21')).toHaveTextContent('林野升任调查组组长')
    expect(screen.getByTestId('entity-change-card-21')).toHaveTextContent('宣传委员 → 调查组组长')
    expect(screen.getByTestId('entity-change-card-21')).toHaveTextContent('正式成为调查组组长')

    await user.click(screen.getByRole('button', { name: '采纳' }))
    expect(mocks.applyMutate).toHaveBeenCalledWith(21, expect.objectContaining({ onError: expect.any(Function) }))
  })
})
