import { Shield, CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react'

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
        <Shield className="w-6 h-6 text-siemens-green" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">Siemens Patent Controls</h1>
          <p className="text-sm text-gray-500">Validation gates, checklists, and compliance rules</p>
        </div>
      </div>

      {/* Gate Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            <span className="text-xs font-medium">Total Gates</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{GATES.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <Info className="w-4 h-4" />
            <span className="text-xs font-medium">Checklist Items</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {GATES.reduce((sum, g) => sum + g.items.length, 0)}
          </p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-medium">Min Composite to File</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">≥ 70</p>
        </div>
      </div>

      {/* Gate Details */}
      <div className="space-y-4">
        {GATES.map((gate, i) => (
          <div key={i} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">{gate.name}</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {gate.items.map((item, j) => (
                <div key={j} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="w-4 h-4 rounded-full border-2 border-gray-300 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-gray-300" />
                  </div>
                  <span className="text-sm text-gray-600">{item}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Threshold Info */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <h4 className="text-sm font-semibold text-amber-800">Composite Score Thresholds</h4>
            <div className="mt-2 space-y-1 text-sm text-amber-700">
              <p><strong>≥ 85</strong> Very Strong — Fast-track Siemens filing</p>
              <p><strong>70-84</strong> Strong — Auto-promote to drafting</p>
              <p><strong>50-69</strong> Moderate — Route for improvement pass</p>
              <p><strong>30-49</strong> Weak — Hold for significant improvement</p>
              <p><strong>&lt; 30</strong> Reject — Archive with learning</p>
            </div>
            <p className="mt-2 text-xs text-amber-600">
              <strong>Minimum threshold:</strong> Composite ≥ 70 AND no gate checklist below 50%
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
