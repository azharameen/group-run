import { useCallback, useEffect, useState } from 'react'
import { Search, Lightbulb, Plus, Trash2, Check, X } from 'lucide-react'
import {
  fetchIdeas,
  connectSSE,
  createIdea,
  updateIdea,
  deleteIdea,
  type IdeaListItem,
} from '../api/client'
import IdeaCard from '../components/IdeaCard'

import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/use-toast'

export default function Dashboard() {
  const [ideas, setIdeas] = useState<IdeaListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIdeas, setSelectedIdeas] = useState<Set<string>>(new Set())
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [ideaToDelete, setIdeaToDelete] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [newSignalText, setNewSignalText] = useState('')
  const { toast } = useToast()

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
      if (['idea.created', 'idea.updated', 'idea.deleted'].includes(event)) {
        loadData()
      }
    })

    return () => es.close()
  }, [loadData])

  const handleCreate = async () => {
    if (!newTitle.trim()) return
    try {
      const result = await createIdea(newSignalText.trim() || 'Autonomous discovery', newTitle.trim())
      toast({
        title: 'Idea Created',
        description: `Created ${result.idea_id}`,
      })
      setIsCreateOpen(false)
      setNewTitle('')
      setNewSignalText('')
      await loadData()
      window.location.href = `/ideas/${result.idea_id}`
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to create idea',
        variant: 'destructive',
      })
    }
  }

  const handleDelete = async () => {
    if (!ideaToDelete) return
    try {
      await deleteIdea(ideaToDelete)
      toast({
        title: 'Idea Deleted',
        description: `Deleted ${ideaToDelete}`,
      })
      setSelectedIdeas(prev => {
        const next = new Set(prev)
        next.delete(ideaToDelete)
        return next
      })
      await loadData()
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to delete idea',
        variant: 'destructive',
      })
    }
    setIsDeleteOpen(false)
    setIdeaToDelete(null)
  }

  const handleBulkDelete = async () => {
    const ideasToDelete = Array.from(selectedIdeas)
    if (ideasToDelete.length === 0) return

    for (const ideaId of ideasToDelete) {
      try {
        await deleteIdea(ideaId)
      } catch (err: any) {
        console.error(`Failed to delete ${ideaId}:`, err)
      }
    }

    toast({
      title: 'Bulk Delete Complete',
      description: `Deleted ${ideasToDelete.length} ideas`,
    })
    setSelectedIdeas(new Set())
    await loadData()
  }

  const toggleIdeaSelection = (ideaId: string) => {
    setSelectedIdeas(prev => {
      const next = new Set(prev)
      if (next.has(ideaId)) {
        next.delete(ideaId)
      } else {
        next.add(ideaId)
      }
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIdeas.size === filteredIdeas.length) {
      setSelectedIdeas(new Set())
    } else {
      setSelectedIdeas(new Set(filteredIdeas.map(i => i.idea_id)))
    }
  }

  const filteredIdeas = ideas.filter((idea) => {
    if (searchQuery && !idea.title.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  if (loading) {
    return (
      <div className="p-6 md:p-8 pt-6 max-w-7xl w-full mx-auto space-y-6 flex-1">
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8 pt-6 max-w-7xl w-full mx-auto space-y-6 flex-1">
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
          {selectedIdeas.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{selectedIdeas.size} selected</span>
              <Button variant="destructive" size="sm" onClick={handleBulkDelete} className="gap-2">
                <Trash2 className="w-4 h-4" />
                Delete Selected
              </Button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            New Idea
          </Button>
        </div>
      </div>

      {/* Ideas Grid */}
      {filteredIdeas.length === 0 ? (
        <Card className="p-12 text-center">
          <Lightbulb className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <p className="font-semibold text-lg">No ideas found</p>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            {ideas.length === 0 ? 'Get started by creating your first idea.' : 'No ideas match your search.'}
          </p>
          {ideas.length === 0 && (
            <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Create First Idea
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredIdeas.map((idea) => (
            <IdeaCard
              key={idea.idea_id}
              idea={idea}
              isSelected={selectedIdeas.has(idea.idea_id)}
              onSelect={toggleIdeaSelection}
              onDelete={(id) => {
                setIdeaToDelete(id)
                setIsDeleteOpen(true)
              }}
            />
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Idea</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Title *</label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Enter idea title"
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Signal Text (optional)</label>
              <Textarea
                value={newSignalText}
                onChange={(e) => setNewSignalText(e.target.value)}
                placeholder="Describe the problem or opportunity..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!newTitle.trim()}>Create Idea</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete AlertDialog */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this idea?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this idea and all associated files. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete Idea
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
