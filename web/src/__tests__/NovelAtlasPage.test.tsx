import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { UiLocaleProvider } from '@/contexts/UiLocaleContext'
import { NovelShell } from '@/components/novel-shell/NovelShell'
import { useNovelCopilot } from '@/components/novel-copilot/NovelCopilotContext'
import { useNovelShell } from '@/components/novel-shell/NovelShellContext'
import { NovelAtlasPage } from '@/pages/NovelAtlasPage'

const mockUseWorldEntities = vi.fn()
const mockUseWorldSystems = vi.fn()

vi.mock('@/components/atlas/AtlasShell', () => ({
  AtlasShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/ui/glass-surface', () => ({
  GlassSurface: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/novel-copilot/NovelCopilotDrawer', () => ({
  NovelCopilotDrawer: () => <div data-testid="novel-copilot-drawer" />,
}))

vi.mock('@/components/atlas/entities/EntityNavigator', () => ({
  EntityNavigator: ({
    selectedEntityId,
    onSelectEntity,
  }: {
    selectedEntityId: number | null
    onSelectEntity: (id: number) => void
  }) => (
    <div>
      <div data-testid="entity-navigator-selection">{selectedEntityId ?? 'none'}</div>
      <button type="button" onClick={() => onSelectEntity(10)}>
        选择实体10
      </button>
    </div>
  ),
}))

vi.mock('@/components/world-model/entities/EntityDetail', () => ({
  EntityDetail: ({ entityId }: { entityId: number | null }) => (
    <div data-testid="entity-detail">{entityId ?? 'none'}</div>
  ),
}))

vi.mock('@/components/atlas/systems/SystemsWorkspace', () => ({
  SystemsWorkspace: () => <div data-testid="systems-workspace" />,
}))

vi.mock('@/components/world-model/relationships/RelationshipsTab', () => ({
  RelationshipsTab: ({ selectedRelationshipId }: { selectedRelationshipId?: number | null }) => (
    <div data-testid="relationships-tab">{selectedRelationshipId ?? 'none'}</div>
  ),
}))

vi.mock('@/components/world-model/shared/DraftReviewTab', () => ({
  DraftReviewTab: ({ highlightId }: { highlightId?: number | null }) => (
    <div data-testid="draft-review-tab">{highlightId ?? 'none'}</div>
  ),
}))

vi.mock('@/components/atlas/review/DraftReviewSummaryCard', () => ({
  DraftReviewSummaryCard: () => <div data-testid="draft-review-summary" />,
}))

vi.mock('@/components/atlas/review/DraftReviewNavigator', () => ({
  DraftReviewNavigator: ({ activeItemId }: { activeItemId?: number | null }) => (
    <div data-testid="draft-review-navigator">{activeItemId ?? 'none'}</div>
  ),
}))

vi.mock('@/components/atlas/relationships/RelationshipSidebarPanel', () => ({
  RelationshipSidebarPanel: () => <div data-testid="relationship-sidebar-panel" />,
}))

vi.mock('@/hooks/world/useEntities', () => ({
  useWorldEntities: (...args: unknown[]) => mockUseWorldEntities(...args),
}))

vi.mock('@/hooks/world/useSystems', () => ({
  useWorldSystems: (...args: unknown[]) => mockUseWorldSystems(...args),
}))

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location-search">{location.search}</div>
}

function CopilotStateProbe() {
  const { isOpen } = useNovelCopilot()
  const { shellState } = useNovelShell()

  return (
    <>
      <div data-testid="copilot-open-state">{isOpen ? 'open' : 'closed'}</div>
      <div data-testid="copilot-drawer-width">{shellState.drawerWidth}</div>
    </>
  )
}

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

const originalResizeObserver = globalThis.ResizeObserver
const originalClientWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')

function renderWithShell(ui: ReactNode, initialEntry: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={queryClient}>
      <UiLocaleProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          {ui}
        </MemoryRouter>
      </UiLocaleProvider>
    </QueryClientProvider>,
  )
}

