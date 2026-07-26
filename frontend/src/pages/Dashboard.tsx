import { useCallback, useEffect, useState } from 'react'
import {
  Search,
  Plus,
  Play,
  Sparkles,
  BarChart3,
  Loader2,
  TrendingUp,
  Lightbulb,
  Shield,
  Zap,
} from 'lucide-react'
import {
  fetchIdeas,
  fetchStats,
  triggerCycle,
  generateAutonomousIdeas,
  submitPipeline,
  connectSSE,
  type IdeaListItem,
  type Stats,
} from '../api/client'
import IdeaCard from '../components/IdeaCard'

const PHASES = [
  { key: 'discovery', label: 'Discovery', color: 'bg-phase-discovery' },
  { key: 'research', label: 'Research', color: 'bg-phase-research' },
  { key: 'analysis', label: 'Analysis', color: 'bg-phase-analysis' },
  { key: 'drafting', label: 'Drafting', color: 'bg-phase-drafting' },
  { key: 'review', label: 'Review', color: 'bg-phase-review' },
  { key: 'done', label: 'Done', color: 'bg-phase-done' },
]

export default function Dashboard() {
  const [ideas, setIdeas] = useState<IdeaListItem[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [cycling, setCycling] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [steering, setSteering] = useState(false)
  const [showSteerModal, setShowSteerModal] = useState(false)
  const [steerText, setSteerText] = useState('')
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [phaseFilter, setPhaseFilter] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const loadData = useCallback(async () => {
    try {
      const [ideasData, statsData] = await Promise.all([
        fetchIdeas(),
        fetchStats(),
      ])
      setIdeas(ideasData)
      setStats(statsData)
    } catch (err) {
      console.error('Failed to load dashboard data:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()

    const es = connectSSE((event) => {
      if (['idea.created', 'idea.transition', 'idea.scored', 'gate.passed', 'gate.failed'].includes(event)) {
        loadData()
      }
    })

    return () => es.close()
  }, [loadData])

  const handleCycle = async () => {
    setCycling(true)
    try {
      await triggerCycle()
      await loadData()
      setActionMessage('Workflow cycle completed.')
    } catch (err) {
      console.error('Cycle error:', err)
      setActionMessage(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
    setCycling(false)
  }

  const handleAutonomousGenerate = async () => {
    setGenerating(true)
    setActionMessage(null)
    try {
      const result = await generateAutonomousIdeas(3)
      setActionMessage(`Autonomous generation created ${result.ideas_count || result.ideas?.length || 0} idea(s).`)
      await loadData()
    } catch (err) {
      console.error('Autonomous generation error:', err)
      setActionMessage(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
    setGenerating(false)
  }

  const handleSteeredGenerate = async () => {
    if (!steerText.trim()) return
    setSteering(true)
    setActionMessage(null)
    try {
      const result = await submitPipeline(steerText)
      setActionMessage(`Steered generation created ${result.ideas_count || result.ideas?.length || 0} idea(s).`)
      setSteerText('')
      setShowSteerModal(false)
      await loadData()
    } catch (err) {
      console.error('Steered generation error:', err)
      setActionMessage(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
    setSteering(false)
  }

  const filteredIdeas = ideas.filter((idea) => {
    if (phaseFilter && idea.phase !== phaseFilter) return false
    if (searchQuery && !idea.title.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-siemens-green" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <Lightbulb className="w-4 h-4" />
            <span className="text-xs font-medium">Total Ideas</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats?.total_ideas || 0}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <TrendingUp className="w-4 h-4" />
            <span className="text-xs font-medium">Avg Score</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats?.average_score || 0}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <Shield className="w-4 h-4" />
            <span className="text-xs font-medium">Above Threshold</span>
          </div>
          <p className="text-2xl font-bold text-green-600">{stats?.ideas_above_threshold || 0}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <BarChart3 className="w-4 h-4" />
            <span className="text-xs font-medium">Phase Distribution</span>
          </div>
          <div className="flex gap-1 mt-1">
            {PHASES.map((p) => {
              const count = stats?.by_phase?.[p.key] || 0
              const total = stats?.total_ideas || 1
              return (
                <div
                  key={p.key}
                  className="group relative flex-1 h-2 rounded-full overflow-hidden bg-gray-100"
                >
                  <div
                    className={`h-full rounded-full ${p.color} transition-all`}
                    style={{ width: `${(count / total) * 100}%` }}
                  />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-gray-800 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap z-10">
                    {p.key}: {count}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search ideas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-siemens-green/20 focus:border-siemens-green"
          />
        </div>

        <div className="flex gap-1">
          {PHASES.map((p) => (
            <button
              key={p.key}
              onClick={() => setPhaseFilter(phaseFilter === p.key ? null : p.key)}
              className={`px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${
                phaseFilter === p.key
                  ? `${p.color} text-white border-transparent`
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleAutonomousGenerate}
            disabled={generating}
            className="flex items-center gap-1.5 px-3 py-2 bg-siemens-green text-white text-sm rounded-lg hover:bg-siemens-teal transition-colors disabled:opacity-50"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {generating ? 'Generating...' : 'Autonomous Generate'}
          </button>
          <button
            onClick={() => setShowSteerModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-white text-gray-700 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Optional Hint
          </button>
          <button
            onClick={handleCycle}
            disabled={cycling}
            className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 text-white text-sm rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50"
          >
            {cycling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {cycling ? 'Running...' : 'Advance Cycle'}
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className="p-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-700">
          {actionMessage}
        </div>
      )}

      {showSteerModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowSteerModal(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Optional steering hint</h3>
            <p className="text-sm text-gray-500 mb-4">
              Provide a short signal if you want to steer the autonomous agent. Leave this empty if you want the system to discover ideas on its own.
            </p>
            <textarea
              value={steerText}
              onChange={(e) => setSteerText(e.target.value)}
              placeholder="Example: factory energy optimization, edge telemetry, predictive maintenance..."
              className="w-full h-32 p-3 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-siemens-green/20 focus:border-siemens-green"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => { setShowSteerModal(false); setSteerText('') }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={handleSteeredGenerate}
                disabled={steering || !steerText.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white text-sm rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors"
              >
                {steering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                Generate with Hint
              </button>
            </div>
          </div>
        </div>
      )}

      {filteredIdeas.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg border border-gray-200">
          <Zap className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-600 mb-1">No ideas yet</h3>
          <p className="text-sm text-gray-400 mb-4">
            Run autonomous generation to create the first idea, or add an optional steering hint.
          </p>
          <div className="flex justify-center gap-2">
            <button
              onClick={handleAutonomousGenerate}
              className="px-4 py-2 bg-siemens-green text-white text-sm rounded-lg hover:bg-siemens-teal"
            >
              Autonomous Generate
            </button>
            <button
              onClick={() => setShowSteerModal(true)}
              className="px-4 py-2 bg-white text-gray-700 text-sm border rounded-lg hover:bg-gray-50"
            >
              Optional Hint
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredIdeas.map((idea) => (
            <IdeaCard key={idea.idea_id} idea={idea} />
          ))}
        </div>
      )}
    </div>
  )
}
