import { Link } from 'react-router-dom'
import type { IdeaListItem } from '../api/client'

const PHASE_COLORS: Record<string, string> = {
  discovery: 'bg-phase-discovery',
  research: 'bg-phase-research',
  analysis: 'bg-phase-analysis',
  drafting: 'bg-phase-drafting',
  review: 'bg-phase-review',
  done: 'bg-phase-done',
}

const STRENGTH_COLORS: Record<string, string> = {
  'Very Strong': 'text-green-600 bg-green-50 border-green-200',
  'Strong': 'text-blue-600 bg-blue-50 border-blue-200',
  'Moderate': 'text-yellow-600 bg-yellow-50 border-yellow-200',
  'Weak': 'text-orange-600 bg-orange-50 border-orange-200',
  'Reject': 'text-red-600 bg-red-50 border-red-200',
}

function ScoreBadge({ score }: { score: number }) {
  let color = 'bg-gray-100 text-gray-700'
  if (score >= 85) color = 'bg-green-100 text-green-700'
  else if (score >= 70) color = 'bg-blue-100 text-blue-700'
  else if (score >= 50) color = 'bg-yellow-100 text-yellow-700'
  else if (score >= 30) color = 'bg-orange-100 text-orange-700'
  else color = 'bg-red-100 text-red-700'

  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${color}`}>{score}</span>
}

export default function IdeaCard({ idea }: { idea: IdeaListItem }) {
  const colorKey = idea.phase?.toLowerCase() || 'discovery'
  const phaseColor = PHASE_COLORS[colorKey] || PHASE_COLORS.discovery
  const rating = STRENGTH_COLORS[idea.strength_rating] || ''

  return (
    <Link
      to={`/ideas/${idea.idea_id}`}
      className="block bg-white rounded-lg border border-gray-200 hover:border-siemens-green/40 hover:shadow-sm transition-all"
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono text-gray-400">{idea.idea_id}</span>
              {idea.running_agent && (
                <span className="flex items-center gap-1 text-xs text-siemens-green">
                  <span className="w-1.5 h-1.5 bg-siemens-green rounded-full animate-pulse" />
                  {idea.running_agent}
                </span>
              )}
            </div>
            <h3 className="font-medium text-gray-900 truncate">{idea.title}</h3>
          </div>
          <ScoreBadge score={idea.composite_score} />
        </div>

        <div className="flex items-center gap-2 mt-3">
          <span className={`w-2 h-2 rounded-full ${phaseColor}`} />
          <span className="text-xs text-gray-500 capitalize">{idea.phase}</span>
          <span className="text-gray-300">·</span>
          <span className="text-xs text-gray-500">{idea.state?.replace(/_/g, ' ')}</span>
          {rating && (
            <>
              <span className="text-gray-300">·</span>
              <span className={`text-xs px-1.5 py-0.5 rounded border ${rating}`}>
                {idea.strength_rating}
              </span>
            </>
          )}
        </div>

        {idea.updated_at && (
          <p className="text-xs text-gray-400 mt-2">
            {new Date(idea.updated_at).toLocaleDateString()}
          </p>
        )}
      </div>
    </Link>
  )
}
