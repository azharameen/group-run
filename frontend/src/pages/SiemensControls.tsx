import { Shield, CheckCircle2, AlertTriangle, Info } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'

const GATES = [
  {
    name: 'Prior Art Review',
    items: [
      'Min 10 prior art references examined',
      'Novelty gap analysis complete',
      'Key differentiating features extracted',
    ],
  },
  {
    name: 'Detectability Review',
    items: [
      'Observability criteria evaluated',
      'Detection method documented',
      'Non-obviousness argument drafted',
    ],
  },
  {
    name: 'Business Value Review',
    items: [
      'Business value score ≥ 40/100',
      'Siemens business unit identified',
      'Market impact estimated',
    ],
  },
  {
    name: 'Siemens Innovation Alignment',
    items: [
      'Aligns with ≥1 Siemens strategic tech area',
      'Business unit(s) identified with org hierarchy',
      'No conflict with existing Siemens patent portfolio',
      'Siemens-specific competitive advantage articulated',
      'Technology readiness level estimated',
    ],
  },
  {
    name: 'IdeaScope Draft → Filing Check',
    items: [
      'All mandatory IdeaScope fields completed',
      'Co-inventors identified (Siemens employee IDs)',
      'Prior art attached (min 3 sources)',
      'No confidential info leaked',
      'Business benefit quantified',
      'Detectability assessment complete',
    ],
  },
  {
    name: 'Siemens Internal Filing Check',
    items: [
      'IdeaScope document is complete',
      'Internal filing checklist passes all 7 items',
      'Scoring composite ≥ 70',
      'No gate checklist below 50%',
    ],
  },
  {
    name: 'IP Counsel Validation',
    items: [
      'Patentability confirmed in writing',
      'Filing strategy recommended',
      'Committee sign-off obtained (if required)',
      'Siemens IP counsel approval recorded',
    ],
  },
]

export default function SiemensControls() {
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

      {/* Gate Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-medium">Validation Gates</span>
            </div>
            <p className="text-3xl font-bold tracking-tight">{GATES.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Info className="w-4 h-4 text-blue-500" />
              <span className="text-xs font-medium">Compliance Items</span>
            </div>
            <p className="text-3xl font-bold tracking-tight">
              {GATES.reduce((sum, g) => sum + g.items.length, 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-medium">Min Threshold to File</span>
            </div>
            <p className="text-3xl font-bold tracking-tight text-amber-600 dark:text-amber-400">≥ 70</p>
          </CardContent>
        </Card>
      </div>

      {/* Gate Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {GATES.map((gate, i) => (
          <Card key={i} className="overflow-hidden">
            <CardHeader className="p-4 border-b bg-muted/20">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">{gate.name}</CardTitle>
                <Badge variant="outline" className="text-xs">{gate.items.length} items</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              <ul className="space-y-2">
                {gate.items.map((item, j) => (
                  <li key={j} className="flex items-start gap-2.5 text-xs text-foreground">
                    <CheckCircle2 className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Threshold Information Alert */}
      <Alert className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200">
        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <AlertTitle className="text-sm font-semibold">Composite Score Thresholds & Filing Rules</AlertTitle>
        <AlertDescription className="text-xs space-y-1.5 mt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono">
            <div><strong className="text-emerald-700 dark:text-emerald-400">≥ 85:</strong> Very Strong (Fast-track filing)</div>
            <div><strong className="text-blue-700 dark:text-blue-400">70-84:</strong> Strong (Auto-promote to drafting)</div>
            <div><strong className="text-amber-700 dark:text-amber-400">50-69:</strong> Moderate (Improvement pass)</div>
            <div><strong className="text-rose-700 dark:text-rose-400">&lt; 50:</strong> Weak/Reject (Archive with learning)</div>
          </div>
          <p className="pt-2 text-[11px] text-amber-700 dark:text-amber-300 font-sans border-t border-amber-200/50">
            * Minimum filing gate constraint: Composite Score ≥ 70 AND no single gate checklist below 50% approval.
          </p>
        </AlertDescription>
      </Alert>
    </div>
  )
}
