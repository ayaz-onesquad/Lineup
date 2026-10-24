import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from '@/hooks/use-toast'

/**
 * Bulk delete handler for list pages, shared so every overview page reports
 * the same way.
 *
 * Deletes in parallel with `allSettled`, so one failure (an RLS denial, a
 * record with dependants) does not abandon the rest, then reports
 * "3 of 5 deleted" instead of failing silently. Pass the entity's existing
 * single-record delete (`deleteClient.mutateAsync`); its soft-delete and cache
 * invalidation run unchanged.
 *
 * @example
 *   const { deleteClient } = useClientMutations()
 *   const onBulkDelete = useBulkDelete(deleteClient.mutateAsync, {
 *     singular: 'client', plural: 'clients', queryKey: ['clients'],
 *   })
 *   <DataGrid bulkDelete={{ entityName: 'client', onDelete: onBulkDelete }} … />
 */
export function useBulkDelete(
  deleteOne: (id: string) => Promise<unknown>,
  options: { singular: string; plural: string; queryKey?: readonly unknown[] }
) {
  const queryClient = useQueryClient()
  const { singular, plural, queryKey } = options

  return useCallback(
    async (ids: string[]) => {
      const results = await Promise.allSettled(ids.map(id => deleteOne(id)))
      const failed = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[]
      if (queryKey) await queryClient.invalidateQueries({ queryKey })

      const noun = (n: number) => (n === 1 ? singular : plural)
      if (failed.length === 0) {
        toast({
          title: `${ids.length} ${noun(ids.length)} deleted`,
        })
        return
      }
      const reason = failed[0].reason instanceof Error ? failed[0].reason.message : undefined
      toast({
        title: failed.length === ids.length ? `Could not delete the ${noun(ids.length)}` : 'Some deletions failed',
        description:
          `${ids.length - failed.length} of ${ids.length} ${plural} deleted.` + (reason ? ` ${reason}` : ''),
        variant: 'destructive',
      })
    },
    [deleteOne, queryClient, queryKey, singular, plural]
  )
}
