import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UiLocaleProvider } from '@/contexts/UiLocaleContext'
import { DraftReviewTab } from '@/components/world-model/shared/DraftReviewTab'

const mockUseWorldEntities = vi.fn()
const mockUseConfirmEntities = vi.fn()
const mockUseRejectEntities = vi.fn()
const mockUseWorldRelationships = vi.fn()
const mockUseConfirmRelationships = vi.fn()
const mockUseRejectRelationships = vi.fn()
const mockUseWorldSystems = vi.fn()
const mockUseConfirmSystems = vi.fn()
const mockUseRejectSystems = vi.fn()

vi.mock('@/hooks/world/useEntities', () => ({
  useWorldEntities: (...args: unknown[]) => mockUseWorldEntities(...args),
  useConfirmEntities: (...args: unknown[]) => mockUseConfirmEntities(...args),
  useRejectEntities: (...args: unknown[]) => mockUseRejectEntities(...args),
}))

vi.mock('@/hooks/world/useRelationships', () => ({
  useWorldRelationships: (...args: unknown[]) => mockUseWorldRelationships(...args),
  useConfirmRelationships: (...args: unknown[]) => mockUseConfirmRelationships(...args),
  useRejectRelationships: (...args: unknown[]) => mockUseRejectRelationships(...args),
}))

vi.mock('@/hooks/world/useSystems', () => ({
  useWorldSystems: (...args: unknown[]) => mockUseWorldSystems(...args),
  useConfirmSystems: (...args: unknown[]) => mockUseConfirmSystems(...args),
  useRejectSystems: (...args: unknown[]) => mockUseRejectSystems(...args),
}))

describe('DraftReviewTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    document.documentElement.lang = 'zh-CN'

    mockUseWorldEntities.mockImplementation((_novelId: number, params?: { status?: string }) => {
      if (params?.status === 'draft') {
        return {
          data: [{
            id: 101,
            novel_id: 7,
            name: '主角',
            entity_type: 'Character',
            description: '草稿描述',
            aliases: [],
            origin: 'manual',
            worldpack_pack_id: null,
            worldpack_key: null,
            status: 'draft',
            created_at: '2026-03-01T00:00:00Z',
            updated_at: '2026-03-01T00:00:00Z',
          }],
        }
      }
      return { data: [] }
    })

    mockUseWorldRelationships.mockReturnValue({ data: [] })
    mockUseWorldSystems.mockReturnValue({ data: [] })
    mockUseConfirmEntities.mockReturnValue({ mutate: vi.fn(), isPending: false })
    mockUseRejectEntities.mockReturnValue({ mutate: vi.fn(), isPending: false })
    mockUseConfirmRelationships.mockReturnValue({ mutate: vi.fn(), isPending: false })
    mockUseRejectRelationships.mockReturnValue({ mutate: vi.fn(), isPending: false })
    mockUseConfirmSystems.mockReturnValue({ mutate: vi.fn(), isPending: false })
    mockUseRejectSystems.mockReturnValue({ mutate: vi.fn(), isPending: false })
  })

  it('hides batch confirm/reject controls when batch actions are disabled for Studio', () => {
    render(
      <UiLocaleProvider>
        <DraftReviewTab
          novelId={7}
          kind="entities"
          onOpenEntity={vi.fn()}
          onOpenRelationships={vi.fn()}
          showKindSelector={false}
          showBatchActions={false}
        />
      </UiLocaleProvider>,
    )

    expect(screen.queryByRole('button', { name: /确认 全部/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /拒绝 全部/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '查看' })).toBeInTheDocument()
  })

  it('renders English draft review actions when the UI locale is en', () => {
    localStorage.setItem('novwr_ui_locale', 'en')
    document.documentElement.lang = 'en'

    render(
      <UiLocaleProvider>
        <DraftReviewTab
          novelId={7}
          kind="entities"
          onOpenEntity={vi.fn()}
          onOpenRelationships={vi.fn()}
          showKindSelector={false}
          showBatchActions={false}
        />
      </UiLocaleProvider>,
    )

    expect(screen.getByText('Entities (1)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument()
  })
})
