/**
 * Mobile-specific column metadata for the deprecated `DataTable`.
 *
 * @deprecated Superseded by the fields on `DataGridColumn` in
 * `@/components/ui/data-grid` (`priority`, `hideOnMobile`, `mobileLabel`,
 * plus `numeric`, `sortable`, `width` and `minWidth`). Kept because the two
 * client-portal tables still pass it through TanStack's `column.meta`.
 */
export interface MobileColumnMeta {
  /** Display priority in mobile card view */
  priority?: 'primary' | 'secondary' | 'tertiary'
  /** Hide this column on mobile screens */
  hideOnMobile?: boolean
  /** Override column header text for mobile card labels */
  mobileLabel?: string
}
