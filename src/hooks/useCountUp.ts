import { useEffect, useRef, useState } from 'react'

/**
 * Animates a number from its previous value to `target` (ease-out, ~700ms).
 *
 * Respects `prefers-reduced-motion`: those users get the final value
 * immediately. Re-targets smoothly when the value changes (a lead moving
 * stage updates the KPI without a jump back to zero).
 */
export function useCountUp(target: number, durationMs = 700) {
  // Start at 0 so the first frame is not the final value (which would flash
  // and then restart); reduced-motion users start, and stay, at the target.
  const [value, setValue] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      ? target
      : 0
  )
  const fromRef = useRef(0)
  const frameRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const from = fromRef.current
    if (reduced || from === target) {
      fromRef.current = target
      setValue(target)
      return
    }

    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(from + (target - from) * eased)
      if (t < 1) frameRef.current = requestAnimationFrame(tick)
      else fromRef.current = target
    }
    frameRef.current = requestAnimationFrame(tick)
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      fromRef.current = target
    }
  }, [target, durationMs])

  return value
}
