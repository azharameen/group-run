import { CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react'

interface GateItem {
  name: string
  status: 'pass' | 'fail' | 'pending' | 'running'
  detail?: string
}

interface Props {
  gates: GateItem[]
  title?: string
}

export default function SiemensGateStatus({ gates, title = 'Gate Checklist' }: Props) {
  const passed = gates.filter((g) => g.status === 'pass').length
  const total = gates.length

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <span className="text-xs text-gray-500">
          {passed}/{total} passed
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-100 rounded-full h-1.5 mb-3">
        <div
          className={`h-1.5 rounded-full transition-all ${
            passed === total ? 'bg-green-500' : passed > 0 ? 'bg-yellow-500' : 'bg-gray-300'
          }`}
          style={{ width: `${total ? (passed / total) * 100 : 0}%` }}
        />
      </div>

      <div className="space-y-1.5">
        {gates.map((gate, i) => (
          <div
            key={i}
            className="flex items-start gap-2 p-1.5 rounded text-xs"
          >
            {gate.status === 'pass' && (
              <CheckCircle2 className="w-3.5 h-3.5 text-green-600 mt-0.5 shrink-0" />
            )}
            {gate.status === 'fail' && (
              <XCircle className="w-3.5 h-3.5 text-red-600 mt-0.5 shrink-0" />
            )}
            {gate.status === 'running' && (
              <Loader2 className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0 animate-spin" />
            )}
            {gate.status === 'pending' && (
              <AlertCircle className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
            )}
            <div>
              <p
                className={`font-medium ${
                  gate.status === 'pass'
                    ? 'text-green-700'
                    : gate.status === 'fail'
                    ? 'text-red-700'
                    : 'text-gray-500'
                }`}
              >
                {gate.name}
              </p>
              {gate.detail && (
                <p className="text-gray-400 mt-0.5">{gate.detail}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
