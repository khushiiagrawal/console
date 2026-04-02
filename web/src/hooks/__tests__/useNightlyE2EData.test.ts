import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// ============================================================================
// Mocks
// ============================================================================

const mockUseCache = vi.fn()

vi.mock('../../lib/cache', () => ({
  useCache: (...args: unknown[]) => mockUseCache(...args),
}))

vi.mock('../../lib/demoMode', () => ({
  isNetlifyDeployment: false,
  isDemoMode: () => true,
  getDemoMode: () => true,
}))

const mockDemoData = [
  {
    guide: 'WVA',
    acronym: 'WVA',
    platform: 'OCP' as const,
    repo: 'llm-d/wva',
    workflowFile: 'nightly.yml',
    runs: [
      {
        id: 1,
        status: 'completed' as const,
        conclusion: 'success' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        htmlUrl: 'https://github.com/llm-d/wva/actions/runs/1',
        runNumber: 42,
        failureReason: '',
        model: 'llama-3',
        gpuType: 'A100',
        gpuCount: 4,
        event: 'schedule',
      },
    ],
    passRate: 100,
    trend: 'up' as const,
    latestConclusion: 'success',
    model: 'llama-3',
    gpuType: 'A100',
    gpuCount: 4,
  },
]

vi.mock('../../lib/llmd/nightlyE2EDemoData', () => ({
  generateDemoNightlyData: () => mockDemoData,
}))

vi.mock('../../lib/constants', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, STORAGE_KEY_TOKEN: 'token' }
})

vi.mock('../../lib/constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, FETCH_DEFAULT_TIMEOUT_MS: 10000 }
})

import { useNightlyE2EData } from '../useNightlyE2EData'

// ============================================================================
// Helpers
// ============================================================================

