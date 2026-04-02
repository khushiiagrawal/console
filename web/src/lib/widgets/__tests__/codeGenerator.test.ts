import { describe, it, expect } from 'vitest'
import {
  generateCardWidget,
  generateStatWidget,
  generateTemplateWidget,
  generateWidget,
  getWidgetFilename,
} from '../codeGenerator'
import type { WidgetConfig } from '../codeGenerator'

describe('generateCardWidget', () => {
  it('generates valid widget code for cluster_health', () => {
    const code = generateCardWidget('cluster_health', 'http://localhost:8080')
    expect(code).toContain('Cluster Health Widget')
    expect(code).toContain('export const command')
    expect(code).toContain('export const refreshFrequency')
    expect(code).toContain('export const render')
    expect(code).toContain('curl')
  })

  it('generates valid widget code for pod_issues', () => {
    const code = generateCardWidget('pod_issues', 'http://localhost:8080')
    expect(code).toContain('Pod Issues Widget')
    expect(code).toContain('CrashLoopBackOff')
    expect(code).toContain('OOMKilled')
  })

  it('generates valid widget code for gpu_overview', () => {
    const code = generateCardWidget('gpu_overview', 'http://localhost:8080')
    expect(code).toContain('GPU Overview Widget')
    expect(code).toContain('Utilization')
    expect(code).toContain('Allocated')
  })

  it('generates valid widget code for nightly_e2e_status', () => {
    const code = generateCardWidget('nightly_e2e_status', 'http://localhost:8080')
    expect(code).toContain('Nightly E2E Status')
    expect(code).toContain('Pass Rate')
    expect(code).toContain('public/nightly-e2e')
  })

  it('uses custom refresh interval', () => {
    const CUSTOM_INTERVAL = 60000
    const code = generateCardWidget('cluster_health', 'http://localhost:8080', CUSTOM_INTERVAL)
    expect(code).toContain(`refreshFrequency = ${CUSTOM_INTERVAL}`)
  })

  it('uses default refresh interval of 30000', () => {
    const code = generateCardWidget('cluster_health', 'http://localhost:8080')
    expect(code).toContain('refreshFrequency = 30000')
  })

  it('throws for unknown card type', () => {
    expect(() => generateCardWidget('nonexistent_card', 'http://localhost:8080'))
      .toThrow('Unknown card type: nonexistent_card')
  })

  it('appends source=ubersicht-widget query param to curl URL', () => {
    const code = generateCardWidget('cluster_health', 'http://localhost:8080')
    expect(code).toContain('source=ubersicht-widget')
  })

  it('includes widget shell with drag support', () => {
    const code = generateCardWidget('cluster_health', 'http://localhost:8080')
    expect(code).toContain('handleDragStart')
    expect(code).toContain('STORAGE_KEY')
    expect(code).toContain('localStorage')
  })

  it('generates default render function for unknown card types in registry', () => {
    const code = generateCardWidget('workload_status', 'http://localhost:8080')
    expect(code).toContain('Workload Status Widget')
    expect(code).toContain('export const render')
  })
})

describe('generateStatWidget', () => {
  it('generates widget code for single stat', () => {
    const code = generateStatWidget(['total_clusters'], 'http://localhost:8080')
    expect(code).toContain('Stats Widget')
    expect(code).toContain('Clusters')
    expect(code).toContain('StatBlock')
  })

  it('generates widget code for multiple stats', () => {
    const code = generateStatWidget(
      ['total_clusters', 'total_pods', 'total_gpus'],
      'http://localhost:8080'
    )
    expect(code).toContain('Clusters')
    expect(code).toContain('Pods')
    expect(code).toContain('GPUs')
  })

  it('uses custom refresh interval', () => {
    const CUSTOM_INTERVAL = 120000
    const code = generateStatWidget(['total_clusters'], 'http://localhost:8080', CUSTOM_INTERVAL)
    expect(code).toContain(`refreshFrequency = ${CUSTOM_INTERVAL}`)
  })

  it('throws for empty stat IDs', () => {
    expect(() => generateStatWidget([], 'http://localhost:8080'))
      .toThrow('No valid stat IDs provided')
  })

  it('filters out invalid stat IDs', () => {
    expect(() => generateStatWidget(['nonexistent_stat'], 'http://localhost:8080'))
      .toThrow('No valid stat IDs provided')
  })
})

