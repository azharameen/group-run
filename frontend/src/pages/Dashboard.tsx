import { useCallback, useEffect, useState } from 'react'
import {
  Search,
  Sparkles,
  BarChart3,
  Loader2,
  TrendingUp,
  Lightbulb,
  Shield,
  Play,
} from 'lucide-react'
import {
  fetchIdeas,
  fetchStats,
  triggerCycle,
  submitPipeline,
  fetchWorkflowConfig,
  fetchTopics,
  fetchProjects,
  connectSSE,
  type IdeaListItem,
  type Stats,
  type WorkflowConfig,
  type Topic,
  type Project,
} from '../api/client'
import IdeaCard from '../components/IdeaCard'
import IdeasInProgress from '../components/IdeasInProgress'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'

const PHASE_COLORS: Record<string, string> = {
  discovery: 'bg-amber-500',
  research: 'bg-blue-500',
  analysis: 'bg-emerald-500',
  drafting: 'bg-orange-500',
  review: 'bg-purple-500',
  submission: 'bg-emerald-600',
  revision: 'bg-amber-600',
  archive: 'bg-slate-500',
}

const IDEA_CATEGORIES = [
  { value: 'Product Enhancement / Feature', label: 'Product Enhancement / Feature' },
  { value: 'New Product Idea', label: 'New Product Idea' },
  { value: 'Existing Project', label: 'Existing Project' },
  { value: 'Others', label: 'Others' },
]

export default function Dashboard() {
  const [ideas, setIdeas] = useState<IdeaListItem[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [workflowConfig, setWorkflowConfig] = useState<WorkflowConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [cycling, setCycling] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [promptText, setPromptText] = useState('')
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [phaseFilter, setPhaseFilter] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Generate Idea form state
  const [topics, setTopics] = useState<Topic[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedTopic, setSelectedTopic] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('New Product Idea')
  const [selectedProject, setSelectedProject] = useState('')

  const loadData = useCallback(async () => {
    try {
      const [ideasData, statsData, wfConfig] = await Promise.all([
        fetchIdeas(),
        fetchStats(),
        fetchWorkflowConfig().catch(() => null),
      ])
      setIdeas(ideasData)
      setStats(statsData)
      if (wfConfig) setWorkflowConfig(wfConfig)
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

  const openGenerateDialog = () => {
    fetchTopics().then(setTopics)
    fetchProjects().then(setProjects)
    setSelectedTopic('')
    setSelectedCategory('New Product Idea')
    setSelectedProject('')
    setPromptText('')
    setShowGenerateModal(true)
  }

  const handleGenerate = async () => {
    setGenerating(true)
    setActionMessage(null)
    try {
      const topicObj = topics.find((t) => String(t.TopicId) === selectedTopic)
      const projectObj = projects.find((p) => String(p.ProjectID) === selectedProject)
      const result = await submitPipeline(promptText, 3, {
        topicName: topicObj?.TopicName || '',
        ideaCategory: selectedCategory,
        projectName: projectObj?.ProjectName || '',
      })
      const count = result.ideas_count || result.ideas?.length || 0
      setActionMessage(`Generated ${count} idea(s). Pipeline running.`)
      setShowGenerateModal(false)
      await loadData()
    } catch (err) {
      console.error('Generation error:', err)
      setActionMessage(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
    setGenerating(false)
  }

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
              {Object.entries(workflowConfig?.phases || { discovery: { label: 'Discovery', color: 'amber' } }).map(([key, p]) => {
                const count = stats?.by_phase?.[key] || 0
                const total = stats?.total_ideas || 1
                return (
                  <div
                    key={key}
                    className="group relative flex-1 h-3 rounded-full overflow-hidden bg-muted"
                  >
                    <div
                      className={`h-full rounded-full ${PHASE_COLORS[key] || 'bg-slate-500'} transition-all`}
                      style={{ width: `${(count / total) * 100}%` }}
                    />
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <IdeasInProgress />

      {/* Control Bar */}
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
            {(Object.entries(workflowConfig?.phases || { discovery: { label: 'Discovery', color: 'amber' } }) ).map(([key, p]) => (
              <Badge
                key={key}
                variant={phaseFilter === key ? "default" : "outline"}
                className="cursor-pointer transition-colors"
                onClick={() => setPhaseFilter(phaseFilter === key ? null : key)}
              >
                {p.label}
              </Badge>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={openGenerateDialog} className="gap-2">
            <Sparkles className="w-4 h-4" />
            Generate Idea
          </Button>

          <Button variant="secondary" onClick={handleCycle} disabled={cycling} className="gap-2">
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

      {/* Generate Idea Dialog */}
      <Dialog open={showGenerateModal} onOpenChange={setShowGenerateModal}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Generate New Idea</DialogTitle>
            <DialogDescription>
              Select a topic, category, and optionally describe what you want. The agent will generate ideas through the full pipeline.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Topic */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Technology Topic</label>
              <Select value={selectedTopic} onValueChange={setSelectedTopic}>
                <SelectTrigger>
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Any</SelectItem>
                  {topics.map((t) => (
                    <SelectItem key={t.TopicId} value={String(t.TopicId)}>
                      {t.TopicName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Idea Category */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Idea Category</label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IDEA_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Project (only when Existing Project) */}
            {selectedCategory === 'Existing Project' && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Select Project</label>
                <Select value={selectedProject} onValueChange={setSelectedProject}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a project..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {projects
                      .filter((p) => p.ProjectName.trim())
                      .map((p) => (
                        <SelectItem key={p.ProjectID} value={String(p.ProjectID)}>
                          {p.ProjectName}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Prompt */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Your Prompt (optional)</label>
              <Textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder="Describe what kind of idea you're looking for... Leave empty for autonomous generation based on the topic above."
                className="h-24 resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowGenerateModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleGenerate} disabled={generating} className="gap-2">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {generating ? 'Generating...' : 'Generate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ideas Grid */}
      {filteredIdeas.length === 0 ? (
        <Card className="p-12 text-center">
          <CardContent className="space-y-4">
            <Sparkles className="w-12 h-12 text-muted-foreground mx-auto" />
            <div className="space-y-1">
              <h3 className="text-lg font-semibold">No ideas found</h3>
              <p className="text-sm text-muted-foreground">
                Click Generate Idea to start the multi-agent pipeline.
              </p>
            </div>
            <div className="flex justify-center pt-2">
              <Button onClick={openGenerateDialog}>Generate Idea</Button>
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