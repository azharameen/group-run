import { useCallback, useEffect, useState } from 'react'
import { Search, Lightbulb } from 'lucide-react'
import {
  fetchIdeas,
  connectSSE,
  type IdeaListItem,
} from '../api/client'
import IdeaCard from '../components/IdeaCard'

import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

export default function Dashboard() {
  const [ideas, setIdeas] = useState<IdeaListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [phaseFilter, setPhaseFilter] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const loadData = useCallback(async () => {
    try {
      const ideasData = await fetchIdeas()
      setIdeas(ideasData)
    } catch (err) {
      console.error('Failed to load ideas:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()

    const es = connectSSE((event) => {
      if (['idea.created', 'idea.transition', 'idea.scored'].includes(event)) {
        loadData()
      }
    })

    return () => es.close()
  }, [loadData])

  // Derive available phases from actual ideas
  const phases = Array.from(new Set(ideas.map((i) => i.phase).filter(Boolean)))

  const filteredIdeas = ideas.filter((idea) => {
    if (phaseFilter && idea.phase !== phaseFilter) return false
    if (searchQuery && !idea.title.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  if (loading) {
    return (
      <div className="h-full overflow-y-auto p-6 md:p-8 pt-6 max-w-7xl w-full mx-auto space-y-6">
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-6 md:p-8 pt-6 max-w-7xl w-full mx-auto space-y-6">
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
            {phases.map((phase) => (
              <Badge
                key={phase}
                variant={phaseFilter === phase ? "default" : "outline"}
                className="cursor-pointer transition-colors capitalize"
                onClick={() => setPhaseFilter(phaseFilter === phase ? null : phase)}
              >
                {phase}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      {/* Ideas Grid */}
      {filteredIdeas.length === 0 ? (
        <Card className="p-12 text-center">
          <Lightbulb className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <p className="font-semibold text-lg">No ideas found</p>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            {phaseFilter ? `No ideas in phase "${phaseFilter}".` : 'Get started by chatting with the AI companion.'}
          </p>
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