describe('generateTemplateWidget', () => {
  it('generates widget code for cluster_overview template', () => {
    const code = generateTemplateWidget('cluster_overview', 'http://localhost:8080')
    expect(code).toContain('Cluster Overview Widget')
    expect(code).toContain('export const command')
    expect(code).toContain('export const render')
  })

  it('generates widget code for stat_bar template', () => {
    const code = generateTemplateWidget('stat_bar', 'http://localhost:8080')
    expect(code).toContain('Stats Bar Widget')
  })

  it('throws for unknown template', () => {
    expect(() => generateTemplateWidget('nonexistent_template', 'http://localhost:8080'))
      .toThrow('Unknown template: nonexistent_template')
  })
})

describe('generateWidget', () => {
  it('dispatches to card generator', () => {
    const config: WidgetConfig = {
      type: 'card',
      cardType: 'cluster_health',
      apiEndpoint: 'http://localhost:8080',
      refreshInterval: 30000,
      theme: 'dark',
    }
    const code = generateWidget(config)
    expect(code).toContain('Cluster Health Widget')
  })

  it('dispatches to stat generator', () => {
    const config: WidgetConfig = {
      type: 'stat',
      statIds: ['total_clusters'],
      apiEndpoint: 'http://localhost:8080',
      refreshInterval: 60000,
      theme: 'dark',
    }
    const code = generateWidget(config)
    expect(code).toContain('Stats Widget')
  })

  it('dispatches to template generator', () => {
    const config: WidgetConfig = {
      type: 'template',
      templateId: 'cluster_overview',
      apiEndpoint: 'http://localhost:8080',
      refreshInterval: 30000,
      theme: 'dark',
    }
    const code = generateWidget(config)
    expect(code).toContain('Cluster Overview Widget')
  })

  it('throws for missing cardType on card widget', () => {
    const config: WidgetConfig = {
      type: 'card',
      apiEndpoint: 'http://localhost:8080',
      refreshInterval: 30000,
      theme: 'dark',
    }
    expect(() => generateWidget(config)).toThrow('cardType required')
  })

  it('throws for missing statIds on stat widget', () => {
    const config: WidgetConfig = {
      type: 'stat',
      apiEndpoint: 'http://localhost:8080',
      refreshInterval: 30000,
      theme: 'dark',
    }
    expect(() => generateWidget(config)).toThrow('statIds required')
  })

  it('throws for missing templateId on template widget', () => {
    const config: WidgetConfig = {
      type: 'template',
      apiEndpoint: 'http://localhost:8080',
      refreshInterval: 30000,
      theme: 'dark',
    }
    expect(() => generateWidget(config)).toThrow('templateId required')
  })
})

describe('getWidgetFilename', () => {
  it('generates card widget filename', () => {
    const config: WidgetConfig = {
      type: 'card',
      cardType: 'cluster_health',
      apiEndpoint: '',
      refreshInterval: 30000,
      theme: 'dark',
    }
    expect(getWidgetFilename(config)).toBe('cluster-health.widget.jsx')
  })

  it('generates stat widget filename', () => {
    const config: WidgetConfig = {
      type: 'stat',
      statIds: ['total_clusters', 'total_pods'],
      apiEndpoint: '',
      refreshInterval: 30000,
      theme: 'dark',
    }
    expect(getWidgetFilename(config)).toBe('stats-total_clusters-total_pods.widget.jsx')
  })

  it('generates template widget filename', () => {
    const config: WidgetConfig = {
      type: 'template',
      templateId: 'cluster_overview',
      apiEndpoint: '',
      refreshInterval: 30000,
      theme: 'dark',
    }
    expect(getWidgetFilename(config)).toBe('cluster-overview.widget.jsx')
  })

  it('returns default filename for unknown type', () => {
    const config = {
      type: 'unknown' as 'card',
      apiEndpoint: '',
      refreshInterval: 30000,
      theme: 'dark' as const,
    }
    expect(getWidgetFilename(config)).toBe('widget.jsx')
  })
})
