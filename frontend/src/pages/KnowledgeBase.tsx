import { useEffect, useState, useCallback } from 'react'
import { Database, FileText, FolderOpen, Upload, ChevronDown, ChevronRight, File, Loader2, BookOpen } from 'lucide-react'
import { fetchIdeas, fetchKnowledgeBase, type IdeaListItem, type KBDocument, type KnowledgeBaseData, connectSSE } from '../api/client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type SourceCategory = {
  name: string
  type: string
  status: 'Connected' | 'Available' | 'Stub'
  icon: string
  docs: KBDocument[]
}

export default function KnowledgeBase() {
  const [ideas, setIdeas] = useState<IdeaListItem[]>([])
  const [kbData, setKbData] = useState<KnowledgeBaseData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedDoc, setExpandedDoc] = useState<KBDocument | null>(null)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['knowledge']))
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set())

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [ideasRes, kbRes] = await Promise.all([
        fetchIdeas(),
        fetchKnowledgeBase().catch(() => null),
      ])
      setIdeas(ideasRes)
      setKbData(kbRes)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()

    const es = connectSSE(() => {
      loadData()
    })
    return () => es.close()
  }, [loadData])

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  const toggleDocExpand = (path: string) => {
    setExpandedDocs(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  const sources: SourceCategory[] = [
    {
      name: 'Google Patents', type: 'Patent', status: 'Connected', icon: '🔍',
      docs: [],
    },
    {
      name: 'Espacenet (EPO)', type: 'Patent', status: 'Connected', icon: '🌐',
      docs: [],
    },
    {
      name: 'USPTO', type: 'Patent', status: 'Connected', icon: '🇺🇸',
      docs: [],
    },
    {
      name: 'WIPO PATENTSCOPE', type: 'Patent', status: 'Connected', icon: '🌍',
      docs: [],
    },
    {
      name: 'DPMA (German)', type: 'Patent', status: 'Connected', icon: '🇩🇪',
      docs: [],
    },
    {
      name: 'Knowledge Base (Local)', type: 'Research', status: 'Available', icon: '📄',
      docs: (kbData?.documents ?? []).filter(d => d.source === 'raw'),
    },
    {
      name: 'Processed Knowledge', type: 'Research', status: 'Available', icon: '🎓',
      docs: (kbData?.documents ?? []).filter(d => d.source === 'processed'),
    },
    {
      name: 'GitHub Code Search', type: 'Code', status: 'Available', icon: '💻',
      docs: [],
    },
    {
      name: 'Wikipedia', type: 'Reference', status: 'Available', icon: '📚',
      docs: [],
    },
    {
      name: 'Hugging Face Models', type: 'AI/ML', status: 'Available', icon: '🤗',
      docs: [],
    },
    {
      name: 'Siemens Portfolio (Internal)', type: 'Internal', status: 'Stub', icon: '🏢',
      docs: [],
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Knowledge Base</h1>
        <p className="text-sm text-muted-foreground mt-1">Multi-modal knowledge repositories and patent sources powering signal extraction</p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Database className="w-4 h-4 text-primary" />
              <span className="text-xs font-medium">Source Documents</span>
            </div>
            <p className="text-3xl font-bold tracking-tight">{kbData ? kbData.sources.raw + kbData.sources.processed : 0}</p>
            <p className="text-xs text-muted-foreground mt-1">{kbData?.documents.length ?? 0} total documents</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <FileText className="w-4 h-4 text-primary" />
              <span className="text-xs font-medium">Repository Categories</span>
            </div>
            <p className="text-3xl font-bold tracking-tight">
              {kbData ? Object.keys(kbData.sources).length : 0}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Ingested document categories</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <FolderOpen className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-medium">Ideas Discovered</span>
            </div>
            <p className="text-3xl font-bold tracking-tight">{ideas.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Extracted signal concepts</p>
          </CardContent>
        </Card>
      </div>

      {/* Upload Drop Zone */}
      <Card className="border-2 border-dashed bg-muted/20 hover:border-primary/50 transition-colors">
        <CardContent className="p-8 text-center space-y-2">
          <Upload className="w-10 h-10 text-muted-foreground mx-auto" />
          <h3 className="font-semibold text-base">Upload Custom Knowledge Documents</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Place PDFs, Markdown, or text files in <code className="text-xs bg-muted px-1.5 py-0.5 rounded border font-mono">knowledge-base/raw/</code>
          </p>
          <p className="text-xs text-muted-foreground">
            The autonomous Knowledge Curator agent automatically extracts technical signals from newly added files.
          </p>
        </CardContent>
      </Card>

      {/* Knowledge Base Documents (local) */}
      {kbData && kbData.documents.length > 0 && (
        <Card className="overflow-hidden">
          <button
            onClick={() => toggleCategory('knowledge')}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/40 transition-colors"
          >
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold">Local Knowledge Documents</h3>
              <Badge variant="secondary" className="text-xs">{kbData.documents.length}</Badge>
            </div>
            {expandedCategories.has('knowledge') ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          </button>
          {expandedCategories.has('knowledge') && <Separator />}
          {expandedCategories.has('knowledge') && (
            <div className="divide-y">
              {kbData.documents.map((doc, i) => (
                <div key={i}>
                  <button
                    onClick={() => toggleDocExpand(doc.path)}
                    className="w-full flex items-center justify-between p-3.5 px-4 text-left hover:bg-muted/20 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <File className="w-4 h-4 shrink-0 text-muted-foreground" />
                      <span className="text-xs font-mono text-foreground truncate">{doc.path}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">{doc.source}</Badge>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={(e) => {
                          e.stopPropagation()
                          setExpandedDoc(doc)
                        }}
                      >
                        View Content
                      </Button>
                      {expandedDocs.has(doc.path) ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                    </div>
                  </button>
                  {expandedDocs.has(doc.path) && (
                    <div className="px-4 pb-3 pt-1 pl-10">
                      <pre className="text-xs text-muted-foreground bg-muted p-3 rounded-md overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap font-mono">
                        {typeof doc.content === 'string' ? doc.content : JSON.stringify(doc.content, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* External Patent Sources */}
      <Card className="overflow-hidden">
        <CardHeader className="p-4 border-b bg-muted/20">
          <CardTitle className="text-sm font-semibold">External Patent & Knowledge Corpora</CardTitle>
        </CardHeader>
        <ScrollArea className="max-h-[500px]">
          <div className="divide-y">
            {sources.map((source, i) => (
              <div key={i} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xl shrink-0">{source.icon}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{source.name}</p>
                    <p className="text-xs text-muted-foreground">{source.type}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {source.docs.length > 0 && (
                    <span className="text-xs text-muted-foreground">{source.docs.length} doc(s)</span>
                  )}
                  <Badge variant={source.status === 'Connected' ? 'default' : source.status === 'Available' ? 'secondary' : 'outline'}>
                    {source.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </Card>

      {/* Document Viewer Dialog */}
      <Dialog open={!!expandedDoc} onOpenChange={(open) => !open && setExpandedDoc(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-mono text-sm">
              <File className="w-4 h-4 text-primary" />
              {expandedDoc?.path ?? ''}
            </DialogTitle>
            <DialogDescription>
              Source: {expandedDoc?.source} &middot; {expandedDoc?.filename}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <pre className="text-xs text-foreground bg-muted p-4 rounded-md overflow-x-auto whitespace-pre-wrap font-mono">
              {expandedDoc
                ? typeof expandedDoc.content === 'string'
                  ? expandedDoc.content
                  : JSON.stringify(expandedDoc.content, null, 2)
                : ''}
            </pre>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  )
}
