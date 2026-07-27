import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
    RefreshCw,
    Send,
    Loader2,
    TrendingUp,
    FileText,
    Target,
    AlertTriangle,
    ChevronDown,
    ChevronRight,
    Lightbulb,
    Search,
    Shield,
    Zap,
    BarChart3,
    BookOpen,
    ClipboardCheck,
    Users,
    Scale,
    Globe,
    Layers,
    MessageSquare,
    Folder
} from 'lucide-react'
import {
    fetchIdeaDetail,
    fetchIdeaFiles,
    scoreIdea,
    advanceIdea,
    connectSSE,
    type IdeaDetail as IdeaDetailType,
    type IdeaFile,
} from '../api/client'

import ScoreRadar from '../components/ScoreRadar'
import WorkflowTimeline from '../components/WorkflowTimeline'
import SiemensGateStatus from '../components/SiemensGateStatus'
import { IdeaHistoryTimeline } from '../components/IdeaHistoryTimeline'
import { IdeaFilesystem } from '../components/IdeaFilesystem'

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'

const STRENGTH_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  'Very Strong': 'default',
  'Strong': 'default',
  'Moderate': 'secondary',
  'Weak': 'outline',
  'Reject': 'destructive',
}

const CRITERION_LABELS: Record<string, string> = {
  novelty: 'Novelty',
  siemens_alignment: 'Siemens Alignment',
  technical_feasibility: 'Technical Feasibility',
  detectability: 'Detectability',
  business_value: 'Business Value',
  originality: 'Originality',
  completeness: 'Completeness',
}

