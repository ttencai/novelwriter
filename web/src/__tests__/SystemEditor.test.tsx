import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { UiLocaleProvider } from '@/contexts/UiLocaleContext'
import { SystemEditor } from '@/components/world-model/systems/SystemEditor'
import type { WorldSystem } from '@/types/api'

const updateMutate = vi.hoisted(() => vi.fn())
const deleteMutate = vi.hoisted(() => vi.fn())

vi.mock('@/hooks/world/useSystems', () => ({
  useUpdateSystem: () => ({ mutate: updateMutate }),
  useDeleteSystem: () => ({ mutate: deleteMutate }),
}))

describe('SystemEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    document.documentElement.lang = 'zh-CN'
  })

  it('renders legacy graph systems in read-only mode', () => {
    const legacyGraphSystem: WorldSystem = {
      id: 7,
      novel_id: 3,
      name: '势力格局',
      display_type: 'graph',
      description: '旧版关系图',
      data: {
        nodes: [
          { id: 'cf', label: '苍风帝国', visibility: 'active' },
          { id: 'ly', label: '流云宗', visibility: 'reference' },
        ],
        edges: [
          { from: 'cf', to: 'ly', label: '附属', visibility: 'active' },
        ],
      },
      constraints: [],
      visibility: 'active',
      origin: 'manual',
      worldpack_pack_id: null,
      status: 'confirmed',
      created_at: '2026-03-01T00:00:00Z',
      updated_at: '2026-03-01T00:00:00Z',
    }

    render(createElement(UiLocaleProvider, null, createElement(SystemEditor, { novelId: 3, system: legacyGraphSystem, onBack: vi.fn() })))

    expect(screen.getByTestId('legacy-graph-readonly')).toBeTruthy()
    expect(screen.getByText(/旧版关系图体系/)).toBeTruthy()
    expect(screen.getByText('苍风帝国')).toBeTruthy()
    expect(screen.getByText('流云宗')).toBeTruthy()
    expect(screen.getByText('苍风帝国 —附属→ 流云宗')).toBeTruthy()
  })

  it('renders legacy graph copy in English when the UI locale is en', () => {
    localStorage.setItem('novwr_ui_locale', 'en')
    document.documentElement.lang = 'en'

    const legacyGraphSystem: WorldSystem = {
      id: 7,
      novel_id: 3,
      name: 'Power Balance',
      display_type: 'graph',
      description: 'Legacy graph',
      data: {
        nodes: [
          { id: 'cf', label: 'Empire', visibility: 'active' },
        ],
        edges: [],
      },
      constraints: [],
      visibility: 'active',
      origin: 'manual',
      worldpack_pack_id: null,
      status: 'confirmed',
      created_at: '2026-03-01T00:00:00Z',
      updated_at: '2026-03-01T00:00:00Z',
    }

    render(createElement(UiLocaleProvider, null, createElement(SystemEditor, { novelId: 3, system: legacyGraphSystem, onBack: vi.fn() })))

    expect(screen.getByText(/legacy graph-based system/i)).toBeTruthy()
    expect(screen.getByText('Nodes (1)')).toBeTruthy()
    expect(screen.getByText('No edges to display.')).toBeTruthy()
  })
})
