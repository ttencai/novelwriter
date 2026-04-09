import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { NovelShell } from '@/components/novel-shell/NovelShell'
import { copilotApi } from '@/services/api'
import { useNovelShell } from '@/components/novel-shell/NovelShellContext'
import { useNovelCopilot } from '@/components/novel-copilot/NovelCopilotContext'
import { NovelCopilotDrawer } from '@/components/novel-copilot/NovelCopilotDrawer'
import { UiLocaleProvider } from '@/contexts/UiLocaleContext'

// Mock copilot API
vi.mock('@/services/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/api')>()
  return {
    ...original,
    copilotApi: {
      openSession: vi.fn().mockResolvedValue({
        session_id: 'shell-test-session',
        signature: 'test',
        mode: 'research',
        scope: 'whole_book',
        context: null,
        interaction_locale: 'zh',
        display_title: '',
        created: true,
        created_at: new Date().toISOString(),
      }),
      createRun: vi.fn().mockResolvedValue({
        run_id: 'shell-test-run',
        status: 'completed',
        prompt: '',
        answer: '分析完成',
        trace: [{ step_id: 's1', kind: 'evidence', status: 'completed', summary: '完成' }],
        evidence: [],
        suggestions: [],
      }),
      pollRun: vi.fn().mockResolvedValue({
        run_id: 'shell-test-run',
        status: 'completed',
        prompt: '',
        answer: '分析完成',
        trace: [],
        evidence: [],
        suggestions: [],
      }),
      listRuns: vi.fn().mockResolvedValue([]),
      pollLatestRun: vi.fn().mockRejectedValue(
        new original.ApiError(404, 'HTTP 404', { code: 'run_not_found' }),
      ),
      applySuggestions: vi.fn().mockResolvedValue({ results: [] }),
      dismissSuggestions: vi.fn().mockResolvedValue({ ok: true }),
    },
  }
})

const mockOpenSession = copilotApi.openSession as ReturnType<typeof vi.fn>

const mockUseWorldEntities = vi.fn()
const mockUseWorldRelationships = vi.fn()
const mockUseWorldSystems = vi.fn()
const mockUseCreateEntity = vi.fn()
const mockUseUpdateEntity = vi.fn()
const mockUseCreateRelationship = vi.fn()
const mockUseUpdateRelationship = vi.fn()
const mockUseCreateSystem = vi.fn()
const mockUseUpdateSystem = vi.fn()

vi.mock('@/hooks/world/useEntities', () => ({
  useWorldEntities: (...args: unknown[]) => mockUseWorldEntities(...args),
  useCreateEntity: (...args: unknown[]) => mockUseCreateEntity(...args),
  useUpdateEntity: (...args: unknown[]) => mockUseUpdateEntity(...args),
}))

vi.mock('@/hooks/world/useRelationships', () => ({
  useWorldRelationships: (...args: unknown[]) => mockUseWorldRelationships(...args),
  useCreateRelationship: (...args: unknown[]) => mockUseCreateRelationship(...args),
  useUpdateRelationship: (...args: unknown[]) => mockUseUpdateRelationship(...args),
}))

vi.mock('@/hooks/world/useSystems', () => ({
  useWorldSystems: (...args: unknown[]) => mockUseWorldSystems(...args),
  useCreateSystem: (...args: unknown[]) => mockUseCreateSystem(...args),
  useUpdateSystem: (...args: unknown[]) => mockUseUpdateSystem(...args),
}))

function ShellProbe({ nextPath }: { nextPath?: string }) {
  const navigate = useNavigate()
  const { routeState, shellState } = useNovelShell()
  const { isOpen, sessions, openDrawer, getSessionRun } = useNovelCopilot()

  return (
    <div>
      <div data-testid="surface">{routeState.surface ?? 'none'}</div>
      <div data-testid="stage">{routeState.stage ?? 'none'}</div>
      <div data-testid="entry">{routeState.entry ?? 'none'}</div>
      <div data-testid="session-count">{sessions.length}</div>
      <div data-testid="drawer-state">{isOpen ? 'open' : 'closed'}</div>
      <div data-testid="drawer-width">{shellState.drawerWidth}</div>
      <div data-testid="run-status">
        {sessions.length > 0 ? (getSessionRun(sessions[0].sessionId)?.status ?? 'none') : 'none'}
      </div>
      <button
        type="button"
        onClick={() => openDrawer({ mode: 'research', scope: 'whole_book' }, { displayTitle: '全书探索' })}
      >
        打开工作台
      </button>
      <button type="button" onClick={() => shellState.setDrawerWidth(640)}>
        调整宽度
      </button>
      {nextPath ? (
        <button type="button" onClick={() => navigate(nextPath)}>
          跳转
        </button>
      ) : null}
    </div>
  )
}

