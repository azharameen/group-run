import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { CheckCircle2, Circle, Clock, ChevronDown, ChevronUp, Layers } from 'lucide-react'

const STATE_CONFIG: Record<string, { label: string; phase: string; description: string }> = {
  raw_signal_collected: { label: '1. Raw Signal Collected', phase: 'Discovery', description: 'Initial signal or technology trend ingested into pipeline.' },
  idea_discovery: { label: '2. Idea Discovery', phase: 'Discovery', description: 'Autonomous agent extracts core idea concept.' },
  idea_clarification: { label: '3. Idea Clarification', phase: 'Discovery', description: 'Refining problem statement and target domain.' },
  novelty_hypothesis: { label: '4. Novelty Hypothesis', phase: 'Research', description: 'Formulating non-obviousness argument.' },
  prior_art_review: { label: '5. Prior Art Review', phase: 'Research', description: 'Searching Google Patents, USPTO & EPO for existing art.' },
  detectability_review: { label: '6. Detectability Review', phase: 'Research', description: 'Evaluating how infringement can be detected.' },
  business_value_review: { label: '7. Business Value Review', phase: 'Analysis', description: 'Evaluating economic value and market impact.' },
  siemens_innovation_alignment: { label: '8. Siemens Alignment', phase: 'Analysis', description: 'Matching with Siemens strategic business units.' },
  ideascope_draft: { label: '9. IdeaScope Draft', phase: 'Drafting', description: 'Drafting structured Siemens IdeaScope disclosure.' },
  siemens_internal_filing_check: { label: '10. Internal Filing Check', phase: 'Drafting', description: 'Verifying mandatory Siemens disclosure fields.' },
  manager_or_enabler_review: { label: '11. Manager Review', phase: 'Review', description: 'Siemens innovation manager sign-off.' },
  ip_review: { label: '12. IP Department Review', phase: 'Review', description: 'Internal IP team prior art assessment.' },
  siemens_ip_counsel_validation: { label: '13. IP Counsel Validation', phase: 'Review', description: 'Written legal patentability validation.' },
  ready_for_submission: { label: '14. Ready for Submission', phase: 'Submission', description: 'All gate checks passed for formal filing.' },
  submitted: { label: '15. Formally Submitted', phase: 'Submission', description: 'Submitted to Siemens IP filing system.' },
  feedback_received: { label: '16. Feedback Received', phase: 'Submission', description: 'Reviewer or patent office response.' },
  accepted_or_closed: { label: '17. Accepted / Closed', phase: 'Submission', description: 'Filing accepted and registered.' },
  revision_in_progress: { label: '18. Revision in Progress', phase: 'Revision', description: 'Active revision based on feedback.' },
  on_hold: { label: '19. On Hold', phase: 'Archive', description: 'Temporarily deferred for future context.' },
  archived: { label: '20. Archived', phase: 'Archive', description: 'Pipeline run archived.' },
}

const PHASE_COLORS: Record<string, string> = {
  Discovery: 'bg-amber-500/10 text-amber-600 border-amber-300 dark:text-amber-400',
  Research: 'bg-blue-500/10 text-blue-600 border-blue-300 dark:text-blue-400',
  Analysis: 'bg-emerald-500/10 text-emerald-600 border-emerald-300 dark:text-emerald-400',
  Drafting: 'bg-orange-500/10 text-orange-600 border-orange-300 dark:text-orange-400',
  Review: 'bg-purple-500/10 text-purple-600 border-purple-300 dark:text-purple-400',
  Submission: 'bg-emerald-600/10 text-emerald-700 border-emerald-400 dark:text-emerald-300',
  Revision: 'bg-amber-600/10 text-amber-700 border-amber-400 dark:text-amber-300',
  Archive: 'bg-slate-500/10 text-slate-600 border-slate-300 dark:text-slate-400',
}

interface Props {
  currentState: string
  history?: Array<{ state: string; timestamp: string }>
}

export default function WorkflowTimeline({ currentState, history = [] }: Props) {
  const [showAllStates, setShowAllStates] = useState(false)
  const allStates = Object.keys(STATE_CONFIG)
  const currentIdx = allStates.indexOf(currentState)
  const totalStates = allStates.length
  const progressPercent = currentIdx >= 0 ? Math.round(((currentIdx + 1) / totalStates) * 100) : 5

  // Sliced view for compact mode vs full 20 states
  const start = Math.max(0, currentIdx - 3)
  const end = Math.min(totalStates, currentIdx + 4)
  const displayedStates = showAllStates ? allStates : allStates.slice(start, end)

  return (
    <Card className="w-full">
      <CardHeader className="p-4 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm font-semibold">
              Workflow Progress (20 Pipeline States)
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
            const config = STATE_CONFIG[state] || { label: state, phase: 'Discovery', description: '' }
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
                        {config.label}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 border ${PHASE_COLORS[config.phase] || ''}`}
                        >
                          {config.phase}
                        </Badge>
                        {isCurrent && (
                          <Badge variant="default" className="text-[10px] px-1.5 py-0">
                            Current Active State
                          </Badge>
                        )}
                      </div>
                    </div>

                    <p className="text-[11px] text-muted-foreground leading-tight">
                      {config.description}
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
              Expand All 20 Workflow Pipeline States ({totalStates - displayedStates.length} hidden)
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
