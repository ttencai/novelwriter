import { act, renderHook, waitFor } from '@testing-library/react'
import type React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useContinuationSetupState } from '@/hooks/novel/useContinuationSetupState'

const mockNavigate = vi.fn()
const mockGetNovel = vi.fn()
const mockUpdatePreferences = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { preferences: {} },
  }),
}))

vi.mock('@/services/api', () => ({
  api: {
    getNovel: (...args: unknown[]) => mockGetNovel(...args),
    updatePreferences: (...args: unknown[]) => mockUpdatePreferences(...args),
  },
}))

function wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>
}

describe('useContinuationSetupState', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetNovel.mockResolvedValue({ id: 1, title: '普通小说' })
    mockUpdatePreferences.mockResolvedValue({})
  })

  it('clears per-book continuation instruction when novel id changes', async () => {
    const { result, rerender } = renderHook(
      ({ novelId }) => useContinuationSetupState(novelId, 3),
      {
        wrapper,
        initialProps: { novelId: 1 },
      },
    )

    act(() => {
      result.current.setInstruction('第一本书专属设定')
    })
    expect(result.current.instruction).toBe('第一本书专属设定')

    rerender({ novelId: 2 })

    await waitFor(() => {
      expect(result.current.instruction).toBe('')
    })
  })

  it('sends polish mode with the selected output length', async () => {
    const { result } = renderHook(
      () => useContinuationSetupState(1, 3),
      { wrapper },
    )
    await act(async () => { await Promise.resolve() })

    act(() => {
      result.current.setMode('polish')
      result.current.setInstruction('草稿正文。要求：调整语序。')
    })
    act(() => result.current.handleGenerate())

    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringContaining('/novel/1?'),
      expect.objectContaining({
        state: expect.objectContaining({
          streamParams: expect.objectContaining({
            mode: 'polish',
            prompt: '草稿正文。要求：调整语序。',
            target_chars: 4000,
          }),
        }),
      }),
    )
  })

  it('does not start polish mode without a draft', async () => {
    const { result } = renderHook(
      () => useContinuationSetupState(1, 3),
      { wrapper },
    )
    await act(async () => { await Promise.resolve() })

    act(() => result.current.setMode('polish'))
    act(() => result.current.handleGenerate())

    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
