import { useCallback, useEffect, useState } from 'react'
import {
  Search,
  Sparkles,
  Loader2,
  Play,
  Lightbulb,
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
import { DashboardStatsCards } from '@/components/dashboard/DashboardStatsCards'
import { GenerateIdeaModal } from '@/components/dashboard/GenerateIdeaModal'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'

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
      <div className="h-full overflow-y-auto p-6 md:p-8 pt-6 max-w-7xl w-full mx-auto space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <Skeleton className="h-3.5 w-24 mb-2.5" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-6 md:p-8 pt-6 max-w-7xl w-full mx-auto space-y-6">
      <DashboardStatsCards stats={stats} workflowConfig={workflowConfig} />

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
            {Object.entries(workflowConfig?.phases || { discovery: { label: 'Discovery', color: 'amber' } }).map(([key, p]) => (
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

      <GenerateIdeaModal
        open={showGenerateModal}
        onOpenChange={setShowGenerateModal}
        topics={topics}
        projects={projects}
        selectedTopic={selectedTopic}
        onSelectTopic={setSelectedTopic}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        selectedProject={selectedProject}
        onSelectProject={setSelectedProject}
        promptText={promptText}
        onPromptTextChange={setPromptText}
        generating={generating}
        onGenerate={handleGenerate}
      />

      {/* Ideas Grid */}
      {filteredIdeas.length === 0 ? (
        <Card className="p-12 text-center">
          <Lightbulb className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <p className="font-semibold text-lg">No ideas found</p>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            {phaseFilter ? `No ideas in phase "${phaseFilter}".` : 'Get started by creating or generating your first idea.'}
          </p>
          <Button onClick={openGenerateDialog} className="gap-2">
            <Sparkles className="w-4 h-4" />
            Generate First Idea
          </Button>
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