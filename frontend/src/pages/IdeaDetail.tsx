import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft,
  RefreshCw,
  Send,
  Loader2,
  TrendingUp,
  CheckCircle2,
  XCircle,
  FileText,
  Target,
  AlertTriangle,
} from 'lucide-react'
import {
  fetchIdeaDetail,
  scoreIdea,
  advanceIdea,
  connectSSE,
  type IdeaDetail as IdeaDetailType,
  type ScoreResult,
} from '../api/client'
import ScoreRadar from '../components/ScoreRadar'
import WorkflowTimeline from '../components/WorkflowTimeline'
import SiemensGateStatus from '../components/SiemensGateStatus'

const STRENGTH_LABELS: Record<string, { label: string; color: string }> = {
  'Very Strong': { label: 'Very Strong — Fast-track filing', color: 'text-green-700 bg-green-50 border-green-200' },
  'Strong': { label: 'Strong — Auto-promote to drafting', color: 'text-blue-700 bg-blue-50 border-blue-200' },
  'Moderate': { label: 'Moderate — Improvement pass recommended', color: 'text-yellow-700 bg-yellow-50 border-yellow-200' },
  'Weak': { label: 'Weak — Hold for significant improvement', color: 'text-orange-700 bg-orange-50 border-orange-200' },
  'Reject': { label: 'Reject — Archive with learning', color: 'text-red-700 bg-red-50 border-red-200' },
}

