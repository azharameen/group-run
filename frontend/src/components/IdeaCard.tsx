import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { IdeaListItem } from '../api/client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { ArrowRight, Check, X, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { updateIdea } from '../api/client'
import { useToast } from '@/hooks/use-toast'

export default function IdeaCard({
  idea,
  isSelected = false,
  onSelect,
  onDelete,
}: {
  idea: IdeaListItem
  isSelected?: boolean
  onSelect?: (id: string) => void
  onDelete?: (id: string) => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(idea.title)
  const { toast } = useToast()

  const handleSave = async () => {
    if (!editTitle.trim()) return
    try {
      await updateIdea(idea.idea_id, 'title', editTitle.trim())
      toast({
        title: 'Title Updated',
        description: 'Idea title has been updated',
      })
      setIsEditing(false)
      window.location.reload()
    } catch (err: unknown) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to update title',
        variant: 'destructive',
      })
      setEditTitle(idea.title)
      setIsEditing(false)
    }
  }

  const handleCancel = () => {
    setEditTitle(idea.title)
    setIsEditing(false)
  }

  return (
    <Link to={`/ideas/${idea.idea_id}`} className="block group" data-testid={`idea-card-${idea.idea_id}`}>
      <Card className={`h-full transition-all duration-200 hover:shadow-md hover:border-primary/50 ${isSelected ? 'border-primary ring-2 ring-primary/20' : ''}`}>
        <CardHeader className="p-5 pb-3">
          <div className="flex items-start gap-2 min-w-0">
            {onSelect && (
              <div className="pt-1">
                <input
                  type="checkbox"
                  data-testid={`checkbox-${idea.idea_id}`}
                  checked={isSelected}
                  onChange={(e) => {
                    e.stopPropagation()
                    onSelect(idea.idea_id)
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-4 h-4 rounded border-gray-300"
                />
              </div>
            )}
            <div className="flex-1 space-y-1 min-w-0">
              <span className="text-xs font-mono text-muted-foreground">
                {idea.idea_id}
              </span>
              {isEditing ? (
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSave()
                      if (e.key === 'Escape') handleCancel()
                    }}
                    className="h-8 text-base"
                    autoFocus
                  />
                  <Button size="icon" variant="ghost" onClick={handleSave} className="h-8 w-8">
                    <Check className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={handleCancel} className="h-8 w-8">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <CardTitle
                  data-testid={`idea-title-${idea.idea_id}`}
                  className="text-base font-semibold group-hover:text-primary transition-colors line-clamp-2"
                  onDoubleClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setIsEditing(true)
                  }}
                >
                  {idea.title}
                </CardTitle>
              )}
            </div>
            {onDelete && !isEditing && (
              <Button
                size="icon"
                variant="ghost"
                data-testid={`delete-btn-${idea.idea_id}`}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onDelete(idea.idea_id)
                }}
                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              >
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-5 pt-2 space-y-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
            <span>
              {idea.updated_at
                ? new Date(idea.updated_at).toLocaleDateString()
                : "Recent"}
            </span>
            <span className="flex items-center gap-1 font-medium group-hover:translate-x-0.5 transition-transform text-primary">
              View Details
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
