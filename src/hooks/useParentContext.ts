import { useMemo } from 'react'
import { useSet } from '@/hooks/useSets'
import { useProject } from '@/hooks/useProjects'
import { usePhaseById } from '@/hooks/usePhases'
import { usePitch } from '@/hooks/usePitches'
import {
  compactParentContext,
  lockedParentFields,
  type ParentContext,
  type ParentField,
} from '@/lib/parentContext'

export interface ResolvedParentContext {
  /** The full ancestor chain: what the caller supplied plus what was derived. */
  values: ParentContext
  /** Fields the form must render read-only and never clear. */
  locked: Set<ParentField>
  /** True while an ancestor lookup is still in flight. */
  isResolving: boolean
}

/**
 * Resolves the full ancestor chain from whatever parent ids a create action
 * supplied. See docs/DESIGN-SYSTEM.md section 9 and `src/lib/parentContext.ts`.
 *
 * Creating a Requirement from a Set's tab passes only `set_id`; this returns
 * the set's phase, project and client as well, and marks all of them locked.
 *
 * The four record hooks are each gated on a non-empty id, so calling them
 * unconditionally costs nothing when that level was not supplied. That keeps
 * the hook order stable, which a conditional lookup could not.
 */
export function useParentContext(
  context: ParentContext | undefined
): ResolvedParentContext {
  const supplied = useMemo(() => compactParentContext(context), [context])

  const pitchQuery = usePitch(supplied.pitch_id ?? '')
  const setQuery = useSet(supplied.set_id ?? '')
  const phaseQuery = usePhaseById(supplied.phase_id ?? '')
  const projectQuery = useProject(supplied.project_id ?? '')

  const pitch = pitchQuery.data as { set_id?: string | null } | undefined
  const set = setQuery.data as
    | { project_id?: string | null; phase_id?: string | null; client_id?: string | null }
    | undefined
  const phase = phaseQuery.data as { project_id?: string | null } | undefined
  const project = projectQuery.data as { client_id?: string | null } | undefined

  const values = useMemo<ParentContext>(() => {
    // Start from what the caller gave us; derived values only fill gaps, so an
    // explicitly supplied id always wins over an inferred one.
    const out: ParentContext = { ...supplied }

    const fill = (field: ParentField, value: string | null | undefined) => {
      if (!out[field] && typeof value === 'string' && value.length > 0) {
        out[field] = value
      }
    }

    // Walk up the chain, deepest first, so each step can feed the next.
    fill('set_id', pitch?.set_id)
    fill('phase_id', set?.phase_id)
    fill('project_id', set?.project_id)
    fill('client_id', set?.client_id)
    fill('project_id', phase?.project_id)
    fill('client_id', project?.client_id)

    return out
  }, [supplied, pitch, set, phase, project])

  const locked = useMemo(() => lockedParentFields(values), [values])

  // Only the lookups we actually needed count towards "still resolving".
  const isResolving =
    (!!supplied.pitch_id && pitchQuery.isPending) ||
    (!!supplied.set_id && setQuery.isPending) ||
    (!!supplied.phase_id && phaseQuery.isPending) ||
    (!!supplied.project_id && projectQuery.isPending)

  return { values, locked, isResolving }
}
