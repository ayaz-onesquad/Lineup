import { useState, type ReactNode } from 'react'
import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

/**
 * Responsive toolbar for a data grid. See docs/DESIGN-SYSTEM.md section 5.4.
 *
 * Search stays visible at every width because it is the control people reach
 * for first. Every other filter collapses into one Filters button below `md`,
 * opening a bottom sheet. The previous pattern put five 170px-wide selects in a
 * non-wrapping flex row, which overflowed a 390px viewport on its own.
 */
interface GridToolbarProps {
  /** Usually a `GridSearch`. Always visible, full width on a phone. */
  search?: ReactNode
  /** Filter controls. Inline from `md`, inside a sheet below it. */
  children?: ReactNode
  /** Drives the badge on the Filters button and the Clear control. */
  activeFilterCount?: number
  onClearFilters?: () => void
  className?: string
}

export function GridToolbar({
  search,
  children,
  activeFilterCount = 0,
  onClearFilters,
  className,
}: GridToolbarProps) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const hasFilters = !!children

  return (
    <div className={cn('flex w-full flex-wrap items-center gap-2', className)}>
      {search && <div className="min-w-0 flex-1 basis-full md:basis-64">{search}</div>}

      {hasFilters && (
        <>
          {/* Phone and small tablet: one button, one sheet. */}
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="shrink-0 md:hidden">
                <SlidersHorizontal className="mr-2 h-4 w-4" />
                Filters
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto pb-safe">
              <SheetHeader className="text-left">
                <SheetTitle>Filters</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4">{children}</div>
              {activeFilterCount > 0 && onClearFilters && (
                <Button
                  variant="ghost"
                  className="mt-4 w-full min-h-touch-lg"
                  onClick={() => {
                    onClearFilters()
                    setSheetOpen(false)
                  }}
                >
                  Clear all filters
                </Button>
              )}
            </SheetContent>
          </Sheet>

          {/* Tablet and up: inline, wrapping. */}
          <div className="hidden min-w-0 flex-wrap items-center gap-2 md:flex">
            {children}
            {activeFilterCount > 0 && onClearFilters && (
              <Button variant="ghost" size="sm" onClick={onClearFilters}>
                <X className="mr-1 h-4 w-4" />
                Clear
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Search input for a grid toolbar. Full width by default so it fills the row
 * on a phone.
 */
export function GridSearch({
  value,
  onChange,
  placeholder = 'Search...',
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <div className={cn('relative w-full', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="pl-9"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

/**
 * A single filter select.
 *
 * Inside the mobile sheet it renders full width with a visible label, because
 * a 170px select with only placeholder text gives no clue what it filters.
 * Inline on desktop it stays compact.
 */
export function GridFilterSelect({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string
  options: ReadonlyArray<{ value: string; label: string; description?: string }>
  value: string
  onChange: (value: string) => void
  className?: string
}) {
  return (
    <div className={cn('w-full md:w-auto md:min-w-[150px]', className)}>
      <Label className="mb-1.5 block text-sm font-medium md:hidden">{label}</Label>
      <SearchableSelect
        options={[...options]}
        value={value}
        onValueChange={v => onChange(v ?? '')}
        placeholder={`All ${label.toLowerCase()}`}
        aria-label={label}
        clearable
      />
    </div>
  )
}

/**
 * Multi-value filter select.
 *
 * `GridFilterSelect` holds one value, which silently narrows a filter that was
 * previously multi-valued (a status filter where you want "Active OR On Deck",
 * for example). Use this where the underlying filter accepts an array.
 */
export function GridFilterMultiSelect({
  label,
  options,
  values,
  onChange,
  className,
}: {
  label: string
  options: ReadonlyArray<{ value: string; label: string }>
  values: string[]
  onChange: (values: string[]) => void
  className?: string
}) {
  const toggle = (value: string) => {
    onChange(
      values.includes(value) ? values.filter(v => v !== value) : [...values, value]
    )
  }

  const summary =
    values.length === 0
      ? `All ${label.toLowerCase()}`
      : values.length === 1
        ? (options.find(o => o.value === values[0])?.label ?? values[0])
        : `${values.length} selected`

  return (
    <div className={cn('w-full md:w-auto', className)}>
      <Label className="mb-1.5 block text-sm font-medium md:hidden">{label}</Label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-between font-normal md:w-auto md:min-w-[150px]"
            aria-label={`${label} filter`}
          >
            <span className="truncate">{summary}</span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-y-auto">
          {options.map(option => (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={values.includes(option.value)}
              // preventDefault keeps the menu open so several values can be
              // picked without reopening it each time.
              onSelect={e => e.preventDefault()}
              onCheckedChange={() => toggle(option.value)}
            >
              {option.label}
            </DropdownMenuCheckboxItem>
          ))}
          {values.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onChange([])}>
                Clear {label.toLowerCase()}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
