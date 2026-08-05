import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { usePendingEntityChanges } from '@/hooks/world/useEntityChanges'

const mocks = vi.hoisted(() => ({
  listEntityChanges: vi.fn(),
}))

vi.mock('@/services/api', () => ({
  worldApi: {
    listEntityChanges: mocks.listEntityChanges,
  },
}))

describe('usePendingEntityChanges', () => {
  it('refreshes entity lists after each background-analysis poll', async () => {
    mocks.listEntityChanges.mockResolvedValue([])
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    renderHook(() => usePendingEntityChanges(6), { wrapper })

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['world', 6, 'entities'] })
    })
  })
})
