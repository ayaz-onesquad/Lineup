/**
 * Mobile-specific column metadata for responsive DataTable
 * Extends TanStack Table's column.meta pattern
 */
export interface MobileColumnMeta {
  /** Display priority in mobile card view */
  priority?: 'primary' | 'secondary' | 'tertiary'
  /** Hide this column on mobile screens */
  hideOnMobile?: boolean
  /** Override column header text for mobile card labels */
  mobileLabel?: string
}
