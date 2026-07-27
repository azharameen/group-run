import { useEffect, useState } from 'react'
import { Shield, CheckCircle2, AlertTriangle, Info, Loader2 } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { fetchGateConfig, fetchCriteriaConfig, type GateConfig } from '../api/client'

function GateCard({ name, items }: { name: string; items: Array<{ id: string; description: string }> }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="p-4 border-b bg-muted/20">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">{name}</CardTitle>
          <Badge variant="outline" className="text-xs">{items.length} items</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-2">
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-2.5 text-xs text-foreground">
              <CheckCircle2 className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
              <span>{item.description}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

const GATE_DISPLAY_NAMES: Record<string, string> = {
  idea_discovery_to_idea_clarification: 'Signal Clarity Gate',
  idea_clarification_to_novelty_hypothesis: 'Problem Framing Gate',
  novelty_hypothesis_to_prior_art_review: 'Novelty Hypothesis Gate',
  prior_art_review_to_detectability_review: 'Prior Art Review Gate',
  detectability_review_to_business_value_review: 'Detectability Gate',
  business_value_review_to_siemens_innovation_alignment: 'Business Value Gate',
  siemens_innovation_alignment: 'Siemens Strategic Alignment Gate',
  ideascope_draft_to_siemens_internal_filing_check: 'IdeaScope Preparation Gate',
  siemens_internal_filing_check: 'Internal Filing Readiness Gate',
  manager_or_enabler_review: 'Manager / Enabler Gate',
  ip_review: 'IP Attorney Review Gate',
  siemens_ip_counsel_validation: 'IP Counsel Validation Gate',
}

export default function SiemensControls() {
  const [gateConfig, setGateConfig] = useState<GateConfig | null>(null)
  const [criteriaConfig, setCriteriaConfig] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetchGateConfig(),
      fetchCriteriaConfig(),
    ]).then(([gates, criteria]) => {
      setGateConfig(gates)
      setCriteriaConfig(criteria)
    }).catch(() => {
      // silent
    }).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  const gates = gateConfig?.gates || {}
  const gateEntries = Object.entries(gates)
  const totalItems = gateEntries.reduce((sum, [, g]) => sum + (g.items?.length || 0), 0)
  const thresholds = criteriaConfig?.thresholds || {}
  const strengthRatings = criteriaConfig?.strength_ratings || {}

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex aspect-square size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Shield className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Siemens Patent Controls</h1>
          <p className="text-sm text-muted-foreground">Validation gates, quality controls, and filing governance rules</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-medium">Validation Gates</span>
            </div>
            <p className="text-3xl font-bold tracking-tight">{gateEntries.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Info className="w-4 h-4 text-blue-500" />
              <span className="text-xs font-medium">Compliance Items</span>
            </div>
            <p className="text-3xl font-bold tracking-tight">{totalItems}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-medium">Min Threshold to File</span>
            </div>
            <p className="text-3xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
              &ge; {thresholds.composite_threshold || 70}
            </p>
          </CardContent>
        </Card>
      </div>

      {gateEntries.length === 0 ? (
        <Card className="p-12 text-center">
          <CardContent>
            <p className="text-sm text-muted-foreground">No gate checklists configured. Add gates to checklist-config.yaml.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {gateEntries.map(([key, gate]) => (
            <GateCard
              key={key}
              name={GATE_DISPLAY_NAMES[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              items={gate.items || []}
            />
          ))}
        </div>
      )}

      <Alert className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200">
        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <AlertTitle className="text-sm font-semibold">Composite Score Thresholds & Filing Rules</AlertTitle>
        <AlertDescription className="text-xs space-y-1.5 mt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono">
            {Object.entries(strengthRatings).map(([key, val]: [string, any]) => (
              <div key={key}>
                <strong className="text-emerald-700 dark:text-emerald-400">
                  &ge; {val.min}:
                </strong>{' '}
                {key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                {val.action ? ` (${val.action})` : ''}
              </div>
            ))}
          </div>
          <p className="pt-2 text-[11px] text-amber-700 dark:text-amber-300 font-sans border-t border-amber-200/50">
            * Minimum filing gate constraint: Composite Score &ge; {thresholds.composite_threshold || 70}{' '}
            AND no single gate checklist below {thresholds.gate_threshold_percent || 50}% approval.
          </p>
        </AlertDescription>
      </Alert>
    </div>
  )
}