function ResearchSection({ title, icon: Icon, data }: { title: string; icon: any; data: any }) {
  if (!data) return null
  const [open, setOpen] = useState(false)

  const renderValue = (value: any): string => {
    if (typeof value === 'string') return value
    if (Array.isArray(value)) return value.map(v => renderValue(v)).join(', ')
    if (typeof value === 'object' && value !== null) return JSON.stringify(value, null, 2)
    return String(value)
  }

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors p-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Icon className="w-4 h-4 text-primary" />
                {title}
              </CardTitle>
              {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="p-4 pt-0">
            {typeof data === 'object' && !Array.isArray(data) ? (
              <div className="space-y-2 text-xs">
                {Object.entries(data).map(([key, value]) => (
                  <div key={key}>
                    <span className="font-medium text-muted-foreground capitalize">
                      {key.replace(/_/g, ' ')}:
                    </span>{' '}
                    <span className="text-foreground">{renderValue(value)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-foreground">{renderValue(data)}</p>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}

export default function IdeaDetail({ onIdeaLoaded }: { onIdeaLoaded?: (title: string) => void }) {
  const { ideaId } = useParams<{ ideaId: string }>()
  const [detail, setDetail] = useState<IdeaDetailType | null>(null)
  const [files, setFiles] = useState<IdeaFile[]>([])
  const [loading, setLoading] = useState(true)
  const [scoring, setScoring] = useState(false)
  const [advancing, setAdvancing] = useState(false)
  const [error, setError] = useState('')

  const loadData = async () => {
    if (!ideaId) return
    try {
      const [detailRes, filesRes] = await Promise.all([
        fetchIdeaDetail(ideaId),
        fetchIdeaFiles(ideaId).catch(() => []),
      ])
      setDetail(detailRes)
      setFiles(filesRes)
      if (detailRes?.idea?.title && onIdeaLoaded) {
        onIdeaLoaded(detailRes.idea.title)
      }
    } catch (err: any) {
      setError(err.message)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadData()
    if (!ideaId) return
    const es = connectSSE((event) => {
      if (['idea.scored', 'idea.transition', 'agent.progress'].includes(event)) {
        loadData()
      }
    })
    return () => es.close()
  }, [ideaId])

  const handleScore = async () => {
    if (!ideaId) return
    setScoring(true)
    try {
      await scoreIdea(ideaId)
      await loadData()
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
      await loadData()
    } catch (err: any) {
      console.error(err)
    }
    setAdvancing(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !detail) {
    return (
      <div className="text-center py-16">
        <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-3" />
        <p className="text-destructive font-medium">{error || 'Idea not found'}</p>
        <Button variant="link" asChild className="mt-2">
          <Link to="/">Back to Dashboard</Link>
        </Button>
      </div>
    )
  }

  const idea = detail.idea
  const stateData = detail.state
  const scoresData = detail.scores
  const latestScores = scoresData?.latest || {}
  const breakdown = latestScores?.breakdown || {}
  const composite = latestScores?.composite || 0
  const strengthRating = latestScores?.strength_rating || ''
  const currentState = idea?.current_state || stateData?.current_state || ''

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="space-y-2 flex-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            <span className="font-mono text-primary font-semibold">{ideaId}</span>
            <Separator orientation="vertical" className="h-3" />
            <Badge variant="outline" className="capitalize text-[11px]">
              {idea?.phase || stateData?.phase || ''}
            </Badge>
            <Separator orientation="vertical" className="h-3" />
            <span className="font-medium text-foreground capitalize">{currentState.replace(/_/g, ' ')}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground leading-snug">
            {idea?.title || ideaId}
          </h1>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={handleScore} disabled={scoring} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${scoring ? 'animate-spin' : ''}`} />
            Re-Score Idea
          </Button>
          <Button size="sm" onClick={() => handleAdvance()} disabled={advancing} className="gap-2">
            {advancing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Advance Workflow
          </Button>
        </div>
      </div>

      {/* Score Banner */}
      {composite > 0 && (
        <Card className="overflow-hidden border-primary/20 bg-gradient-to-r from-primary/5 via-background to-background">
          <CardContent className="flex flex-wrap items-center gap-4 py-5 px-6">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${
                composite >= 70 ? 'bg-emerald-100 dark:bg-emerald-900/40' : composite >= 50 ? 'bg-amber-100 dark:bg-amber-900/40' : 'bg-orange-100 dark:bg-orange-900/40'
              }`}>
                <TrendingUp className={`w-6 h-6 ${
                  composite >= 70 ? 'text-emerald-600 dark:text-emerald-400' : composite >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-orange-600 dark:text-orange-400'
                }`} />
              </div>
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-4xl font-bold tracking-tight">{composite}</span>
                  <span className="text-sm text-muted-foreground font-medium">/ 100</span>
                </div>
                <span className="text-xs text-muted-foreground">Composite Score</span>
              </div>
            </div>
            {strengthRating && (
              <Badge variant={STRENGTH_VARIANTS[strengthRating] || 'outline'} className="text-xs px-3 py-1">
                {strengthRating}
              </Badge>
            )}
            {latestScores.summary && (
              <span className="text-xs text-muted-foreground border-l pl-3 truncate max-w-xl flex-1 min-w-[200px]">
                {latestScores.summary}
              </span>
            )}
          </CardContent>
        </Card>
      )}

      {/* Main Tabs Navigation */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full justify-start border-b rounded-none h-auto bg-transparent p-0 gap-4 overflow-x-auto flex-nowrap">
          <TabsTrigger
            value="overview"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-1 py-2.5 gap-2 text-sm font-medium transition-all"
          >
            <BarChart3 className="w-4 h-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger
            value="workflow"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-1 py-2.5 gap-2 text-sm font-medium transition-all"
          >
            <Layers className="w-4 h-4" />
            Workflow
          </TabsTrigger>
          <TabsTrigger
            value="history"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-1 py-2.5 gap-2 text-sm font-medium transition-all"
          >
            <MessageSquare className="w-4 h-4" />
            Agent Timeline
          </TabsTrigger>
          <TabsTrigger
            value="filesystem"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-1 py-2.5 gap-2 text-sm font-medium transition-all"
          >
            <Folder className="w-4 h-4" />
            Filesystem
            {files.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1 text-[10px]">
                {files.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="research"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-1 py-2.5 gap-2 text-sm font-medium transition-all"
          >
            <BookOpen className="w-4 h-4" />
            Research Data
          </TabsTrigger>
        </TabsList>

        {/* ── Overview Tab ── */}
        <TabsContent value="overview" className="space-y-6 pt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-5">
              {/* Problem Statement */}
              <Card>
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Target className="w-4 h-4 text-primary" />
                    Problem Statement
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-1">
                  <p className="text-sm text-foreground leading-relaxed">
                    {idea?.problem_statement || idea?.signal_text || 'No problem statement defined yet.'}
                  </p>
                </CardContent>
              </Card>

              {/* Solution Concept */}
              {idea?.solution_concept && (
                <Card>
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Lightbulb className="w-4 h-4 text-primary" />
                      Solution Concept
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-1">
                    <p className="text-sm text-foreground leading-relaxed">{idea.solution_concept}</p>
                  </CardContent>
                </Card>
              )}

              {/* Score Radar */}
              <ScoreRadar breakdown={breakdown} size={280} />

              {/* Source Evidence */}
              {idea?.source_evidence && idea.source_evidence.length > 0 && (
                <Card>
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <FileText className="w-4 h-4 text-primary" />
                      Source Evidence & References
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-1">
                    <ScrollArea className="max-h-48 pr-2">
                      <ul className="space-y-2">
                        {idea.source_evidence.map((ev: string, i: number) => (
                          <li key={i} className="text-xs text-foreground flex items-start gap-2 border-b last:border-0 pb-1.5">
                            <FileText className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                            {ev}
                          </li>
                        ))}
                      </ul>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Right Column */}
            <div className="space-y-5">
              <SiemensGateStatus
                gates={[
                  { name: 'Prior Art Review', status: composite >= 50 ? 'pass' : 'pending', detail: `${composite}/100` },
                  { name: 'Business Value', status: composite >= 40 ? 'pass' : 'pending', detail: `${composite >= 40 ? '✓' : '—'}` },
                  { name: 'Siemens Alignment', status: composite >= 60 ? 'pass' : 'pending', detail: composite >= 60 ? 'Aligned' : 'Not checked' },
                  { name: 'Composite ≥ 70', status: composite >= 70 ? 'pass' : currentState !== 'raw_signal_collected' ? 'fail' : 'pending', detail: `${composite}/70` },
                ]}
              />

              <Card>
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm font-semibold">Idea Metadata</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-1">
                  <dl className="space-y-2 text-xs">
                    <div className="flex justify-between border-b pb-1">
                      <dt className="text-muted-foreground">Created</dt>
                      <dd className="font-mono">{idea?.created_at ? new Date(idea.created_at).toLocaleDateString() : '—'}</dd>
                    </div>
                    <div className="flex justify-between border-b pb-1">
                      <dt className="text-muted-foreground">Updated</dt>
                      <dd className="font-mono">{idea?.updated_at ? new Date(idea.updated_at).toLocaleDateString() : '—'}</dd>
                    </div>
                    <div className="flex justify-between border-b pb-1">
                      <dt className="text-muted-foreground">Filesystem Files</dt>
                      <dd className="font-semibold">{files.length} artifacts</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Current State</dt>
                      <dd className="font-medium capitalize">{currentState.replace(/_/g, ' ')}</dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ── 20 States Workflow Tab ── */}
        <TabsContent value="workflow" className="pt-4">
          <WorkflowTimeline
            currentState={currentState}
            history={stateData?.history || []}
          />
        </TabsContent>

        {/* ── Timeline Activity & Agent Conversations Tab ── */}
        <TabsContent value="history" className="pt-4">
          <IdeaHistoryTimeline detail={detail} files={files} />
        </TabsContent>

        {/* ── Filesystem Explorer Tab ── */}
        <TabsContent value="filesystem" className="pt-4">
          <IdeaFilesystem files={files} ideaId={ideaId || ''} />
        </TabsContent>

        {/* ── Research Data Tab ── */}
        <TabsContent value="research" className="space-y-4 pt-4">
          <p className="text-xs text-muted-foreground">
            Structured AI agent findings gathered throughout the innovation lifecycle.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ResearchSection title="Discovery" icon={Search} data={idea?.discovery_data} />
            <ResearchSection title="Clarification" icon={Lightbulb} data={idea?.clarification_data} />
            <ResearchSection title="Novelty Hypothesis" icon={Shield} data={idea?.novelty_hypothesis} />
            <ResearchSection title="Prior Art Review" icon={BookOpen} data={idea?.prior_art_review} />
            <ResearchSection title="Detectability Review" icon={Search} data={idea?.detectability_review} />
            <ResearchSection title="Business Value" icon={Zap} data={idea?.business_value} />
            <ResearchSection title="Siemens Alignment" icon={Globe} data={idea?.siemens_alignment} />
            <ResearchSection title="Ideascope Draft" icon={FileText} data={idea?.ideascope_draft} />
            <ResearchSection title="Filing Check" icon={ClipboardCheck} data={idea?.filing_check} />
            <ResearchSection title="Manager Review" icon={Users} data={idea?.manager_review} />
            <ResearchSection title="IP Review" icon={Scale} data={idea?.ip_review} />
            <ResearchSection title="IP Counsel Validation" icon={Shield} data={idea?.ip_counsel_validation} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
