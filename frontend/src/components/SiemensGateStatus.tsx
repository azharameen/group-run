import { CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'

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
  const percentage = total ? (passed / total) * 100 : 0

  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          <Badge variant="outline" className="text-xs font-mono">
            {passed}/{total} passed
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-2 space-y-3">
        <Progress value={percentage} className="h-2" />

        <div className="space-y-2 pt-1">
          {gates.map((gate, i) => (
            <div
              key={i}
              className="flex items-start gap-2.5 p-2 rounded-md border bg-card text-card-foreground text-xs"
            >
              {gate.status === 'pass' && (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
              )}
              {gate.status === 'fail' && (
                <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
              )}
              {gate.status === 'running' && (
                <Loader2 className="w-4 h-4 text-blue-500 mt-0.5 shrink-0 animate-spin" />
              )}
              {gate.status === 'pending' && (
                <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              )}
              <div className="space-y-0.5">
                <p
                  className={`font-medium ${
                    gate.status === 'pass'
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : gate.status === 'fail'
                      ? 'text-rose-700 dark:text-rose-300'
                      : 'text-muted-foreground'
                  }`}
                >
                  {gate.name}
                </p>
                {gate.detail && (
                  <p className="text-muted-foreground text-[11px]">{gate.detail}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
