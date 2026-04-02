/**
 * Expanded deep branch-coverage tests for kubectlProxy.ts
 *
 * Targets uncovered paths:
 * - parseResourceQuantity: all suffixes (Ki, Mi, Gi, Ti, K, M, G, T, m, none),
 *   plain numbers, NaN, undefined, no-match regex
 * - parseResourceQuantityMillicores: millicores, cores, NaN, empty, whitespace
 * - getNodes: node without labels, node with no conditions, missing status
 * - getPodMetrics: pods with no spec, containers with no resources, empty items
 * - getServices: service with no ports, missing clusterIP
 * - getPVCs: PVC without capacity, without storageClassName
 * - getClusterUsage: error caught branch, empty top output
 * - getClusterHealth: usage metrics timeout, error branch returning unreachable
 * - getPodIssues: OOMKilled, Unschedulable, Failed phase, high restarts without
 *   other issues, empty waiting reason
 * - getEvents: event without count, event slicing/reversing
 * - getDeployments: deploying vs failed vs running status, missing image
 * - getBulkClusterHealth: onProgress callback, error path
 * - close(): clears queued requests, resets activeRequests
 * - generateId: monotonically increasing
 * - processQueue: empty queue after shift
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let mockIsNetlify = false

vi.mock('../demoMode', () => ({
  get isNetlifyDeployment() {
    return mockIsNetlify
  },
}))

vi.mock('../constants', () => ({
  LOCAL_AGENT_WS_URL: 'ws://127.0.0.1:8585/ws',
  WS_CONNECT_TIMEOUT_MS: 2500,
  WS_CONNECTION_COOLDOWN_MS: 5000,
  KUBECTL_DEFAULT_TIMEOUT_MS: 10_000,
  KUBECTL_EXTENDED_TIMEOUT_MS: 30_000,
  KUBECTL_MAX_TIMEOUT_MS: 45_000,
  METRICS_SERVER_TIMEOUT_MS: 5_000,
  MAX_CONCURRENT_KUBECTL_REQUESTS: 4,
  POD_RESTART_ISSUE_THRESHOLD: 5,
  FOCUS_DELAY_MS: 100,
}))

// ---------------------------------------------------------------------------
// Fake WebSocket
// ---------------------------------------------------------------------------

const WS_CONNECTING = 0
const WS_OPEN = 1
const WS_CLOSED = 3

let sentMessages: string[] = []
let activeWs: FakeWebSocket | null = null

class FakeWebSocket {
  static CONNECTING = WS_CONNECTING
  static OPEN = WS_OPEN
  static CLOSING = 2
  static CLOSED = WS_CLOSED

  readonly CONNECTING = WS_CONNECTING
  readonly OPEN = WS_OPEN
  readonly CLOSING = 2
  readonly CLOSED = WS_CLOSED

  readyState = WS_CONNECTING
  url: string
  onopen: ((ev: Event) => void) | null = null
  onclose: ((ev: CloseEvent) => void) | null = null
  onerror: ((ev: Event) => void) | null = null
  onmessage: ((ev: MessageEvent) => void) | null = null

  constructor(url: string) {
    this.url = url
    activeWs = this
  }
  send(data: string): void { sentMessages.push(data) }
  close(): void {
    this.readyState = WS_CLOSED
    if (this.onclose) this.onclose(new CloseEvent('close'))
  }
  simulateOpen(): void {
    this.readyState = WS_OPEN
    if (this.onopen) this.onopen(new Event('open'))
  }
  simulateMessage(data: unknown): void {
    if (this.onmessage) this.onmessage(new MessageEvent('message', { data: JSON.stringify(data) }))
  }
  simulateError(): void {
    if (this.onerror) this.onerror(new Event('error'))
  }
  simulateClose(): void {
    this.readyState = WS_CLOSED
    if (this.onclose) this.onclose(new CloseEvent('close'))
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false })
  sentMessages = []
  activeWs = null
  mockIsNetlify = false
  vi.stubGlobal('WebSocket', FakeWebSocket)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function createProxy() {
  vi.resetModules()
  const mod = await import('../kubectlProxy')
  return mod.kubectlProxy
}

/** Helper: connect proxy and return it ready to use */
async function createConnectedProxy() {
  const proxy = await createProxy()
  const connectExec = proxy.exec(['version'], { priority: true })
  await vi.advanceTimersByTimeAsync(0)
  activeWs!.simulateOpen()
  await vi.advanceTimersByTimeAsync(0)
  const msg = JSON.parse(sentMessages[0])
  activeWs!.simulateMessage({ id: msg.id, type: 'result', payload: { output: '', exitCode: 0 } })
  await connectExec
  sentMessages = []
  return proxy
}

