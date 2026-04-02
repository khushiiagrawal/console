import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  STORAGE_KEY_TOKEN: 'kc-auth-token',
} })

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual,
  FETCH_DEFAULT_TIMEOUT_MS: 10000,
  KUBECTL_EXTENDED_TIMEOUT_MS: 60000,
} })

vi.mock('../../lib/kubectlProxy', () => ({
  kubectlProxy: {
    exec: vi.fn().mockRejectedValue(new Error('not available')),
  },
}))

vi.mock('../useDemoMode', () => ({
  useDemoMode: () => ({ isDemoMode: false, toggleDemoMode: vi.fn(), setDemoMode: vi.fn() }),
}))

import { useProwJobs } from '../useProw'

describe('useProwJobs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('not available'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns expected shape', () => {
    const { result } = renderHook(() => useProwJobs())
    expect(result.current).toHaveProperty('isLoading')
  })
})
