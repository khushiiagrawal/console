/**
 * ISO 27001 Security Audit Card
 *
 * Interactive checklist of 70 Kubernetes security controls mapped to ISO 27001.
 * Checklist state persists in localStorage so auditors can track progress.
 * Based on real-world audit experience (5 ISO 27001 audits) combined with the
 * official Kubernetes security checklist.
 */

import { useState, useMemo, useCallback } from 'react'
import { Shield, ChevronDown, ChevronRight, Terminal, CheckCircle2, Circle, AlertTriangle } from 'lucide-react'
import { useCardLoadingState } from './CardDataContext'

const STORAGE_KEY = 'ksc-iso27001-audit-checks'

interface AuditCheck {
  id: string
  label: string
}

interface AuditCategory {
  name: string
  checks: AuditCheck[]
  verify?: string
}

const AUDIT_CATEGORIES: AuditCategory[] = [
  {
    name: 'RBAC & Access Control',
    verify: 'kubectl get clusterrolebindings -o json | jq \'.items[] | select(.roleRef.name=="cluster-admin")\'',
    checks: [
      { id: 'rbac-1', label: 'No cluster-admin bindings outside kube-system' },
      { id: 'rbac-2', label: 'ServiceAccounts use least-privilege Roles (not ClusterRoles)' },
      { id: 'rbac-3', label: 'No wildcard permissions (*) in production namespaces' },
      { id: 'rbac-4', label: 'RBAC audit log enabled (who can do what)' },
      { id: 'rbac-5', label: 'External auth (OIDC/SAML) for human users' },
    ],
  },
  {
    name: 'Network Policies',
    verify: 'kubectl get networkpolicies -A',
    checks: [
      { id: 'net-1', label: 'Default-deny ingress policy in all namespaces' },
      { id: 'net-2', label: 'Default-deny egress policy' },
      { id: 'net-3', label: 'Inter-namespace traffic explicitly allowed (no implicit trust)' },
      { id: 'net-4', label: 'External traffic whitelisted by IP/CIDR' },
      { id: 'net-5', label: 'CNI plugin supports NetworkPolicy enforcement' },
    ],
  },
  {
    name: 'Secrets Management',
    verify: 'kubectl get secrets -A -o json | jq -r \'.items[].metadata.name\'',
    checks: [
      { id: 'sec-1', label: 'etcd encryption enabled (KMS provider)' },
      { id: 'sec-2', label: 'No secrets in ConfigMaps or env vars' },
      { id: 'sec-3', label: 'External Secrets Operator (AWS SM, Vault, etc.)' },
      { id: 'sec-4', label: 'Secret rotation policy documented and enforced' },
      { id: 'sec-5', label: 'RBAC restricts secret access to required ServiceAccounts only' },
    ],
  },
  {
    name: 'Pod Security',
    verify: 'kubectl get pods -A -o json | jq \'.items[] | select(.spec.securityContext.runAsNonRoot==null)\'',
    checks: [
      { id: 'pod-1', label: 'Pod Security Standards enforced (restricted level)' },
      { id: 'pod-2', label: 'No privileged containers' },
      { id: 'pod-3', label: 'runAsNonRoot enforced' },
      { id: 'pod-4', label: 'Read-only root filesystem' },
      { id: 'pod-5', label: 'No hostPath volumes' },
    ],
  },
  {
    name: 'Authentication & Authorization',
    checks: [
      { id: 'auth-1', label: 'system:masters group not used after bootstrapping' },
      { id: 'auth-2', label: 'kube-controller-manager uses --use-service-account-credentials' },
      { id: 'auth-3', label: 'Root CA protected (offline CA or managed with access controls)' },
      { id: 'auth-4', label: 'Certificate expiry no more than 3 years' },
      { id: 'auth-5', label: 'Periodic access review process (at least every 24 months)' },
    ],
  },
  {
    name: 'Logging & Auditing',
    checks: [
      { id: 'log-1', label: 'Kubernetes audit logging enabled with appropriate policy' },
      { id: 'log-2', label: 'Audit logs shipped to external SIEM/log aggregator' },
      { id: 'log-3', label: 'Log retention meets compliance requirements (90+ days)' },
      { id: 'log-4', label: 'Audit logs cover authentication, authorization, and mutations' },
      { id: 'log-5', label: 'Log integrity protection (immutable storage or signing)' },
    ],
  },
  {
    name: 'Image Security',
    verify: 'kubectl get pods -A -o jsonpath=\'{range .items[*]}{.spec.containers[*].image}{"\\n"}{end}\' | sort -u',
    checks: [
      { id: 'img-1', label: 'Images pulled from trusted registries only' },
      { id: 'img-2', label: 'Image tags are immutable (digest-based or signed)' },
      { id: 'img-3', label: 'Container image scanning in CI/CD pipeline' },
      { id: 'img-4', label: 'No latest tag in production workloads' },
      { id: 'img-5', label: 'Image pull policy set to Always or IfNotPresent (not Never)' },
    ],
  },
  {
    name: 'Admission Controllers',
    checks: [
      { id: 'adm-1', label: 'PodSecurity admission controller enabled' },
      { id: 'adm-2', label: 'ValidatingAdmissionWebhooks configured for policy enforcement' },
      { id: 'adm-3', label: 'MutatingAdmissionWebhooks reviewed and documented' },
      { id: 'adm-4', label: 'ImagePolicyWebhook or equivalent for image verification' },
      { id: 'adm-5', label: 'Admission controller failure policy set to Fail (not Ignore)' },
    ],
  },
  {
    name: 'etcd Security',
    verify: 'kubectl get pods -n kube-system -l component=etcd -o yaml | grep -E "peer-cert|client-cert"',
    checks: [
      { id: 'etcd-1', label: 'etcd communication encrypted with TLS (peer and client)' },
      { id: 'etcd-2', label: 'etcd access restricted to API server only' },
      { id: 'etcd-3', label: 'etcd data-at-rest encryption configured' },
      { id: 'etcd-4', label: 'etcd backup schedule documented and tested' },
      { id: 'etcd-5', label: 'etcd not exposed on public network interfaces' },
    ],
  },
  {
    name: 'Node Security',
    checks: [
      { id: 'node-1', label: 'Node OS minimal and hardened (CIS benchmark)' },
      { id: 'node-2', label: 'Kubelet authentication and authorization enabled' },
      { id: 'node-3', label: 'Kubelet read-only port disabled (--read-only-port=0)' },
      { id: 'node-4', label: 'Node auto-update or patching strategy documented' },
      { id: 'node-5', label: 'AppArmor or SELinux enabled on nodes' },
    ],
  },
  {
    name: 'Supply Chain Security',
    checks: [
      { id: 'sc-1', label: 'SBOM generated for all deployed images' },
      { id: 'sc-2', label: 'Image signatures verified before deployment (cosign/Notary)' },
      { id: 'sc-3', label: 'Third-party dependencies scanned for vulnerabilities' },
      { id: 'sc-4', label: 'Helm charts and manifests from verified sources' },
      { id: 'sc-5', label: 'Build provenance tracked (SLSA level 2+)' },
    ],
  },
  {
    name: 'Incident Response',
    checks: [
      { id: 'ir-1', label: 'Incident response plan documented and reviewed' },
      { id: 'ir-2', label: 'Runbooks for common Kubernetes security incidents' },
      { id: 'ir-3', label: 'Alerting configured for security-critical events' },
      { id: 'ir-4', label: 'Post-incident review process defined' },
      { id: 'ir-5', label: 'Contact escalation matrix maintained and current' },
    ],
  },
  {
    name: 'Data Protection & Encryption',
    checks: [
      { id: 'dp-1', label: 'TLS termination for all ingress traffic' },
      { id: 'dp-2', label: 'Service mesh mTLS for east-west traffic' },
      { id: 'dp-3', label: 'Persistent volumes encrypted at rest' },
      { id: 'dp-4', label: 'Backup encryption enabled' },
      { id: 'dp-5', label: 'Data classification labels applied to namespaces' },
    ],
  },
  {
    name: 'Cluster Configuration',
    checks: [
      { id: 'cfg-1', label: 'Kubernetes version is supported and up to date' },
      { id: 'cfg-2', label: 'API server access restricted (private endpoint or IP allowlist)' },
      { id: 'cfg-3', label: 'Resource quotas and LimitRanges set per namespace' },
      { id: 'cfg-4', label: 'Cloud metadata API access filtered from workloads' },
      { id: 'cfg-5', label: 'LoadBalancer and ExternalIPs usage restricted' },
    ],
  },
]

