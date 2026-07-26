const STATE_LABELS: Record<string, string> = {
  raw_signal_collected: 'Raw Signal',
  idea_discovery: 'Idea Discovery',
  idea_clarification: 'Idea Clarification',
  novelty_hypothesis: 'Novelty Hypothesis',
  prior_art_review: 'Prior Art Review',
  detectability_review: 'Detectability Review',
  business_value_review: 'Business Value Review',
  siemens_innovation_alignment: 'Siemens Alignment',
  ideascope_draft: 'IdeaScope Draft',
  siemens_internal_filing_check: 'Siemens Filing Check',
  manager_or_enabler_review: 'Manager Review',
  ip_review: 'IP Review',
  siemens_ip_counsel_validation: 'IP Counsel Validation',
  ready_for_submission: 'Ready for Submission',
  submitted: 'Submitted',
  feedback_received: 'Feedback Received',
  accepted_or_closed: 'Accepted/Closed',
  revision_in_progress: 'Revision',
  on_hold: 'On Hold',
  archived: 'Archived',
}

const PHASE_GROUP: Record<string, string> = {
  raw_signal_collected: 'discovery',
  idea_discovery: 'discovery',
  idea_clarification: 'discovery',
  novelty_hypothesis: 'research',
  prior_art_review: 'research',
  detectability_review: 'research',
  business_value_review: 'analysis',
  siemens_innovation_alignment: 'analysis',
  ideascope_draft: 'drafting',
  siemens_internal_filing_check: 'drafting',
  manager_or_enabler_review: 'review',
  ip_review: 'review',
  siemens_ip_counsel_validation: 'review',
  ready_for_submission: 'done',
  submitted: 'done',
  feedback_received: 'done',
  accepted_or_closed: 'done',
  revision_in_progress: 'drafting',
  on_hold: 'done',
  archived: 'done',
}

const PHASE_COLORS: Record<string, string> = {
  discovery: 'bg-phase-discovery',
  research: 'bg-phase-research',
  analysis: 'bg-phase-analysis',
  drafting: 'bg-phase-drafting',
  review: 'bg-phase-review',
  done: 'bg-phase-done',
}

interface Props {
  currentState: string
  history?: Array<{ state: string; timestamp: string }>
}

export default function WorkflowTimeline({ currentState, history = [] }: Props) {
  const allStates = Object.keys(STATE_LABELS)
  const currentIdx = allStates.indexOf(currentState)

  // Determine which states to show (current ± some context)
  const start = Math.max(0, currentIdx - 4)
  const end = Math.min(allStates.length, currentIdx + 3)
  const visibleStates = allStates.slice(start, end)

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Workflow Timeline</h3>
      <div className="space-y-1">
        {visibleStates.map((state, i) => {
          const idx = start + i
          const isCurrent = state === currentState
          const isPast = idx < currentIdx
          const phase = PHASE_GROUP[state] || 'discovery'
          const color = PHASE_COLORS[phase] || 'bg-gray-300'
          const historyEntry = history.find((h) => h.state === state)

          return (
            <div key={state} className="flex items-center gap-3">
              <div className="flex flex-col items-center">
                <div
                  className={`w-3 h-3 rounded-full border-2 ${
                    isCurrent
                      ? `${color} border-white ring-2 ring-gray-400`
                      : isPast
                      ? `${color} border-transparent`
                      : 'bg-gray-200 border-gray-300'
                  }`}
                />
                {i < visibleStates.length - 1 && (
                  <div
                    className={`w-0.5 h-6 ${
                      isPast || isCurrent ? color.replace('bg-', 'bg-') : 'bg-gray-200'
                    }`}
                    style={{ opacity: isPast || isCurrent ? 1 : 0.3 }}
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className={`text-xs ${
                    isCurrent
                      ? 'font-semibold text-gray-900'
                      : isPast
                      ? 'text-gray-500'
                      : 'text-gray-400'
                  }`}
                >
                  {STATE_LABELS[state] || state.replace(/_/g, ' ')}
                  {isCurrent && <span className="ml-1 text-siemens-green">●</span>}
                </p>
                {historyEntry && (
                  <p className="text-[10px] text-gray-400">
                    {new Date(historyEntry.timestamp).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {visibleStates.length < allStates.length && (
        <p className="text-xs text-gray-400 mt-2 text-center">
          {start > 0 ? '↑ earlier · ' : ''}
          {`${currentIdx + 1}/${allStates.length}`}
          {end < allStates.length ? ' · later ↓' : ''}
        </p>
      )}
    </div>
  )
}