export default function IdeaDetail() {
  const { ideaId } = useParams<{ ideaId: string }>()
  const [detail, setDetail] = useState<IdeaDetailType | null>(null)
  const [loading, setLoading] = useState(true)
  const [scoring, setScoring] = useState(false)
  const [advancing, setAdvancing] = useState(false)
  const [lastScore, setLastScore] = useState<ScoreResult | null>(null)
  const [error, setError] = useState('')

  const loadDetail = async () => {
    if (!ideaId) return
    try {
      const data = await fetchIdeaDetail(ideaId)
      setDetail(data)
    } catch (err: any) {
      setError(err.message)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadDetail()

    if (!ideaId) return
    const es = connectSSE((event) => {
      if (event === 'idea.scored' || event === 'idea.transition') {
        loadDetail()
      }
    })
    return () => es.close()
  }, [ideaId])

  const handleScore = async () => {
    if (!ideaId) return
    setScoring(true)
    try {
      const result = await scoreIdea(ideaId)
      setLastScore(result)
      await loadDetail()
    } catch (err: any) {
      console.error(err)
    }
    setScoring(false)
  }

  const handleAdvance = async (target?: string) => {
    if (!ideaId) return
    setAdvancing(true)
    try {
      await advanceIdea(ideaId, target)
      await loadDetail()
    } catch (err: any) {
      console.error(err)
    }
    setAdvancing(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-siemens-green" />
      </div>
    )
  }

  if (error || !detail) {
    return (
      <div className="text-center py-16">
        <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <p className="text-red-600">{error || 'Idea not found'}</p>
        <Link to="/" className="text-siemens-green text-sm mt-2 inline-block">Back to Dashboard</Link>
      </div>
    )
  }

  const idea = detail.idea
  const stateData = detail.state
  const scoresData = detail.scores
  const latestScores = scoresData?.latest || {}
  const breakdown = latestScores?.breakdown || {}
  const scoreHistory = scoresData?.history || []
  const composite = latestScores?.composite || 0
  const strength = STRENGTH_LABELS[latestScores?.strength_rating || '']
  const currentState = idea?.current_state || stateData?.current_state || ''

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link to="/" className="flex items-center gap-1 text-sm text-gray-500 hover:text-siemens-green mb-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
          <h1 className="text-xl font-bold text-gray-900">
            {idea?.title || ideaId}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs font-mono text-gray-400">{ideaId}</span>
            <span className="text-gray-300">·</span>
            <span className="text-xs capitalize text-gray-600">{idea?.phase || stateData?.phase || ''}</span>
            <span className="text-gray-300">·</span>
            <span className="text-xs text-gray-600">{currentState.replace(/_/g, ' ')}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleScore}
            disabled={scoring}
            className="flex items-center gap-1.5 px-3 py-2 bg-white text-gray-700 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${scoring ? 'animate-spin' : ''}`} />
            Score
          </button>
          <button
            onClick={() => handleAdvance()}
            disabled={advancing}
            className="flex items-center gap-1.5 px-3 py-2 bg-siemens-green text-white text-sm rounded-lg hover:bg-siemens-teal transition-colors"
          >
            {advancing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Advance
          </button>
        </div>
      </div>

      {/* Score & Strength */}
      {composite > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-gray-200">
          <div className="flex items-center gap-2">
            <TrendingUp className={`w-5 h-5 ${
              composite >= 70 ? 'text-green-600' : composite >= 50 ? 'text-yellow-600' : 'text-orange-600'
            }`} />
            <span className="text-2xl font-bold text-gray-900">{composite}</span>
            <span className="text-xs text-gray-500">/ 100</span>
          </div>
          {strength && (
            <span className={`text-xs px-2 py-1 rounded border ${strength.color}`}>
              {strength.label}
            </span>
          )}
        </div>
      )}

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Problem Statement */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-4 h-4 text-siemens-green" />
              <h3 className="text-sm font-semibold text-gray-900">Problem Statement</h3>
            </div>
            <p className="text-sm text-gray-700">{idea?.problem_statement || idea?.signal_text || 'No problem statement yet.'}</p>
          </div>

          {/* Solution Concept */}
          {idea?.solution_concept && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Solution Concept</h3>
              <p className="text-sm text-gray-700">{idea.solution_concept}</p>
            </div>
          )}

          {/* Score Radar */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Score Breakdown</h3>
            <ScoreRadar breakdown={breakdown} size={280} />
          </div>

          {/* Evidence */}
          {idea?.source_evidence && idea.source_evidence.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Source Evidence</h3>
              <ul className="space-y-1.5">
                {idea.source_evidence.map((ev: string, i: number) => (
                  <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                    <FileText className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                    {ev}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Score History */}
          {scoreHistory.length > 1 && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Score History</h3>
              <div className="space-y-1">
                {scoreHistory.slice(-10).reverse().map((entry: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs text-gray-600 py-1 border-b border-gray-50 last:border-0">
                    <span className="font-mono">{entry.agent || 'system'}</span>
                    <span className="font-semibold">{entry.composite}/100</span>
                    <span className="text-gray-400">{entry.timestamp ? new Date(entry.timestamp).toLocaleString() : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Timeline & Gates */}
        <div className="space-y-6">
          <WorkflowTimeline
            currentState={currentState}
            history={stateData?.history || []}
          />

          {/* Gate Status */}
          <SiemensGateStatus
            gates={[
              { name: 'Prior Art Review', status: composite >= 50 ? 'pass' : 'pending', detail: `${composite}/100` },
              { name: 'Business Value', status: composite >= 40 ? 'pass' : 'pending', detail: `${composite >= 40 ? '✓' : '—'}` },
              { name: 'Siemens Alignment', status: composite >= 60 ? 'pass' : 'pending', detail: composite >= 60 ? 'Aligned' : 'Not checked' },
              { name: 'Composite ≥ 70', status: composite >= 70 ? 'pass' : currentState !== 'raw_signal_collected' ? 'fail' : 'pending', detail: `${composite}/70` },
            ]}
          />

          {/* Stats Card */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Details</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Created</dt>
                <dd className="text-gray-700">{idea?.created_at ? new Date(idea.created_at).toLocaleDateString() : '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Updated</dt>
                <dd className="text-gray-700">{idea?.updated_at ? new Date(idea.updated_at).toLocaleDateString() : '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Composite</dt>
                <dd className="font-semibold">{composite}/100</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">State</dt>
                <dd className="text-gray-700">{currentState.replace(/_/g, ' ')}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  )
}