describe('NovelShell', () => {
  beforeEach(() => {
    const mutateAsync = vi.fn().mockResolvedValue({})
    mockUseWorldEntities.mockReturnValue({ data: [] })
    mockUseWorldRelationships.mockReturnValue({ data: [] })
    mockUseWorldSystems.mockReturnValue({ data: [] })
    mockUseCreateEntity.mockReturnValue({ mutateAsync })
    mockUseUpdateEntity.mockReturnValue({ mutateAsync })
    mockUseCreateRelationship.mockReturnValue({ mutateAsync })
    mockUseUpdateRelationship.mockReturnValue({ mutateAsync })
    mockUseCreateSystem.mockReturnValue({ mutateAsync })
    mockUseUpdateSystem.mockReturnValue({ mutateAsync })
  })

  it('keeps copilot session state and drawer width across atlas/studio route switches', async () => {
    const user = userEvent.setup()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={queryClient}>
        <UiLocaleProvider>
          <MemoryRouter initialEntries={['/world/7?tab=entities']}>
            <Routes>
              <Route element={<NovelShell />}>
                <Route path="/world/:novelId" element={<ShellProbe nextPath="/novel/7/chapter/3/results" />} />
                <Route path="/novel/:novelId/chapter/:chapterNum/results" element={<ShellProbe />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </UiLocaleProvider>
      </QueryClientProvider>,
    )

    expect(screen.getByTestId('surface')).toHaveTextContent('atlas')
    expect(screen.getByTestId('stage')).toHaveTextContent('entity')
    expect(screen.getByTestId('entry')).toHaveTextContent('atlas')
    expect(screen.getByTestId('session-count')).toHaveTextContent('0')
    expect(screen.getByTestId('drawer-width')).toHaveTextContent('360')

    await user.click(screen.getByRole('button', { name: '打开工作台' }))
    await waitFor(() => {
      expect(mockOpenSession).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ entrypoint: 'copilot_drawer' }),
      )
    })
    await user.click(screen.getByRole('button', { name: '调整宽度' }))
    await user.click(screen.getByRole('button', { name: '跳转' }))

    expect(screen.getByTestId('surface')).toHaveTextContent('studio')
    expect(screen.getByTestId('stage')).toHaveTextContent('results')
    expect(screen.getByTestId('entry')).toHaveTextContent('results_compat')
    expect(screen.getByTestId('session-count')).toHaveTextContent('1')
    expect(screen.getByTestId('drawer-state')).toHaveTextContent('open')
    expect(screen.getByTestId('drawer-width')).toHaveTextContent('640')
  })

  it('preserves copilot run state across surface switches', async () => {
    const user = userEvent.setup()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={queryClient}>
        <UiLocaleProvider>
          <MemoryRouter initialEntries={['/world/7?tab=entities']}>
            <Routes>
              <Route element={<NovelShell />}>
                <Route path="/world/:novelId" element={
                  <>
                    <ShellProbe nextPath="/novel/7/chapter/3/results" />
                    <NovelCopilotDrawer novelId={7} />
                  </>
                } />
                <Route path="/novel/:novelId/chapter/:chapterNum/results" element={<ShellProbe />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </UiLocaleProvider>
      </QueryClientProvider>,
    )

    // Open copilot session — drawer mounts with quick actions
    await user.click(screen.getByRole('button', { name: '打开工作台' }))
    expect(screen.getByTestId('novel-copilot-drawer')).toBeInTheDocument()
    expect(screen.getByTestId('run-status')).toHaveTextContent('none')

    // Trigger a run via quick action button
    const quickAction = screen.getByRole('button', { name: /盘点设定缺口/ })
    await user.click(quickAction)

    // With real API mock, createRun returns completed directly
    await waitFor(() => {
      expect(screen.getByTestId('run-status')).toHaveTextContent('completed')
    })

    // Navigate to Studio — drawer unmounts, but run state lives in context
    await user.click(screen.getByRole('button', { name: '跳转' }))
    expect(screen.getByTestId('surface')).toHaveTextContent('studio')
    expect(screen.getByTestId('session-count')).toHaveTextContent('1')
    // Run state must survive the surface switch
    expect(screen.getByTestId('run-status')).toHaveTextContent('completed')
  })

  it('provides toast context for the shared workbench drawer on studio routes', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={queryClient}>
        <UiLocaleProvider>
          <MemoryRouter initialEntries={['/novel/7']}>
            <Routes>
              <Route element={<NovelShell />}>
                <Route
                  path="/novel/:novelId"
                  element={
                    <>
                      <ShellProbe />
                      <NovelCopilotDrawer novelId={7} />
                    </>
                  }
                />
              </Route>
            </Routes>
          </MemoryRouter>
        </UiLocaleProvider>
      </QueryClientProvider>,
    )

    expect(screen.getByTestId('surface')).toHaveTextContent('studio')
    expect(screen.getByTestId('stage')).toHaveTextContent('chapter')
    expect(screen.getByTestId('drawer-state')).toHaveTextContent('closed')
  })

  it('isolates copilot session state when switching to a different novel', async () => {
    const user = userEvent.setup()
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={queryClient}>
        <UiLocaleProvider>
          <MemoryRouter initialEntries={['/world/7?tab=entities']}>
            <Routes>
              <Route element={<NovelShell />}>
                <Route path="/world/:novelId" element={<ShellProbe nextPath="/world/8?tab=entities" />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </UiLocaleProvider>
      </QueryClientProvider>,
    )

    await user.click(screen.getByRole('button', { name: '打开工作台' }))
    expect(screen.getByTestId('session-count')).toHaveTextContent('1')
    expect(screen.getByTestId('drawer-state')).toHaveTextContent('open')

    await user.click(screen.getByRole('button', { name: '跳转' }))

    expect(screen.getByTestId('surface')).toHaveTextContent('atlas')
    expect(screen.getByTestId('session-count')).toHaveTextContent('0')
    expect(screen.getByTestId('drawer-state')).toHaveTextContent('closed')
  })
})
