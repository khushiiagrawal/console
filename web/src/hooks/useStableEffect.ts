/**
 * useStableEffect — a drop-in replacement for useEffect that prevents
 * infinite loops caused by unstable dependency references in React 19.
 *
 * Instead of comparing deps by reference (Object.is), this compares
 * a serialized fingerprint. If the fingerprint hasn't changed, the
 * effect is skipped even if the references are new.
 *
 * Usage: Replace useEffect(fn, [unstableDep]) with useStableEffect(fn, [unstableDep])
 */
import { useEffect, useRef } from 'react'

/** Serialize deps into a stable fingerprint string */
function fingerprint(deps: readonly unknown[]): string {
  return deps.map(d => {
    if (d === null || d === undefined) return String(d)
    if (typeof d === 'function') return 'fn' // functions are always "same"
    if (typeof d === 'object') {
      if (Array.isArray(d)) return `[${d.length}]`
      if (d instanceof Date) return `D${d.getTime()}`
      try { return JSON.stringify(d) } catch { return `obj${Object.keys(d as object).length}` }
    }
    return String(d)
  }).join('|')
}

export function useStableEffect(
  effect: () => void | (() => void),
  deps: readonly unknown[]
): void {
  const prevFP = useRef<string>('')
  const cleanupRef = useRef<(() => void) | void>(undefined)

  useEffect(() => {
    const fp = fingerprint(deps)
    if (fp === prevFP.current) return
    prevFP.current = fp

    // Run cleanup from previous effect
    if (typeof cleanupRef.current === 'function') {
      cleanupRef.current()
    }

    cleanupRef.current = effect()

    return () => {
      if (typeof cleanupRef.current === 'function') {
        cleanupRef.current()
        cleanupRef.current = undefined
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  })
}