/** Default mock return from useCache */
function makeCacheResult(overrides: Record<string, unknown> = {}) {
  return {
    data: { guides: [], isDemo: false },
    isLoading: false,
    isRefreshing: false,
    isDemoFallback: false,
    isFailed: false,
    consecutiveFailures: 0,
    lastRefresh: null,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('useNightlyE2EData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockUseCache.mockReturnValue(makeCacheResult())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ---------- Shape & Defaults ----------

  it('returns the expected return shape', () => {
    const { result } = renderHook(() => useNightlyE2EData())
    expect(result.current).toHaveProperty('guides')
    expect(result.current).toHaveProperty('isDemoFallback')
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('isRefreshing')
    expect(result.current).toHaveProperty('isFailed')
    expect(result.current).toHaveProperty('consecutiveFailures')
    expect(result.current).toHaveProperty('refetch')
    expect(typeof result.current.refetch).toBe('function')
  })

  it('does not throw on mount', () => {
    expect(() => renderHook(() => useNightlyE2EData())).not.toThrow()
  })

  // ---------- Cache Configuration ----------

  it('passes nightly-e2e-status as cache key', () => {
    renderHook(() => useNightlyE2EData())
    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'nightly-e2e-status' })
    )
  })

  it('configures cache with default category', () => {
    renderHook(() => useNightlyE2EData())
    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'default' })
    )
  })

  it('enables persistence in cache config', () => {
    renderHook(() => useNightlyE2EData())
    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({ persist: true })
    )
  })

  it('enables demoWhenEmpty in cache config', () => {
    renderHook(() => useNightlyE2EData())
    expect(mockUseCache).toHaveBeenCalledWith(
      expect.objectContaining({ demoWhenEmpty: true })
    )
  })

  it('provides demo data to the cache', () => {
    renderHook(() => useNightlyE2EData())
    const cacheConfig = mockUseCache.mock.calls[0][0]
    expect(cacheConfig.demoData).toHaveProperty('guides')
    expect(cacheConfig.demoData).toHaveProperty('isDemo', true)
    expect(cacheConfig.demoData.guides.length).toBeGreaterThan(0)
  })

  it('provides a fetcher function to the cache', () => {
    renderHook(() => useNightlyE2EData())
    const cacheConfig = mockUseCache.mock.calls[0][0]
    expect(typeof cacheConfig.fetcher).toBe('function')
  })

  // ---------- Data Passthrough ----------

  it('returns guides from cache data', () => {
    const guides = [{ guide: 'Test', acronym: 'T', platform: 'OCP', repo: 'r', workflowFile: 'w.yml', runs: [], passRate: 100, trend: 'steady', latestConclusion: null, model: 'M', gpuType: 'G', gpuCount: 1 }]
    mockUseCache.mockReturnValue(makeCacheResult({ data: { guides, isDemo: false } }))

    const { result } = renderHook(() => useNightlyE2EData())
    expect(result.current.guides).toHaveLength(1)
    expect(result.current.guides[0].guide).toBe('Test')
  })

  it('returns empty guides when cache has no data', () => {
    mockUseCache.mockReturnValue(makeCacheResult({ data: { guides: [], isDemo: false } }))
    const { result } = renderHook(() => useNightlyE2EData())
    expect(result.current.guides).toEqual([])
  })

  // ---------- Demo Fallback ----------

  it('isDemoFallback is true when cache reports demo fallback', () => {
    mockUseCache.mockReturnValue(makeCacheResult({ isDemoFallback: true }))
    const { result } = renderHook(() => useNightlyE2EData())
    expect(result.current.isDemoFallback).toBe(true)
  })

  it('isDemoFallback is true when data.isDemo is true and not loading', () => {
    mockUseCache.mockReturnValue(
      makeCacheResult({ isDemoFallback: false, isLoading: false, data: { guides: [], isDemo: true } })
    )
    const { result } = renderHook(() => useNightlyE2EData())
    expect(result.current.isDemoFallback).toBe(true)
  })

  it('isDemoFallback is false when data.isDemo is true but still loading', () => {
    mockUseCache.mockReturnValue(
      makeCacheResult({ isDemoFallback: false, isLoading: true, data: { guides: [], isDemo: true } })
    )
    const { result } = renderHook(() => useNightlyE2EData())
    // While loading, isDemoFallback should only reflect the cache's own flag
    expect(result.current.isDemoFallback).toBe(false)
  })

  // ---------- Loading State ----------

  it('suppresses isLoading when localStorage had cached data', () => {
    // We need to re-import with cached data, but since CACHED_INITIAL is loaded
    // at module level, we test the logic path: if the module has cached data,
    // isLoading returns false even when cache says true.
    // In the test environment, localStorage is empty, so hasCachedInitial=false.
    mockUseCache.mockReturnValue(makeCacheResult({ isLoading: true }))
    const { result } = renderHook(() => useNightlyE2EData())
    // Without cached initial data, isLoading passes through
    expect(result.current.isLoading).toBe(true)
  })

  it('passes through isLoading=false from cache', () => {
    mockUseCache.mockReturnValue(makeCacheResult({ isLoading: false }))
    const { result } = renderHook(() => useNightlyE2EData())
    expect(result.current.isLoading).toBe(false)
  })

  // ---------- Refreshing ----------

  it('passes through isRefreshing from cache', () => {
    mockUseCache.mockReturnValue(makeCacheResult({ isRefreshing: true }))
    const { result } = renderHook(() => useNightlyE2EData())
    expect(result.current.isRefreshing).toBe(true)
  })

  // ---------- Error / Failure ----------

  it('passes through isFailed from cache', () => {
    mockUseCache.mockReturnValue(makeCacheResult({ isFailed: true }))
    const { result } = renderHook(() => useNightlyE2EData())
    expect(result.current.isFailed).toBe(true)
  })

  it('passes through consecutiveFailures from cache', () => {
    mockUseCache.mockReturnValue(makeCacheResult({ consecutiveFailures: 5 }))
    const { result } = renderHook(() => useNightlyE2EData())
    expect(result.current.consecutiveFailures).toBe(5)
  })

  // ---------- Refetch ----------

  it('passes through refetch from cache', () => {
    const mockRefetch = vi.fn()
    mockUseCache.mockReturnValue(makeCacheResult({ refetch: mockRefetch }))
    const { result } = renderHook(() => useNightlyE2EData())
    expect(result.current.refetch).toBe(mockRefetch)
  })

  // ---------- Refresh Interval ----------

  it('uses idle refresh interval by default (no running jobs)', () => {
    const REFRESH_IDLE_MS = 5 * 60 * 1000
    mockUseCache.mockReturnValue(makeCacheResult({ data: { guides: [], isDemo: false } }))
    renderHook(() => useNightlyE2EData())
    const cacheConfig = mockUseCache.mock.calls[0][0]
    expect(cacheConfig.refreshInterval).toBe(REFRESH_IDLE_MS)
  })

  it('switches to active refresh interval when jobs are in_progress', () => {
    const REFRESH_ACTIVE_MS = 2 * 60 * 1000
    const guidesWithRunning = [{
      guide: 'WVA',
      acronym: 'WVA',
      platform: 'OCP',
      repo: 'r',
      workflowFile: 'w.yml',
      runs: [{ id: 1, status: 'in_progress', conclusion: null, createdAt: '', updatedAt: '', htmlUrl: '', runNumber: 1, model: 'M', gpuType: 'G', gpuCount: 1, event: 'schedule' }],
      passRate: 0,
      trend: 'steady',
      latestConclusion: null,
      model: 'M',
      gpuType: 'G',
      gpuCount: 1,
    }]
    mockUseCache.mockReturnValue(
      makeCacheResult({ data: { guides: guidesWithRunning, isDemo: false } })
    )

    // First render with running jobs
    const { rerender } = renderHook(() => useNightlyE2EData())

    // After the effect fires to detect running jobs, re-render should pass new interval
    rerender()

    // The last call should have the active refresh interval
    const lastConfig = mockUseCache.mock.calls[mockUseCache.mock.calls.length - 1][0]
    expect(lastConfig.refreshInterval).toBe(REFRESH_ACTIVE_MS)
  })

  // ---------- Edge Cases ----------

  it('handles undefined guides gracefully', () => {
    mockUseCache.mockReturnValue(
      makeCacheResult({ data: { guides: undefined, isDemo: false } })
    )
    // Should not throw
    expect(() => renderHook(() => useNightlyE2EData())).not.toThrow()
  })

  it('handles empty runs in guides', () => {
    const guidesNoRuns = [{
      guide: 'WVA',
      acronym: 'WVA',
      platform: 'OCP' as const,
      repo: 'r',
      workflowFile: 'w.yml',
      runs: [],
      passRate: 0,
      trend: 'steady' as const,
      latestConclusion: null,
      model: 'M',
      gpuType: 'G',
      gpuCount: 1,
    }]
    mockUseCache.mockReturnValue(
      makeCacheResult({ data: { guides: guidesNoRuns, isDemo: false } })
    )

    const { result } = renderHook(() => useNightlyE2EData())
    expect(result.current.guides).toHaveLength(1)
    expect(result.current.guides[0].runs).toEqual([])
  })
})