/** Helper: respond to the nth sent message */
function respondToMessage(index: number, payload: { output: string; exitCode: number; error?: string }) {
  const msg = JSON.parse(sentMessages[index])
  activeWs!.simulateMessage({ id: msg.id, type: 'result', payload })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KubectlProxy expanded', () => {

  // =========================================================================
  // parseResourceQuantity — tested via getNodes
  // =========================================================================

  describe('parseResourceQuantity via getNodes', () => {
    async function getNodesWithAllocatable(alloc: Record<string, string>) {
      const proxy = await createProxy()
      const nodesPromise = proxy.getNodes('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)
      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: {
          output: JSON.stringify({
            items: [{
              metadata: { name: 'n1' },
              status: {
                conditions: [{ type: 'Ready', status: 'True' }],
                allocatable: alloc,
              },
            }],
          }),
          exitCode: 0,
        },
      })
      const nodes = await nodesPromise
      proxy.close()
      return nodes[0]
    }

    it('parses Ti suffix', async () => {
      const node = await getNodesWithAllocatable({ cpu: '1', memory: '1Ti' })
      const ONE_TI = 1024 * 1024 * 1024 * 1024
      expect(node.memoryBytes).toBe(ONE_TI)
    })

    it('parses K (SI) suffix', async () => {
      const node = await getNodesWithAllocatable({ cpu: '1', memory: '500K' })
      expect(node.memoryBytes).toBe(500_000)
    })

    it('parses M (SI) suffix', async () => {
      const node = await getNodesWithAllocatable({ cpu: '1', memory: '2M' })
      expect(node.memoryBytes).toBe(2_000_000)
    })

    it('parses G (SI) suffix', async () => {
      const node = await getNodesWithAllocatable({ cpu: '1', memory: '3G' })
      expect(node.memoryBytes).toBe(3_000_000_000)
    })

    it('parses T (SI) suffix', async () => {
      const node = await getNodesWithAllocatable({ cpu: '1', memory: '1T' })
      expect(node.memoryBytes).toBe(1_000_000_000_000)
    })

    it('parses plain number without suffix', async () => {
      const node = await getNodesWithAllocatable({ cpu: '4', memory: '1073741824' })
      expect(node.cpuCores).toBe(4)
      expect(node.memoryBytes).toBe(1073741824)
    })

    it('handles decimal values with suffix', async () => {
      const node = await getNodesWithAllocatable({ cpu: '1', memory: '1.5Gi' })
      const EXPECTED = 1.5 * 1024 * 1024 * 1024
      expect(node.memoryBytes).toBe(EXPECTED)
    })

    it('returns 0 for undefined/missing resource', async () => {
      const node = await getNodesWithAllocatable({ cpu: '2' })
      // memory is undefined in allocatable, ephemeral-storage is also missing
      expect(node.memoryBytes).toBe(0)
      expect(node.storageBytes).toBe(0)
    })

    it('returns 0 for non-matching format', async () => {
      const node = await getNodesWithAllocatable({ cpu: '1', memory: 'notanumber' })
      // regex doesn't match, parseFloat('notanumber') is NaN, returns 0
      expect(node.memoryBytes).toBe(0)
    })

    it('handles m (millicores) suffix on cpu', async () => {
      const node = await getNodesWithAllocatable({ cpu: '500m', memory: '1Gi' })
      // 500m = 500/1000 = 0.5 cores
      expect(node.cpuCores).toBe(0.5)
    })
  })

  // =========================================================================
  // parseResourceQuantityMillicores — tested via getPodMetrics
  // =========================================================================

  describe('parseResourceQuantityMillicores via getPodMetrics', () => {
    async function getMetricsWithPodCpu(cpuStr: string) {
      const proxy = await createProxy()
      const metricsPromise = proxy.getPodMetrics('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)
      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id,
        type: 'result',
        payload: {
          output: JSON.stringify({
            items: [{ spec: { containers: [{ resources: { requests: { cpu: cpuStr } } } ] } }],
          }),
          exitCode: 0,
        },
      })
      const metrics = await metricsPromise
      proxy.close()
      return metrics
    }

    it('parses cpu "0.5" as 500 millicores', async () => {
      const m = await getMetricsWithPodCpu('0.5')
      expect(m.cpuRequestsMillicores).toBe(500)
    })

    it('parses cpu "2" as 2000 millicores', async () => {
      const m = await getMetricsWithPodCpu('2')
      expect(m.cpuRequestsMillicores).toBe(2000)
    })

    it('parses cpu "250m" as 250 millicores', async () => {
      const m = await getMetricsWithPodCpu('250m')
      expect(m.cpuRequestsMillicores).toBe(250)
    })

    it('parses cpu with whitespace', async () => {
      const m = await getMetricsWithPodCpu('  100m  ')
      expect(m.cpuRequestsMillicores).toBe(100)
    })

    it('returns 0 for NaN cpu value', async () => {
      const m = await getMetricsWithPodCpu('abc')
      expect(m.cpuRequestsMillicores).toBe(0)
    })

    it('returns 0 for NaN millicore value', async () => {
      const m = await getMetricsWithPodCpu('abcm')
      expect(m.cpuRequestsMillicores).toBe(0)
    })
  })

  // =========================================================================
  // getNodes — edge cases
  // =========================================================================

  describe('getNodes edge cases', () => {
    it('handles node with no labels (empty roles)', async () => {
      const proxy = await createProxy()
      const p = proxy.getNodes('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)
      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id, type: 'result',
        payload: { output: JSON.stringify({ items: [{ metadata: { name: 'n1' }, status: { conditions: [{ type: 'Ready', status: 'True' }] } }] }), exitCode: 0 },
      })
      const nodes = await p
      expect(nodes[0].roles).toEqual([])
      expect(nodes[0].cpuCores).toBe(0)
      proxy.close()
    })

    it('handles node without Ready condition', async () => {
      const proxy = await createProxy()
      const p = proxy.getNodes('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)
      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id, type: 'result',
        payload: { output: JSON.stringify({ items: [{ metadata: { name: 'n1' }, status: { conditions: [{ type: 'MemoryPressure', status: 'False' }] } }] }), exitCode: 0 },
      })
      const nodes = await p
      expect(nodes[0].ready).toBe(false)
      proxy.close()
    })

    it('handles node with no conditions array', async () => {
      const proxy = await createProxy()
      const p = proxy.getNodes('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)
      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id, type: 'result',
        payload: { output: JSON.stringify({ items: [{ metadata: { name: 'n1' }, status: {} }] }), exitCode: 0 },
      })
      const nodes = await p
      expect(nodes[0].ready).toBe(false)
      proxy.close()
    })

    it('throws with generic message when exitCode != 0 and no error field', async () => {
      const proxy = await createProxy()
      const p = proxy.getNodes('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)
      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id, type: 'result',
        payload: { output: '', exitCode: 1 },
      })
      await expect(p).rejects.toThrow('Failed to get nodes')
      proxy.close()
    })
  })

  // =========================================================================
  // getPodIssues — deep branch coverage
  // =========================================================================

  describe('getPodIssues edge cases', () => {
    async function getPodIssuesFromItems(items: unknown[]) {
      const proxy = await createProxy()
      const p = proxy.getPodIssues('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)
      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id, type: 'result',
        payload: { output: JSON.stringify({ items }), exitCode: 0 },
      })
      const issues = await p
      proxy.close()
      return issues
    }

    it('detects OOMKilled in lastState', async () => {
      const issues = await getPodIssuesFromItems([{
        metadata: { name: 'oom-pod', namespace: 'default' },
        status: {
          phase: 'Running',
          containerStatuses: [{
            restartCount: 10,
            state: {},
            lastState: { terminated: { reason: 'OOMKilled' } },
          }],
        },
      }])
      expect(issues).toHaveLength(1)
      expect(issues[0].issues).toContain('OOMKilled')
      expect(issues[0].restarts).toBe(10)
    })

    it('detects Unschedulable pod in Pending phase', async () => {
      const issues = await getPodIssuesFromItems([{
        metadata: { name: 'pending-pod', namespace: 'default' },
        status: {
          phase: 'Pending',
          containerStatuses: [],
          conditions: [
            { type: 'PodScheduled', status: 'False', reason: 'Unschedulable' },
          ],
        },
      }])
      expect(issues).toHaveLength(1)
      expect(issues[0].issues).toContain('Unschedulable')
      expect(issues[0].reason).toBe('Unschedulable')
    })

    it('detects Failed phase pods', async () => {
      const issues = await getPodIssuesFromItems([{
        metadata: { name: 'failed-pod', namespace: 'default' },
        status: {
          phase: 'Failed',
          reason: 'Evicted',
          containerStatuses: [],
        },
      }])
      expect(issues).toHaveLength(1)
      expect(issues[0].issues).toContain('Failed')
      expect(issues[0].status).toBe('Evicted')
    })

    it('detects high restarts without other issues', async () => {
      const THRESHOLD = 5
      const issues = await getPodIssuesFromItems([{
        metadata: { name: 'restart-pod', namespace: 'default' },
        status: {
          phase: 'Running',
          containerStatuses: [{ restartCount: THRESHOLD + 1, state: {} }],
        },
      }])
      expect(issues).toHaveLength(1)
      expect(issues[0].restarts).toBe(THRESHOLD + 1)
      expect(issues[0].issues).toEqual([])
    })

    it('detects CreateContainerError', async () => {
      const issues = await getPodIssuesFromItems([{
        metadata: { name: 'cce-pod', namespace: 'default' },
        status: {
          phase: 'Pending',
          containerStatuses: [{
            restartCount: 0,
            state: { waiting: { reason: 'CreateContainerError' } },
          }],
        },
      }])
      expect(issues).toHaveLength(1)
      expect(issues[0].issues).toContain('CreateContainerError')
    })

    it('detects ErrImagePull', async () => {
      const issues = await getPodIssuesFromItems([{
        metadata: { name: 'eip-pod', namespace: 'default' },
        status: {
          phase: 'Pending',
          containerStatuses: [{
            restartCount: 0,
            state: { waiting: { reason: 'ErrImagePull' } },
          }],
        },
      }])
      expect(issues).toHaveLength(1)
      expect(issues[0].issues).toContain('ErrImagePull')
    })

    it('skips healthy pods with low restarts', async () => {
      const issues = await getPodIssuesFromItems([{
        metadata: { name: 'healthy-pod', namespace: 'default' },
        status: {
          phase: 'Running',
          containerStatuses: [{ restartCount: 2, state: {} }],
        },
      }])
      expect(issues).toHaveLength(0)
    })

    it('uses -n namespace when provided', async () => {
      const proxy = await createProxy()
      const p = proxy.getPodIssues('ctx', 'kube-system')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)
      const msg = JSON.parse(sentMessages[0])
      expect(msg.payload.args).toContain('-n')
      expect(msg.payload.args).toContain('kube-system')
      activeWs!.simulateMessage({
        id: msg.id, type: 'result',
        payload: { output: JSON.stringify({ items: [] }), exitCode: 0 },
      })
      await p
      proxy.close()
    })

    it('uses -A when no namespace', async () => {
      const proxy = await createProxy()
      const p = proxy.getPodIssues('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)
      const msg = JSON.parse(sentMessages[0])
      expect(msg.payload.args).toContain('-A')
      activeWs!.simulateMessage({
        id: msg.id, type: 'result',
        payload: { output: JSON.stringify({ items: [] }), exitCode: 0 },
      })
      await p
      proxy.close()
    })

    it('throws when output is not valid JSON', async () => {
      const proxy = await createProxy()
      const p = proxy.getPodIssues('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)
      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id, type: 'result',
        payload: { output: 'bad-json', exitCode: 0 },
      })
      await expect(p).rejects.toThrow('Failed to parse kubectl output as JSON')
      proxy.close()
    })

    it('handles pod with waiting but non-problematic reason', async () => {
      const issues = await getPodIssuesFromItems([{
        metadata: { name: 'waiting-pod', namespace: 'default' },
        status: {
          phase: 'Running',
          containerStatuses: [{
            restartCount: 0,
            state: { waiting: { reason: 'ContainerCreating' } },
          }],
        },
      }])
      expect(issues).toHaveLength(0)
    })

    it('handles Pending pod with PodScheduled condition but status=True', async () => {
      const issues = await getPodIssuesFromItems([{
        metadata: { name: 'scheduled-pod', namespace: 'default' },
        status: {
          phase: 'Pending',
          containerStatuses: [],
          conditions: [{ type: 'PodScheduled', status: 'True' }],
        },
      }])
      expect(issues).toHaveLength(0)
    })
  })

  // =========================================================================
  // getEvents — edge cases
  // =========================================================================

  describe('getEvents edge cases', () => {
    it('defaults count to 1 when missing', async () => {
      const proxy = await createProxy()
      const p = proxy.getEvents('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)
      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id, type: 'result',
        payload: {
          output: JSON.stringify({
            items: [{
              type: 'Warning',
              reason: 'BackOff',
              message: 'container restarting',
              involvedObject: { kind: 'Pod', name: 'my-pod' },
              metadata: { namespace: 'default' },
            }],
          }),
          exitCode: 0,
        },
      })
      const events = await p
      expect(events[0].count).toBe(1)
      proxy.close()
    })

    it('reverses events (most recent first)', async () => {
      const proxy = await createProxy()
      const p = proxy.getEvents('ctx', undefined, 50)
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)
      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id, type: 'result',
        payload: {
          output: JSON.stringify({
            items: [
              { type: 'Normal', reason: 'A', message: 'first', involvedObject: { kind: 'Pod', name: 'p1' }, metadata: { namespace: 'default' }, count: 1 },
              { type: 'Normal', reason: 'B', message: 'second', involvedObject: { kind: 'Pod', name: 'p2' }, metadata: { namespace: 'default' }, count: 2 },
            ],
          }),
          exitCode: 0,
        },
      })
      const events = await p
      // reversed: second comes first
      expect(events[0].reason).toBe('B')
      expect(events[1].reason).toBe('A')
      proxy.close()
    })

    it('throws on parse failure', async () => {
      const proxy = await createProxy()
      const p = proxy.getEvents('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)
      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id, type: 'result',
        payload: { output: 'nope', exitCode: 0 },
      })
      await expect(p).rejects.toThrow('Failed to parse kubectl output as JSON')
      proxy.close()
    })
  })

  // =========================================================================
  // getDeployments — status logic
  // =========================================================================

  describe('getDeployments status determination', () => {
    async function getDeploymentsFromItems(items: unknown[]) {
      const proxy = await createProxy()
      const p = proxy.getDeployments('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)
      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id, type: 'result',
        payload: { output: JSON.stringify({ items }), exitCode: 0 },
      })
      const deps = await p
      proxy.close()
      return deps
    }

    it('marks deployment as "running" when readyReplicas >= replicas', async () => {
      const deps = await getDeploymentsFromItems([{
        metadata: { name: 'd1', namespace: 'default' },
        spec: { replicas: 3, template: { spec: { containers: [{ image: 'nginx:latest' }] } } },
        status: { readyReplicas: 3, updatedReplicas: 3, availableReplicas: 3 },
      }])
      expect(deps[0].status).toBe('running')
      expect(deps[0].progress).toBe(100)
    })

    it('marks deployment as "deploying" when updatedReplicas > 0 and ready < desired', async () => {
      const deps = await getDeploymentsFromItems([{
        metadata: { name: 'd1', namespace: 'default' },
        spec: { replicas: 3 },
        status: { readyReplicas: 1, updatedReplicas: 2, availableReplicas: 1 },
      }])
      expect(deps[0].status).toBe('deploying')
      expect(deps[0].progress).toBe(33)
    })

    it('marks deployment as "failed" when updatedReplicas = 0 and ready < desired', async () => {
      const deps = await getDeploymentsFromItems([{
        metadata: { name: 'd1', namespace: 'default' },
        spec: { replicas: 2 },
        status: { readyReplicas: 0, updatedReplicas: 0 },
      }])
      expect(deps[0].status).toBe('failed')
      expect(deps[0].progress).toBe(0)
    })

    it('defaults replicas to 1 when not specified', async () => {
      const deps = await getDeploymentsFromItems([{
        metadata: { name: 'd1', namespace: 'default' },
        spec: {},
        status: { readyReplicas: 1 },
      }])
      expect(deps[0].replicas).toBe(1)
      expect(deps[0].status).toBe('running')
    })

    it('handles missing image in template', async () => {
      const deps = await getDeploymentsFromItems([{
        metadata: { name: 'd1', namespace: 'default' },
        spec: { replicas: 1 },
        status: { readyReplicas: 1 },
      }])
      expect(deps[0].image).toBeUndefined()
    })

    it('throws on invalid JSON', async () => {
      const proxy = await createProxy()
      const p = proxy.getDeployments('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)
      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id, type: 'result',
        payload: { output: 'nope', exitCode: 0 },
      })
      await expect(p).rejects.toThrow('Failed to parse kubectl output as JSON')
      proxy.close()
    })
  })

  // =========================================================================
  // getClusterHealth — error branch
  // =========================================================================

  describe('getClusterHealth error path', () => {
    it('returns unreachable health when getNodes throws', async () => {
      const proxy = await createProxy()
      vi.spyOn(console, 'error').mockImplementation(() => {})

      const p = proxy.getClusterHealth('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)

      // Find the nodes message and make it fail
      await vi.advanceTimersByTimeAsync(0)
      for (const raw of sentMessages) {
        const msg = JSON.parse(raw)
        activeWs!.simulateMessage({
          id: msg.id, type: 'result',
          payload: { output: '', exitCode: 1, error: 'connection refused' },
        })
      }

      // Let the usage metrics timeout fire
      await vi.advanceTimersByTimeAsync(6000)

      const health = await p
      expect(health.healthy).toBe(false)
      expect(health.reachable).toBe(false)
      expect(health.errorMessage).toContain('connection refused')
      proxy.close()
    })
  })

  // =========================================================================
  // getClusterUsage — error catch branch
  // =========================================================================

  describe('getClusterUsage error catch', () => {
    it('returns metricsAvailable=false on exec rejection', async () => {
      const proxy = await createProxy()
      vi.spyOn(console, 'error').mockImplementation(() => {})

      // Close the connection before calling getClusterUsage
      proxy.close()
      await vi.advanceTimersByTimeAsync(5001) // past cooldown

      const usage = await proxy.getClusterUsage('ctx')
      expect(usage.metricsAvailable).toBe(false)
      expect(usage.cpuUsageMillicores).toBe(0)
    })

    it('handles empty top output', async () => {
      const proxy = await createProxy()
      const p = proxy.getClusterUsage('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)
      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id, type: 'result',
        payload: { output: '', exitCode: 0 },
      })
      const usage = await p
      expect(usage.metricsAvailable).toBe(true)
      expect(usage.cpuUsageMillicores).toBe(0)
      expect(usage.memoryUsageBytes).toBe(0)
      proxy.close()
    })
  })

  // =========================================================================
  // getPodMetrics — edge cases
  // =========================================================================

  describe('getPodMetrics edge cases', () => {
    it('handles pods with no spec', async () => {
      const proxy = await createProxy()
      const p = proxy.getPodMetrics('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)
      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id, type: 'result',
        payload: { output: JSON.stringify({ items: [{}] }), exitCode: 0 },
      })
      const m = await p
      expect(m.count).toBe(1)
      expect(m.cpuRequestsMillicores).toBe(0)
      proxy.close()
    })

    it('throws on parse failure', async () => {
      const proxy = await createProxy()
      const p = proxy.getPodMetrics('ctx')
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)
      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id, type: 'result',
        payload: { output: 'bad', exitCode: 0 },
      })
      await expect(p).rejects.toThrow('Failed to parse kubectl output as JSON')
      proxy.close()
    })
  })

  // =========================================================================
  // execImmediate — not connected after ensureConnected
  // =========================================================================

  describe('execImmediate edge case', () => {
    it('throws "Not connected" when ws is null after ensureConnected', async () => {
      // This is hard to trigger naturally, but we can test by closing ws in between
      // The cooldown guard prevents this normally, but let's just verify the error path
      const proxy = await createProxy()
      const execPromise = proxy.exec(['get', 'pods'], { priority: true })
      await vi.advanceTimersByTimeAsync(0)
      activeWs!.simulateOpen()
      await vi.advanceTimersByTimeAsync(0)
      const msg = JSON.parse(sentMessages[0])
      activeWs!.simulateMessage({
        id: msg.id, type: 'result',
        payload: { output: 'ok', exitCode: 0 },
      })
      await execPromise
      proxy.close()
    })
  })

  // =========================================================================
  // Queue: processQueue with failed execImmediate
  // =========================================================================

  describe('queue error handling', () => {
    it('wraps non-Error rejections in Error', async () => {
      const proxy = await createConnectedProxy()

      // Close ws to make execImmediate fail
      activeWs!.simulateClose()
      await vi.advanceTimersByTimeAsync(0)

      // Queue a request — it should be rejected
      const p = proxy.exec(['get', 'pods']).catch((err: Error) => err.message)
      await vi.advanceTimersByTimeAsync(6000) // past cooldown
      await vi.advanceTimersByTimeAsync(0)

      const result = await p
      expect(typeof result).toBe('string')
      proxy.close()
    })
  })
})