const TOTAL_CHECKS = AUDIT_CATEGORIES.reduce((sum, cat) => sum + cat.checks.length, 0)

function loadCheckedState(): Set<string> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return new Set(JSON.parse(stored))
  } catch { /* ignore */ }
  return new Set()
}

function saveCheckedState(checked: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...checked]))
}

interface ISO27001AuditProps {
  config?: Record<string, unknown>
}

export function ISO27001Audit(_props: ISO27001AuditProps) {
  useCardLoadingState({ isLoading: false, hasAnyData: true, isDemoData: true })

  const [checked, setChecked] = useState<Set<string>>(loadCheckedState)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [showVerify, setShowVerify] = useState<Set<string>>(new Set())

  const toggleCheck = useCallback((id: string) => {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      saveCheckedState(next)
      return next
    })
  }, [])

  const toggleCategory = useCallback((name: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }, [])

  const toggleVerify = useCallback((name: string) => {
    setShowVerify(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }, [])

  const totalChecked = checked.size
  const overallPercent = Math.round((totalChecked / TOTAL_CHECKS) * 100)

  const categoryStats = useMemo(() =>
    AUDIT_CATEGORIES.map(cat => {
      const catChecked = cat.checks.filter(c => checked.has(c.id)).length
      return { ...cat, catChecked, percent: Math.round((catChecked / cat.checks.length) * 100) }
    }), [checked])

  return (
    <div className="h-full flex flex-col min-h-card content-loaded">
      {/* Overall progress */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <Shield className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-medium text-foreground">
              {totalChecked}/{TOTAL_CHECKS} controls passed
            </span>
          </div>
          <span className={`text-xs font-bold ${
            overallPercent >= 80 ? 'text-green-400' :
            overallPercent >= 50 ? 'text-yellow-400' :
            'text-red-400'
          }`}>
            {overallPercent}%
          </span>
        </div>
        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              overallPercent >= 80 ? 'bg-green-500' :
              overallPercent >= 50 ? 'bg-yellow-500' :
              'bg-red-500'
            }`}
            style={{ width: `${overallPercent}%` }}
          />
        </div>
      </div>

      {/* Category list */}
      <div className="flex-1 space-y-1 overflow-y-auto pr-1">
        {categoryStats.map(cat => {
          const isExpanded = expandedCategories.has(cat.name)
          const isVerifyShown = showVerify.has(cat.name)

          return (
            <div key={cat.name} className="rounded-lg border border-border/50 overflow-hidden">
              {/* Category header */}
              <button
                onClick={() => toggleCategory(cat.name)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-muted/50 transition-colors text-left"
              >
                {isExpanded
                  ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                }
                <span className="text-xs font-medium text-foreground flex-1 truncate">{cat.name}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  cat.percent === 100 ? 'bg-green-500/20 text-green-400' :
                  cat.percent > 0 ? 'bg-yellow-500/20 text-yellow-400' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {cat.catChecked}/{cat.checks.length}
                </span>
              </button>

              {/* Expanded checks */}
              {isExpanded && (
                <div className="px-2.5 pb-2 space-y-0.5">
                  {cat.checks.map(check => (
                    <button
                      key={check.id}
                      onClick={() => toggleCheck(check.id)}
                      className="w-full flex items-start gap-2 px-1.5 py-1 rounded hover:bg-muted/30 transition-colors text-left"
                    >
                      {checked.has(check.id)
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0 mt-0.5" />
                        : <Circle className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                      }
                      <span className={`text-[11px] leading-tight ${
                        checked.has(check.id) ? 'text-muted-foreground line-through' : 'text-foreground'
                      }`}>
                        {check.label}
                      </span>
                    </button>
                  ))}

                  {/* Verify command */}
                  {cat.verify && (
                    <div className="mt-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleVerify(cat.name) }}
                        className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        <Terminal className="w-3 h-3" />
                        {isVerifyShown ? 'Hide' : 'Verify'}
                      </button>
                      {isVerifyShown && (
                        <pre className="mt-1 p-1.5 rounded bg-muted/50 text-[10px] text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all font-mono">
                          {cat.verify}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      {totalChecked > 0 && totalChecked < TOTAL_CHECKS && (
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-yellow-400">
          <AlertTriangle className="w-3 h-3" />
          <span>{TOTAL_CHECKS - totalChecked} controls remaining</span>
        </div>
      )}
      {totalChecked === TOTAL_CHECKS && (
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-green-400">
          <CheckCircle2 className="w-3 h-3" />
          <span>All {TOTAL_CHECKS} controls passed — audit ready</span>
        </div>
      )}
    </div>
  )
}

export default ISO27001Audit
