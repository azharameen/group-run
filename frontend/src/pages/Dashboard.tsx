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
import IdeasInProgress from '../components/IdeasInProgress'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'

const PHASES = [
  { key: 'discovery', label: 'Discovery', color: 'bg-amber-500' },
  { key: 'research', label: 'Research', color: 'bg-blue-500' },
  { key: 'analysis', label: 'Analysis', color: 'bg-emerald-500' },
  { key: 'drafting', label: 'Drafting', color: 'bg-orange-500' },
  { key: 'review', label: 'Review', color: 'bg-rose-500' },
  { key: 'done', label: 'Done', color: 'bg-slate-500' },
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
      setActionMessage('Workflow cycle completed successfully.')
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
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Lightbulb className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-medium">Total Ideas</span>
            </div>
            <p className="text-3xl font-bold tracking-tight">{stats?.total_ideas || 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <TrendingUp className="w-4 h-4 text-blue-500" />
              <span className="text-xs font-medium">Avg Composite Score</span>
            </div>
            <p className="text-3xl font-bold tracking-tight">{stats?.average_score || 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Shield className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-medium">Above Gate Threshold</span>
            </div>
            <p className="text-3xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              {stats?.ideas_above_threshold || 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <BarChart3 className="w-4 h-4 text-primary" />
              <span className="text-xs font-medium">Phase Breakdown</span>
            </div>
            <div className="flex gap-1.5 mt-3">
              {PHASES.map((p) => {
                const count = stats?.by_phase?.[p.key] || 0
                const total = stats?.total_ideas || 1
                return (
                  <div
                    key={p.key}
                    className="group relative flex-1 h-3 rounded-full overflow-hidden bg-muted"
                  >
                    <div
                      className={`h-full rounded-full ${p.color} transition-all`}
                      style={{ width: `${(count / total) * 100}%` }}
                    />
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ideas In Progress — agents actively working */}
      <IdeasInProgress />

      {/* Control Bar: Filters & Actions */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Filter ideas by keyword..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>

          <div className="flex flex-wrap gap-1">
            {PHASES.map((p) => (
              <Badge
                key={p.key}
                variant={phaseFilter === p.key ? "default" : "outline"}
                className="cursor-pointer transition-colors"
                onClick={() => setPhaseFilter(phaseFilter === p.key ? null : p.key)}
              >
                {p.label}
              </Badge>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            onClick={handleAutonomousGenerate}
            disabled={generating}
            className="gap-2"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {generating ? 'Generating...' : 'Autonomous Generate'}
          </Button>

          <Button
            variant="outline"
            onClick={() => setShowSteerModal(true)}
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            Optional Hint
          </Button>

          <Button
            variant="secondary"
            onClick={handleCycle}
            disabled={cycling}
            className="gap-2"
          >
            {cycling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 text-amber-500" />}
            {cycling ? 'Running...' : 'Advance Cycle'}
          </Button>
        </div>
      </div>

      {actionMessage && (
        <Alert>
          <Sparkles className="h-4 w-4" />
          <AlertDescription>{actionMessage}</AlertDescription>
        </Alert>
      )}

      {/* Steer Modal */}
      <Dialog open={showSteerModal} onOpenChange={setShowSteerModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Optional Steering Hint</DialogTitle>
            <DialogDescription>
              Provide a domain focus or specific target to direct the autonomous agent. Leave blank for organic discovery.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Textarea
              value={steerText}
              onChange={(e) => setSteerText(e.target.value)}
              placeholder="e.g., Siemens energy automation, edge diagnostic sensors, motor efficiency telemetry..."
              className="h-32 resize-none"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setShowSteerModal(false); setSteerText('') }}>
              Cancel
            </Button>
            <Button
              onClick={handleSteeredGenerate}
              disabled={steering || !steerText.trim()}
              className="gap-2"
            >
              {steering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Generate with Hint
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ideas Grid */}
      {filteredIdeas.length === 0 ? (
        <Card className="p-12 text-center">
          <CardContent className="space-y-4">
            <Zap className="w-12 h-12 text-muted-foreground mx-auto" />
            <div className="space-y-1">
              <h3 className="text-lg font-semibold">No ideas found</h3>
              <p className="text-sm text-muted-foreground">
                Run autonomous generation to trigger the multi-agent patent pipeline.
              </p>
            </div>
            <div className="flex justify-center gap-2 pt-2">
              <Button onClick={handleAutonomousGenerate}>
                Autonomous Generate
              </Button>
              <Button variant="outline" onClick={() => setShowSteerModal(true)}>
                Optional Hint
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredIdeas.map((idea) => (
            <IdeaCard key={idea.idea_id} idea={idea} />
          ))}
        </div>
      )}
    </div>
  )
}