describe('NovelAtlasPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    localStorage.clear()
    document.documentElement.lang = 'zh-CN'
    mockUseWorldEntities.mockReturnValue({
      data: [
        { id: 9, name: '苏瑶' },
        { id: 10, name: '韩立' },
      ],
    })
    mockUseWorldSystems.mockReturnValue({
      data: [],
    })
  })

  afterEach(() => {
    if (originalResizeObserver) {
      vi.stubGlobal('ResizeObserver', originalResizeObserver)
    } else {
      vi.unstubAllGlobals()
    }

    if (originalClientWidthDescriptor) {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidthDescriptor)
    } else {
      delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth
    }
  })

  it('hydrates entity selection from the atlas URL and keeps later selections in the URL contract', async () => {
    const user = userEvent.setup()

    renderWithShell(
      <>
        <Routes>
          <Route element={<NovelShell />}>
            <Route
              path="/world/:novelId"
              element={(
                <>
                  <NovelAtlasPage />
                  <LocationProbe />
                </>
              )}
            />
          </Route>
        </Routes>
      </>,
      '/world/7?tab=entities&entity=9',
    )

    expect(screen.getByTestId('entity-detail')).toHaveTextContent('9')
    expect(screen.getByTestId('entity-navigator-selection')).toHaveTextContent('9')

    await user.click(screen.getByRole('button', { name: '选择实体10' }))

    expect(screen.getByTestId('entity-detail')).toHaveTextContent('10')
    expect(screen.getByTestId('location-search')).toHaveTextContent('entity=10')
  })

  it('hydrates relationship highlight from the atlas URL for copilot target navigation', () => {
    renderWithShell(
      <>
        <Routes>
          <Route element={<NovelShell />}>
            <Route path="/world/:novelId" element={<NovelAtlasPage />} />
          </Route>
        </Routes>
      </>,
      '/world/7?tab=relationships&entity=9&relationship=21',
    )

    expect(screen.getByTestId('relationships-tab')).toHaveTextContent('21')
  })

  it('hydrates review highlight from the atlas URL for copilot draft targets', () => {
    renderWithShell(
      <>
        <Routes>
          <Route element={<NovelShell />}>
            <Route path="/world/:novelId" element={<NovelAtlasPage />} />
          </Route>
        </Routes>
      </>,
      '/world/7?tab=review&kind=relationships&highlight=31',
    )

    expect(screen.getByTestId('draft-review-tab')).toHaveTextContent('31')
    expect(screen.getByTestId('draft-review-navigator')).toHaveTextContent('31')
  })

  it('returns to the structured studio origin without relying on raw returnTo', async () => {
    const user = userEvent.setup()

    renderWithShell(
      <>
        <Routes>
          <Route element={<NovelShell />}>
            <Route
              path="/world/:novelId"
              element={<NovelAtlasPage />}
            />
            <Route
              path="/novel/:novelId"
              element={<LocationProbe />}
            />
          </Route>
        </Routes>
      </>,
      '/world/7?tab=entities&entity=9&originStage=results&originChapter=3&originResultsChapter=3&originResultsContinuations=0:15,1:16&originResultsTotalVariants=2&originArtifactPanel=injection_summary&originSummaryCategory=entities',
    )

    await user.click(screen.getByRole('button', { name: '返回工作台' }))

    expect(screen.getByTestId('location-search')).toHaveTextContent('stage=results')
    expect(screen.getByTestId('location-search')).toHaveTextContent('chapter=3')
    expect(screen.getByTestId('location-search')).toHaveTextContent('continuations=0%3A15%2C1%3A16')
    expect(screen.getByTestId('location-search')).toHaveTextContent('artifactPanel=injection_summary')
  })

  it('uses the same return-to-studio control as a safe fallback when atlas has no origin state', async () => {
    const user = userEvent.setup()

    renderWithShell(
      <>
        <Routes>
          <Route element={<NovelShell />}>
            <Route path="/world/:novelId" element={<NovelAtlasPage />} />
            <Route path="/novel/:novelId" element={<LocationProbe />} />
          </Route>
        </Routes>
      </>,
      '/world/7?tab=entities&entity=9',
    )

    await user.click(screen.getByRole('button', { name: '返回工作台' }))

    expect(screen.getByTestId('location-search')).toBeEmptyDOMElement()
  })

  it('renders the atlas chrome in English when the UI locale is en', () => {
    localStorage.setItem('novwr_ui_locale', 'en')
    document.documentElement.lang = 'en'

    renderWithShell(
      <>
        <Routes>
          <Route element={<NovelShell />}>
            <Route path="/world/:novelId" element={<NovelAtlasPage />} />
          </Route>
        </Routes>
      </>,
      '/world/7?tab=review',
    )

    expect(screen.getByRole('button', { name: 'Return to Studio' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Draft review' })).toBeInTheDocument()
  })

  it('keeps atlas copilot open on narrow desktops by shrinking to the available width first', async () => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        return 1100
      },
    })

    const user = userEvent.setup()

    renderWithShell(
      <>
        <Routes>
          <Route element={<NovelShell />}>
            <Route
              path="/world/:novelId"
              element={(
                <>
                  <NovelAtlasPage />
                  <CopilotStateProbe />
                </>
              )}
            />
          </Route>
        </Routes>
      </>,
      '/world/7?tab=entities',
    )

    expect(screen.getByTestId('copilot-open-state')).toHaveTextContent('closed')
    expect(screen.getByTestId('copilot-drawer-width')).toHaveTextContent('360')

    await user.click(screen.getByRole('button', { name: 'Toggle Copilot' }))

    expect(screen.getByTestId('copilot-open-state')).toHaveTextContent('open')
    expect(screen.getByTestId('copilot-drawer-width')).toHaveTextContent('340')
  })
})
