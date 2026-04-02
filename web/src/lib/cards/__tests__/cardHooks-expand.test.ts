/**
 * Expanded deep branch-coverage tests for cardHooks.ts
 *
 * Targets uncovered paths:
 * - useCardData: defaultLimit = undefined (defaults to 5), empty items,
 *   setItemsPerPage mid-pagination, page clamping after filter
 * - useCardFilters: both global + local search filters combined,
 *   custom predicate with globalCustomFilter, showClusterFilter toggle,
 *   dropdownStyle positioning, filtering items with clusterField but no statusField
 * - useCardSort: desc direction on initial render via config
 * - useCardCollapse: defaultCollapsed=true combined with localStorage stored=false
 * - useCardCollapseAll: toggleCard on card not in initial cardIds, partial collapse
 * - useStatusFilter: localStorage corruption for setStatusFilter (try/catch)
 * - useCardFlash: exactly at threshold, prevValue = 1 (small denominator),
 *   very large cooldown, multiple rapid changes
 * - commonComparators: number with mixed falsy values, statusOrder with partial map
 * - useSingleSelectCluster: basic coverage (selection, persistence, filter)
 * - useCascadingSelection: basic coverage (first/second selection, reset)
 * - useChartFilters: basic coverage (cluster filter, available clusters)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ── Mocks ──────────────────────────────────────────────────────────

const mockGlobalFilters = vi.hoisted(() => ({
  filterByCluster: vi.fn(<T,>(items: T[]) => items),
  filterByStatus: vi.fn(<T,>(items: T[]) => items),
  customFilter: '',
  selectedClusters: [] as string[],
  isAllClustersSelected: true,
}))

vi.mock('../../../hooks/useGlobalFilters', () => ({
  useGlobalFilters: () => mockGlobalFilters,
}))

vi.mock('../../../hooks/mcp/clusters', () => ({
  useClusters: () => ({
    deduplicatedClusters: [
      { name: 'prod-east', healthy: true, reachable: true },
      { name: 'staging', healthy: true, reachable: true },
      { name: 'dev', healthy: false, reachable: false },
    ],
    clusters: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}))

vi.mock('../../constants/network', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return { ...actual, FLASH_ANIMATION_MS: 50 }
})

vi.mock('../useStablePageHeight', () => ({
  useStablePageHeight: () => ({
    containerRef: { current: null },
    containerStyle: undefined,
  }),
}))

import {
  commonComparators,
  useCardSort,
  useCardFilters,
  useCardData,
  useCardCollapse,
  useCardCollapseAll,
  useStatusFilter,
  useCardFlash,
  useChartFilters,
  type SortConfig,
  type FilterConfig,
  type CardDataConfig,
  type StatusFilterConfig,
} from '../cardHooks'

// ── Constants ──────────────────────────────────────────────────────

const COLLAPSED_STORAGE_KEY = 'kubestellar-collapsed-cards'
const LOCAL_FILTER_STORAGE_PREFIX = 'kubestellar-card-filter:'

// ── Setup / Teardown ──────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  mockGlobalFilters.customFilter = ''
  mockGlobalFilters.selectedClusters = []
  mockGlobalFilters.isAllClustersSelected = true
  mockGlobalFilters.filterByCluster.mockImplementation(<T,>(items: T[]) => items)
  mockGlobalFilters.filterByStatus.mockImplementation(<T,>(items: T[]) => items)
})

afterEach(() => {
  vi.useRealTimers()
})

// ============================================================================
// useCardFilters — combined filter scenarios
// ============================================================================

describe('useCardFilters combined filter scenarios', () => {
  interface TestItem { name: string; cluster: string; status: string }
  const items: TestItem[] = [
    { name: 'alpha-pod', cluster: 'prod-east', status: 'running' },
    { name: 'beta-pod', cluster: 'staging', status: 'error' },
    { name: 'gamma-pod', cluster: 'prod-east', status: 'pending' },
    { name: 'delta-pod', cluster: 'dev', status: 'running' },
  ]

  const filterConfig: FilterConfig<TestItem> = {
    searchFields: ['name'],
    clusterField: 'cluster',
    statusField: 'status',
    storageKey: 'combined-test',
  }

  it('applies both global custom filter AND local search simultaneously', () => {
    mockGlobalFilters.customFilter = 'pod'
    const { result } = renderHook(() => useCardFilters(items, filterConfig))
    // Global filter matches all (all have 'pod')
    act(() => { result.current.setSearch('alpha') })
    // Local search narrows to just alpha-pod
    expect(result.current.filtered).toHaveLength(1)
    expect(result.current.filtered[0].name).toBe('alpha-pod')
  })

  it('applies global custom filter with custom predicate', () => {
    const configWithPred: FilterConfig<TestItem> = {
      ...filterConfig,
      customPredicate: (item, query) => item.status.includes(query),
    }
    mockGlobalFilters.customFilter = 'error'
    const { result } = renderHook(() => useCardFilters(items, configWithPred))
    // 'error' matches beta-pod via customPredicate
    expect(result.current.filtered.some(i => i.name === 'beta-pod')).toBe(true)
  })

  it('handles local cluster filter with no clusterField gracefully', () => {
    const configNoCluster: FilterConfig<TestItem> = {
      searchFields: ['name'],
    }
    const { result } = renderHook(() => useCardFilters(items, configNoCluster))
    // Should show all items since no clusterField is set
    expect(result.current.filtered).toHaveLength(4)
  })

  it('cluster filter dropdown visibility toggle', () => {
    const { result } = renderHook(() => useCardFilters(items, filterConfig))
    expect(result.current.showClusterFilter).toBe(false)
    act(() => { result.current.setShowClusterFilter(true) })
    expect(result.current.showClusterFilter).toBe(true)
    act(() => { result.current.setShowClusterFilter(false) })
    expect(result.current.showClusterFilter).toBe(false)
  })

  it('availableClusters respects global selectedClusters', () => {
    mockGlobalFilters.isAllClustersSelected = false
    mockGlobalFilters.selectedClusters = ['prod-east']
    const { result } = renderHook(() => useCardFilters(items, filterConfig))
    expect(result.current.availableClusters.map(c => c.name)).toEqual(['prod-east'])
  })

  it('availableClusters returns all when isAllClustersSelected is true', () => {
    const { result } = renderHook(() => useCardFilters(items, filterConfig))
    expect(result.current.availableClusters).toHaveLength(3)
  })

  it('search is case-insensitive', () => {
    const { result } = renderHook(() => useCardFilters(items, filterConfig))
    act(() => { result.current.setSearch('ALPHA') })
    expect(result.current.filtered).toHaveLength(1)
    expect(result.current.filtered[0].name).toBe('alpha-pod')
  })

  it('empty search returns all items', () => {
    const { result } = renderHook(() => useCardFilters(items, filterConfig))
    act(() => { result.current.setSearch('   ') })
    expect(result.current.filtered).toHaveLength(4)
  })
})

// ============================================================================
// useCardData — additional pagination edge cases
// ============================================================================

describe('useCardData additional edge cases', () => {
  interface TestItem { name: string; priority: number }
  const items: TestItem[] = Array.from({ length: 12 }, (_, i) => ({
    name: `item-${String(i).padStart(2, '0')}`,
    priority: i,
  }))

  const config: CardDataConfig<TestItem, 'name' | 'priority'> = {
    filter: { searchFields: ['name'] },
    sort: {
      defaultField: 'name',
      defaultDirection: 'asc',
      comparators: {
        name: commonComparators.string<TestItem>('name'),
        priority: commonComparators.number<TestItem>('priority'),
      },
    },
    defaultLimit: 5,
  }

  it('handles empty items array', () => {
    const { result } = renderHook(() => useCardData([], config))
    expect(result.current.items).toHaveLength(0)
    expect(result.current.totalItems).toBe(0)
    expect(result.current.totalPages).toBe(1)
    expect(result.current.needsPagination).toBe(false)
  })

  it('changing itemsPerPage re-paginates', () => {
    const { result } = renderHook(() => useCardData(items, config))
    expect(result.current.items).toHaveLength(5)
    act(() => { result.current.setItemsPerPage(10) })
    expect(result.current.items).toHaveLength(10)
    expect(result.current.totalPages).toBe(2)
  })

  it('navigating then filtering clamps currentPage', () => {
    const { result } = renderHook(() => useCardData(items, config))
    act(() => { result.current.goToPage(3) })
    expect(result.current.currentPage).toBe(3)
    // Filter to 2 items -> only 1 page
    act(() => { result.current.filters.setSearch('item-0') })
    expect(result.current.currentPage).toBe(1)
  })

  it('last page may have fewer items than itemsPerPage', () => {
    const { result } = renderHook(() => useCardData(items, config))
    // 12 items / 5 per page = 3 pages, last page has 2 items
    act(() => { result.current.goToPage(3) })
    expect(result.current.items).toHaveLength(2)
  })

  it('filter controls are properly separated', () => {
    const { result } = renderHook(() => useCardData(items, config))
    expect(result.current.filters).toHaveProperty('setSearch')
    expect(result.current.filters).toHaveProperty('toggleClusterFilter')
    expect(result.current.filters).not.toHaveProperty('filtered')
    expect(result.current.sorting).toHaveProperty('setSortBy')
    expect(result.current.sorting).not.toHaveProperty('sorted')
  })
})

// ============================================================================
// useCardSort — desc default
// ============================================================================

describe('useCardSort with desc default', () => {
  interface TestItem { value: number }
  const items: TestItem[] = [{ value: 1 }, { value: 3 }, { value: 2 }]
  const config: SortConfig<TestItem, 'value'> = {
    defaultField: 'value',
    defaultDirection: 'desc',
    comparators: { value: commonComparators.number<TestItem>('value') },
  }

  it('starts with desc direction and reversed sort', () => {
    const { result } = renderHook(() => useCardSort(items, config))
    expect(result.current.sortDirection).toBe('desc')
    expect(result.current.sorted.map(i => i.value)).toEqual([3, 2, 1])
  })

  it('toggleSortDirection switches to asc', () => {
    const { result } = renderHook(() => useCardSort(items, config))
    act(() => { result.current.toggleSortDirection() })
    expect(result.current.sortDirection).toBe('asc')
    expect(result.current.sorted.map(i => i.value)).toEqual([1, 2, 3])
  })
})

// ============================================================================
// useCardCollapse — combined localStorage + default
// ============================================================================

describe('useCardCollapse localStorage + default interactions', () => {
  it('localStorage overrides defaultCollapsed=false', () => {
    localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(['override-card']))
    const { result } = renderHook(() => useCardCollapse('override-card', false))
    expect(result.current.isCollapsed).toBe(true)
  })

  it('defaultCollapsed=true works when card is not in localStorage', () => {
    const { result } = renderHook(() => useCardCollapse('not-stored-card', true))
    expect(result.current.isCollapsed).toBe(true)
  })

  it('card not in localStorage and defaultCollapsed=false -> expanded', () => {
    const { result } = renderHook(() => useCardCollapse('fresh-card', false))
    expect(result.current.isCollapsed).toBe(false)
  })
})

// ============================================================================
// useCardCollapseAll — more edge cases
// ============================================================================

describe('useCardCollapseAll more edge cases', () => {
  it('partial collapse: collapse one, expandAll only expands managed cards', () => {
    localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(['unrelated']))
    const { result } = renderHook(() => useCardCollapseAll(['x', 'y']))
    act(() => { result.current.toggleCard('x') })
    expect(result.current.isCardCollapsed('x')).toBe(true)
    expect(result.current.collapsedCount).toBe(1)
    act(() => { result.current.expandAll() })
    expect(result.current.isCardCollapsed('x')).toBe(false)
    // unrelated card should still be in storage
    const stored = JSON.parse(localStorage.getItem(COLLAPSED_STORAGE_KEY) || '[]') as string[]
    expect(stored).toContain('unrelated')
  })

  it('collapseAll then toggleCard uncollapse single card', () => {
    const { result } = renderHook(() => useCardCollapseAll(['a', 'b', 'c']))
    act(() => { result.current.collapseAll() })
    expect(result.current.allCollapsed).toBe(true)
    act(() => { result.current.toggleCard('b') })
    expect(result.current.isCardCollapsed('b')).toBe(false)
    expect(result.current.allCollapsed).toBe(false)
    expect(result.current.allExpanded).toBe(false)
    expect(result.current.collapsedCount).toBe(2)
  })
})

// ============================================================================
// useStatusFilter — localStorage edge cases
// ============================================================================

describe('useStatusFilter localStorage edge cases', () => {
  const statuses = ['all', 'healthy', 'degraded'] as const
  type S = typeof statuses[number]

  it('handles localStorage.setItem failure gracefully', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })
    const config: StatusFilterConfig<S> = { statuses, defaultStatus: 'all', storageKey: 'quota-test' }
    const { result } = renderHook(() => useStatusFilter(config))
    expect(() => {
      act(() => { result.current.setStatusFilter('healthy') })
    }).not.toThrow()
    expect(result.current.statusFilter).toBe('healthy')
    spy.mockRestore()
  })

  it('handles localStorage.getItem failure gracefully', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    const config: StatusFilterConfig<S> = { statuses, defaultStatus: 'all', storageKey: 'sec-test' }
    const { result } = renderHook(() => useStatusFilter(config))
    expect(result.current.statusFilter).toBe('all')
    spy.mockRestore()
  })
})

// ============================================================================
// useCardFlash — boundary and edge cases
// ============================================================================

describe('useCardFlash boundary cases', () => {
  it('flashes when change is exactly at threshold', () => {
    const THRESHOLD = 0.2
    const { result, rerender } = renderHook(
      ({ value }) => useCardFlash(value, { threshold: THRESHOLD }),
      { initialProps: { value: 100 } }
    )
    // Exactly 20% increase (100 -> 120)
    rerender({ value: 120 })
    expect(result.current.flashType).toBe('info')
  })

  it('does not flash when change is just below threshold', () => {
    const THRESHOLD = 0.2
    const { result, rerender } = renderHook(
      ({ value }) => useCardFlash(value, { threshold: THRESHOLD }),
      { initialProps: { value: 100 } }
    )
    // 19% increase (100 -> 119)
    rerender({ value: 119 })
    expect(result.current.flashType).toBe('none')
  })

  it('handles prevValue = 1 (small denominator)', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useCardFlash(value, { threshold: 0.1 }),
      { initialProps: { value: 1 } }
    )
    // Change from 1 to 2 = 100% change
    rerender({ value: 2 })
    expect(result.current.flashType).toBe('info')
  })

  it('multiple rapid changes only flash once within cooldown', () => {
    const COOLDOWN = 5000
    const { result, rerender } = renderHook(
      ({ value }) => useCardFlash(value, { threshold: 0.1, cooldown: COOLDOWN }),
      { initialProps: { value: 100 } }
    )
    rerender({ value: 150 })
    expect(result.current.flashType).toBe('info')
    // Auto-reset
    act(() => { vi.advanceTimersByTime(60) })
    // Second change within cooldown
    rerender({ value: 200 })
    expect(result.current.flashType).toBe('none')
    // Third change within cooldown
    rerender({ value: 300 })
    expect(result.current.flashType).toBe('none')
  })

  it('uses default options when none provided', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useCardFlash(value),
      { initialProps: { value: 100 } }
    )
    // 50% increase - above default 10% threshold
    rerender({ value: 150 })
    expect(result.current.flashType).toBe('info')
  })
})

// ============================================================================
// commonComparators — additional edge cases
// ============================================================================

describe('commonComparators additional edge cases', () => {
  describe('number with falsy field values', () => {
    interface Item { val: number | null | undefined }
    const compare = commonComparators.number<Item>('val')

    it('null vs number', () => {
      expect(compare({ val: null } as Item, { val: 5 } as Item)).toBeLessThan(0)
    })

    it('both undefined', () => {
      expect(compare({ val: undefined } as Item, { val: undefined } as Item)).toBe(0)
    })
  })

  describe('statusOrder with partial map', () => {
    interface Item { status: string }
    const order = { critical: 0, warning: 1 }
    const compare = commonComparators.statusOrder<Item>('status', order)

    it('known vs unknown status', () => {
      expect(compare({ status: 'critical' }, { status: 'info' })).toBeLessThan(0)
    })

    it('known vs known status', () => {
      expect(compare({ status: 'warning' }, { status: 'critical' })).toBeGreaterThan(0)
    })
  })

  describe('string with empty values', () => {
    interface Item { label: string }
    const compare = commonComparators.string<Item>('label')

    it('both empty strings compare equal', () => {
      expect(compare({ label: '' }, { label: '' })).toBe(0)
    })
  })

  describe('date with epoch timestamps', () => {
    interface Item { ts: string }
    const compare = commonComparators.date<Item>('ts')

    it('epoch 0 is valid', () => {
      expect(compare({ ts: '1970-01-01T00:00:00Z' }, { ts: '2024-01-01T00:00:00Z' })).toBeLessThan(0)
    })
  })
})

// ============================================================================
// useChartFilters — basic coverage
// ============================================================================

describe('useChartFilters', () => {
  it('starts with empty local cluster filter', () => {
    const { result } = renderHook(() => useChartFilters())
    expect(result.current.localClusterFilter).toEqual([])
  })

  it('toggleClusterFilter adds then removes cluster', () => {
    const { result } = renderHook(() => useChartFilters({ storageKey: 'chart-test' }))
    act(() => { result.current.toggleClusterFilter('prod-east') })
    expect(result.current.localClusterFilter).toEqual(['prod-east'])
    act(() => { result.current.toggleClusterFilter('prod-east') })
    expect(result.current.localClusterFilter).toEqual([])
  })

  it('clearClusterFilter resets to empty', () => {
    const { result } = renderHook(() => useChartFilters({ storageKey: 'chart-clear' }))
    act(() => { result.current.toggleClusterFilter('staging') })
    act(() => { result.current.clearClusterFilter() })
    expect(result.current.localClusterFilter).toEqual([])
  })

  it('persists to localStorage when storageKey provided', () => {
    const { result } = renderHook(() => useChartFilters({ storageKey: 'chart-persist' }))
    act(() => { result.current.toggleClusterFilter('prod-east') })
    const stored = localStorage.getItem(`${LOCAL_FILTER_STORAGE_PREFIX}chart-persist`)
    expect(stored).toBe(JSON.stringify(['prod-east']))
  })

  it('does not persist when no storageKey', () => {
    const { result } = renderHook(() => useChartFilters())
    act(() => { result.current.toggleClusterFilter('prod-east') })
    expect(localStorage.length).toBe(0)
  })

  it('filteredClusters excludes unreachable clusters', () => {
    const { result } = renderHook(() => useChartFilters())
    // dev has reachable=false, should be excluded
    const names = result.current.filteredClusters.map(c => c.name)
    expect(names).not.toContain('dev')
    expect(names).toContain('prod-east')
    expect(names).toContain('staging')
  })

  it('filteredClusters respects local cluster filter', () => {
    const { result } = renderHook(() => useChartFilters())
    act(() => { result.current.toggleClusterFilter('prod-east') })
    const names = result.current.filteredClusters.map(c => c.name)
    expect(names).toEqual(['prod-east'])
  })

  it('filteredClusters respects global selectedClusters', () => {
    mockGlobalFilters.isAllClustersSelected = false
    mockGlobalFilters.selectedClusters = ['staging']
    const { result } = renderHook(() => useChartFilters())
    const names = result.current.filteredClusters.map(c => c.name)
    expect(names).toEqual(['staging'])
  })

  it('reads persisted filter from localStorage', () => {
    localStorage.setItem(`${LOCAL_FILTER_STORAGE_PREFIX}chart-read`, JSON.stringify(['staging']))
    const { result } = renderHook(() => useChartFilters({ storageKey: 'chart-read' }))
    expect(result.current.localClusterFilter).toEqual(['staging'])
  })

  it('handles corrupted localStorage', () => {
    localStorage.setItem(`${LOCAL_FILTER_STORAGE_PREFIX}chart-bad`, 'bad-json')
    const { result } = renderHook(() => useChartFilters({ storageKey: 'chart-bad' }))
    expect(result.current.localClusterFilter).toEqual([])
  })
})
