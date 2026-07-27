import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { CheckCircle2, Circle, Clock, ChevronDown, ChevronUp, Layers } from 'lucide-react'
import { fetchWorkflowConfig, type WorkflowConfig, type StateConfig } from '../api/client'

const PHASE_COLORS: Record<string, string> = {
  discovery: 'bg-amber-500/10 text-amber-600 border-amber-300 dark:text-amber-400',
  research: 'bg-blue-500/10 text-blue-600 border-blue-300 dark:text-blue-400',
  analysis: 'bg-emerald-500/10 text-emerald-600 border-emerald-300 dark:text-emerald-400',
  drafting: 'bg-orange-500/10 text-orange-600 border-orange-300 dark:text-orange-400',
  review: 'bg-purple-500/10 text-purple-600 border-purple-300 dark:text-purple-400',
  submission: 'bg-emerald-600/10 text-emerald-700 border-emerald-400 dark:text-emerald-300',
  revision: 'bg-amber-600/10 text-amber-700 border-amber-400 dark:text-amber-300',
  archive: 'bg-slate-500/10 text-slate-600 border-slate-300 dark:text-slate-400',
}

interface Props {
  currentState: string
  history?: Array<{ state: string; timestamp: string }>
}

export default function WorkflowTimeline({ currentState, history = [] }: Props) {
  const [config, setConfig] = useState<WorkflowConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAllStates, setShowAllStates] = useState(false)

  useEffect(() => {
    fetchWorkflowConfig()
      .then(setConfig)
      .catch(() => setLoading(false))
      .finally(() => setLoading(false))
  }, [])

  const allStates = config?.ordered_states || []
  const stateConfig = config?.states || {} as Record<string, StateConfig>
  const currentIdx = allStates.indexOf(currentState)
  const totalStates = allStates.length
  const progressPercent = currentIdx >= 0 ? Math.round(((currentIdx + 1) / totalStates) * 100) : 5

  const start = Math.max(0, currentIdx - 3)
  const end = Math.min(totalStates, currentIdx + 4)
  const displayedStates = showAllStates ? allStates : allStates.slice(start, end)

  if (loading) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <div className="space-y-3">
            <div className="shimmer h-5 w-48 rounded" />
            <div className="shimmer h-2 w-full rounded" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="shimmer h-14 w-full rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full">
      <CardHeader className="p-4 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm font-semibold">
              Workflow Progress ({totalStates} Pipeline States)
            </CardTitle>
          </div>
          <Badge variant="outline" className="font-mono text-xs">
            Step {currentIdx >= 0 ? currentIdx + 1 : 1} of {totalStates} ({progressPercent}%)
          </Badge>
        </div>
        <Progress value={progressPercent} className="h-2 mt-2" />
      </CardHeader>
      <CardContent className="p-4 pt-1 space-y-4">
        <div className="space-y-3">
          {displayedStates.map((state) => {
            const idx = allStates.indexOf(state)
            const isCurrent = state === currentState
            const isPast = currentIdx >= 0 && idx < currentIdx
            const cfg = stateConfig[state] || { label: state, phase: 'discovery', description: '' }
            const historyEntry = history.find((h) => h.state === state)

            return (
              <div
                key={state}
                className={`p-2.5 rounded-lg border transition-all ${
                  isCurrent
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/30 shadow-xs'
                    : isPast
                    ? 'border-border/60 bg-card/60 opacity-90'
                    : 'border-border/30 bg-muted/20 opacity-60'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    {isCurrent ? (
                      <Clock className="w-4 h-4 text-primary animate-pulse" />
                    ) : isPast ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Circle className="w-4 h-4 text-muted-foreground/50" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className={`text-xs font-semibold ${isCurrent ? 'text-primary' : 'text-foreground'}`}>
                        {cfg.label}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 border ${PHASE_COLORS[cfg.phase] || ''}`}
                        >
                          {config?.phases?.[cfg.phase]?.label || cfg.phase}
                        </Badge>
                        {isCurrent && (
                          <Badge variant="default" className="text-[10px] px-1.5 py-0">
                            Current Active State
                          </Badge>
                        )}
                      </div>
                    </div>

                    <p className="text-[11px] text-muted-foreground leading-tight">
                      {cfg.description}
                    </p>

                    {historyEntry && (
                      <p className="text-[10px] font-mono text-muted-foreground pt-0.5">
                        Completed: {new Date(historyEntry.timestamp).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAllStates(!showAllStates)}
          className="w-full h-8 text-xs gap-1.5 mt-2"
        >
          {showAllStates ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              Show Compact View (Current Window)
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              Expand All {totalStates} Pipeline States ({totalStates - displayedStates.length} hidden)
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}