import { useEffect, useCallback } from 'react'
import type { FieldErrors, FieldValues } from 'react-hook-form'

/**
 * Hook to scroll to the first form error when validation fails.
 *
 * Usage:
 * ```tsx
 * const form = useForm()
 * const { scrollToFirstError } = useScrollToError(form.formState.errors)
 *
 * // In your form onSubmit wrapper:
 * const onSubmit = form.handleSubmit(
 *   (data) => { ... },
 *   () => scrollToFirstError()
 * )
 * ```
 */
export function useScrollToError<T extends FieldValues>(
  errors: FieldErrors<T>,
  options?: {
    /** Offset from top of viewport when scrolling (default: 100px) */
    offset?: number
    /** Whether to auto-scroll on errors change (default: false) */
    autoScroll?: boolean
    /** Whether to focus the first error field (default: true) */
    focusOnError?: boolean
  }
) {
  const { offset = 100, autoScroll = false, focusOnError = true } = options || {}

  const scrollToFirstError = useCallback(() => {
    const errorKeys = Object.keys(errors)
    if (errorKeys.length === 0) return

    // Find the first field with an error
    // React Hook Form names match form field names, which should match input names
    const firstErrorKey = errorKeys[0]

    // Try to find the element by name attribute first (most reliable)
    let errorElement = document.querySelector(`[name="${firstErrorKey}"]`)

    // Fallback: try to find by aria-invalid attribute
    if (!errorElement) {
      errorElement = document.querySelector('[aria-invalid="true"]')
    }

    // Fallback: try to find the FormItem containing the error message
    if (!errorElement) {
      const errorMessage = document.querySelector('[id$="-form-item-message"]')
      if (errorMessage) {
        errorElement = errorMessage.closest('[class*="space-y"]')
      }
    }

    if (errorElement) {
      // Scroll the element into view with offset
      const elementRect = errorElement.getBoundingClientRect()
      const absoluteTop = elementRect.top + window.pageYOffset - offset

      window.scrollTo({
        top: absoluteTop,
        behavior: 'smooth',
      })

      // Focus the input if requested
      if (focusOnError) {
        // Small delay to allow scroll to complete
        setTimeout(() => {
          const inputElement = errorElement?.querySelector('input, select, textarea') as HTMLElement | null
          if (inputElement && typeof inputElement.focus === 'function') {
            inputElement.focus()
          } else if (errorElement instanceof HTMLElement && typeof errorElement.focus === 'function') {
            errorElement.focus()
          }
        }, 300)
      }
    }
  }, [errors, offset, focusOnError])

  // Auto-scroll when errors change (optional)
  useEffect(() => {
    if (autoScroll && Object.keys(errors).length > 0) {
      scrollToFirstError()
    }
  }, [errors, autoScroll, scrollToFirstError])

  return {
    scrollToFirstError,
    hasErrors: Object.keys(errors).length > 0,
    firstErrorField: Object.keys(errors)[0] || null,
  }
}

/**
 * Wrapper for form.handleSubmit that auto-scrolls to errors on validation failure.
 *
 * Usage:
 * ```tsx
 * const form = useForm()
 *
 * <form onSubmit={handleSubmitWithScroll(form, onSubmit)}>
 * ```
 */
export function createScrollableSubmit<T extends FieldValues>(
  form: { handleSubmit: (onValid: (data: T) => void, onInvalid?: () => void) => (e?: React.BaseSyntheticEvent) => Promise<void> },
  onValid: (data: T) => void | Promise<void>,
  options?: { offset?: number }
) {
  const offset = options?.offset ?? 100

  return form.handleSubmit(
    onValid,
    (errors) => {
      const errorKeys = Object.keys(errors)
      if (errorKeys.length === 0) return

      const firstErrorKey = errorKeys[0]
      let errorElement = document.querySelector(`[name="${firstErrorKey}"]`)

      if (!errorElement) {
        errorElement = document.querySelector('[aria-invalid="true"]')
      }

      if (errorElement) {
        const elementRect = errorElement.getBoundingClientRect()
        const absoluteTop = elementRect.top + window.pageYOffset - offset

        window.scrollTo({
          top: absoluteTop,
          behavior: 'smooth',
        })

        setTimeout(() => {
          const inputElement = errorElement?.querySelector('input, select, textarea') as HTMLElement | null
          if (inputElement && typeof inputElement.focus === 'function') {
            inputElement.focus()
          }
        }, 300)
      }
    }
  )
}
