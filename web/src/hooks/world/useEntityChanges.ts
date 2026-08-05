import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { worldApi } from '@/services/api'
import { worldKeys } from './keys'

export function usePendingEntityChanges(novelId: number) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: worldKeys.entityChanges(novelId),
    queryFn: () => worldApi.listEntityChanges(novelId, { status: 'pending' }),
    enabled: Number.isFinite(novelId) && novelId > 0,
    // Background analysis completes after chapter creation, so refresh briefly and predictably.
    refetchInterval: 10_000,
  })

  useEffect(() => {
    if (query.dataUpdatedAt <= 0) return
    // The same background analysis can create new draft entities without creating a proposal.
    queryClient.invalidateQueries({ queryKey: worldKeys.entities(novelId) })
  }, [novelId, query.dataUpdatedAt, queryClient])

  return query
}

export function useApplyEntityChange(novelId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (proposalId: number) => worldApi.applyEntityChange(novelId, proposalId),
    onSuccess: (proposal) => {
      queryClient.invalidateQueries({ queryKey: worldKeys.entityChanges(novelId) })
      queryClient.invalidateQueries({ queryKey: worldKeys.entity(novelId, proposal.entity_id) })
      queryClient.invalidateQueries({ queryKey: worldKeys.entities(novelId) })
    },
  })
}

export function useRejectEntityChange(novelId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (proposalId: number) => worldApi.rejectEntityChange(novelId, proposalId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: worldKeys.entityChanges(novelId) })
    },
  })
}
