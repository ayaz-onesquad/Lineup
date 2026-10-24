/**
 * Contextual creation: the parent chain.
 *
 * See docs/DESIGN-SYSTEM.md section 9.
 *
 * When a record is created from inside a parent — a Requirement from a Set's
 * Requirements tab, a Phase from a Project — every ancestor in the six-level
 * hierarchy is already determined. It is not a choice the user should have to
 * repeat, and it is not a choice the form may quietly discard.
 *
 * Two rules follow, and this module exists so they are implemented once:
 *
 *   1. ANCESTORS ARE DERIVED. Passing `set_id` determines the phase, project
 *      and client. The caller supplies the one id it knows; the chain is
 *      resolved from it.
 *
 *   2. DERIVED AND SUPPLIED FIELDS ARE LOCKED. A locked field is rendered
 *      read-only and, critically, is never cleared by a cascade reset. The old
 *      forms let an async cascade wipe a pre-filled parent, which is how a
 *      Requirement created from a Set ended up with no set.
 */

/** The six-level hierarchy from CLAUDE.md, root first. */
export const HIERARCHY_LEVELS = [
  'client',
  'project',
  'phase',
  'set',
  'pitch',
  'requirement',
] as const

export type HierarchyLevel = (typeof HIERARCHY_LEVELS)[number]

/** Foreign-key column for each level, in the same root-first order. */
export const PARENT_FIELDS = [
  'client_id',
  'project_id',
  'phase_id',
  'set_id',
  'pitch_id',
  'requirement_id',
] as const

export type ParentField = (typeof PARENT_FIELDS)[number]

/**
 * The parent ids a create action carries. Every field is optional: a caller
 * supplies only the level it is standing in.
 */
export type ParentContext = Partial<Record<ParentField, string | null | undefined>>

/** Index of a field in the hierarchy. Lower is closer to the root. */
export function parentFieldDepth(field: ParentField): number {
  return PARENT_FIELDS.indexOf(field)
}

/** Non-empty entries only. An empty string is "not supplied", not "cleared". */
export function compactParentContext(context: ParentContext | undefined): ParentContext {
  const out: ParentContext = {}
  if (!context) return out
  for (const field of PARENT_FIELDS) {
    const value = context[field]
    if (typeof value === 'string' && value.length > 0) out[field] = value
  }
  return out
}

/** The deepest level the caller actually supplied, or null. */
export function deepestSuppliedField(context: ParentContext | undefined): ParentField | null {
  const compact = compactParentContext(context)
  let deepest: ParentField | null = null
  for (const field of PARENT_FIELDS) {
    if (compact[field]) deepest = field
  }
  return deepest
}

/**
 * Fields the form must treat as fixed.
 *
 * Both the supplied ids and the ancestors resolved from them: if you are
 * creating inside a Set, the Set's project is not a free choice either.
 */
export function lockedParentFields(resolved: ParentContext): Set<ParentField> {
  const locked = new Set<ParentField>()
  for (const field of PARENT_FIELDS) {
    if (resolved[field]) locked.add(field)
  }
  return locked
}

/**
 * Guard for a cascade reset.
 *
 * Call before clearing a field in a dependent-field effect. Returns true when
 * the field came from the creation context and must survive.
 *
 * ```ts
 * if (!isParentLocked('set_id', locked)) form.setValue('set_id', '')
 * ```
 */
export function isParentLocked(
  field: ParentField,
  locked: Set<ParentField> | undefined
): boolean {
  return !!locked?.has(field)
}

/**
 * Ensures a locked value is selectable.
 *
 * A `SearchableSelect` renders its label by looking the value up in `options`.
 * Cascading option lists arrive asynchronously, so a pre-filled parent shows
 * as blank until its list loads — which reads to the user as "not linked" even
 * when the form state is correct. Injecting a placeholder option keeps the
 * control truthful while the real list is in flight.
 */
export function withLockedOption<T extends { value: string; label: string }>(
  options: T[],
  lockedValue: string | undefined,
  fallbackLabel: string
): (T | { value: string; label: string })[] {
  if (!lockedValue) return options
  if (options.some(o => o.value === lockedValue)) return options
  return [{ value: lockedValue, label: fallbackLabel }, ...options]
}
