import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ChevronDown, Loader2 } from 'lucide-react'

const SAVE_MODE_KEY = 'lineup_save_mode'
type SaveMode = 'close' | 'next'

interface SaveSplitButtonProps {
  onSaveClose: () => void | Promise<void>
  onSaveNext: () => void | Promise<void>
  isSaving: boolean
  hasNext: boolean
}

/**
 * QuickBase-style split save button with remembered preference.
 * - Primary action shows either "Save & Close" or "Save & Next" based on last choice
 * - Dropdown toggle reveals the alternate action
 * - Preference persists in localStorage across sessions
 */
export function SaveSplitButton({
  onSaveClose,
  onSaveNext,
  isSaving,
  hasNext,
}: SaveSplitButtonProps) {
  const [saveMode, setSaveMode] = useState<SaveMode>(() => {
    const stored = localStorage.getItem(SAVE_MODE_KEY) as SaveMode | null
    return stored === 'next' ? 'next' : 'close'
  })

  const handleModeSwitch = (mode: SaveMode) => {
    localStorage.setItem(SAVE_MODE_KEY, mode)
    setSaveMode(mode)
  }

  const primaryLabel = saveMode === 'close' ? 'Save & Close' : 'Save & Next'
  const primaryAction = saveMode === 'close' ? onSaveClose : onSaveNext
  const alternateLabel = saveMode === 'close' ? 'Save & Next' : 'Save & Close'

  // When user picks alternate from dropdown: switch mode AND execute
  const handleAlternateClick = () => {
    if (saveMode === 'close') {
      handleModeSwitch('next')
      onSaveNext()
    } else {
      handleModeSwitch('close')
      onSaveClose()
    }
  }

  // Primary button disabled if saving, OR if mode is 'next' and there's no next record
  const primaryDisabled = isSaving || (saveMode === 'next' && !hasNext)

  return (
    <div className="flex items-center">
      {/* Primary button */}
      <Button
        size="sm"
        onClick={primaryAction}
        disabled={primaryDisabled}
        className="rounded-r-none border-r-0"
      >
        {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
        {primaryLabel}
      </Button>

      {/* Dropdown toggle */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="default"
            className="rounded-l-none px-2 border-l border-primary-foreground/20"
            disabled={isSaving}
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={handleAlternateClick}
            disabled={alternateLabel === 'Save & Next' && !hasNext}
          >
            {alternateLabel}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

// Session storage keys for list navigation
export const LIST_IDS_KEY = 'lineup_list_ids'
export const LIST_PATH_KEY = 'lineup_list_path'

/**
 * Helper to store the current list of IDs before navigating to a detail page.
 * Call this in overview pages when row is clicked/double-clicked.
 */
export function storeListContext(ids: string[], entityPath: string) {
  sessionStorage.setItem(LIST_IDS_KEY, JSON.stringify(ids))
  sessionStorage.setItem(LIST_PATH_KEY, entityPath)
}

/**
 * Helper to get the next record ID from the stored list.
 * Returns null if no list stored or if current record is last.
 */
export function getNextRecordId(currentId: string): string | null {
  try {
    const ids: string[] = JSON.parse(sessionStorage.getItem(LIST_IDS_KEY) || '[]')
    const currentIndex = ids.indexOf(currentId)
    if (currentIndex >= 0 && currentIndex < ids.length - 1) {
      return ids[currentIndex + 1]
    }
  } catch {
    // Invalid JSON or other error
  }
  return null
}

/**
 * Helper to get the stored entity path for navigation.
 */
export function getStoredListPath(): string | null {
  return sessionStorage.getItem(LIST_PATH_KEY)
}
