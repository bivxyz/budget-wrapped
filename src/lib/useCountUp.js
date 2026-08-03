import { useEffect, useRef, useState } from 'react'

// Animates a number from 0 -> target with an ease-out curve.
// Restarts whenever `target` or `key` changes (used to retrigger per-slide).
export function useCountUp(target, { duration = 1400, key = 0 } = {}) {
  const [value, setValue] = useState(0)
  const frame = useRef()
  const start = useRef()

  useEffect(() => {
    cancelAnimationFrame(frame.current)
    start.current = undefined
    const from = 0
    const to = Number(target) || 0

    const tick = (now) => {
      if (start.current === undefined) start.current = now
      const elapsed = now - start.current
      const t = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3) // easeOutCubic
      setValue(from + (to - from) * eased)
      if (t < 1) frame.current = requestAnimationFrame(tick)
      else setValue(to)
    }

    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [target, duration, key])

  return value
}
