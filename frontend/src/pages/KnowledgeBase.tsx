import { useEffect, useState, useCallback } from 'react'
import { Database, FileText, FolderOpen, Upload, ChevronDown, ChevronRight, File, Loader2, BookOpen } from 'lucide-react'
import { fetchIdeas, fetchKnowledgeBase, type IdeaListItem, type KBDocument, type KnowledgeBaseData, connectSSE } from '../api/client'
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
        <h1 className="text-xl font-bold text-foreground">Knowledge Base</h1>
        <p className="text-sm text-muted-foreground mt-1">Knowledge sources feeding idea generation</p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card rounded-lg border p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Database className="w-4 h-4" />
            <span className="text-xs font-medium">Source Count</span>
          </div>
          <p className="text-2xl font-bold text-card-foreground">{kbData ? kbData.sources.raw + kbData.sources.processed : 0}</p>
          <p className="text-xs text-muted-foreground mt-1">{kbData?.documents.length ?? 0} total documents</p>
        </div>
        <div className="bg-card rounded-lg border p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <FileText className="w-4 h-4" />
            <span className="text-xs font-medium">Categories</span>
          </div>
          <p className="text-2xl font-bold text-card-foreground">
            {kbData ? Object.keys(kbData.sources).length : 0}
          </p>
          <p className="text-xs text-muted-foreground mt-1">KB document categories</p>
        </div>
        <div className="bg-card rounded-lg border p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <FolderOpen className="w-4 h-4" />
            <span className="text-xs font-medium">Ideas Generated</span>
          </div>
          <p className="text-2xl font-bold text-card-foreground">{ideas.length}</p>
          <p className="text-xs text-muted-foreground mt-1">From knowledge base signals</p>
        </div>
      </div>

      {/* Upload Area */}
      <div className="bg-card rounded-lg border-2 border-dashed p-8 text-center hover:border-primary/40 transition-colors">
        <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <h3 className="font-medium text-card-foreground mb-1">Upload Knowledge Documents</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Drop PDFs, Markdown, or text files into <code className="text-xs bg-muted px-1 py-0.5 rounded">knowledge-base/raw/</code>
        </p>
        <p className="text-xs text-muted-foreground">
          The Knowledge Curator agent will automatically ingest and extract signals from new documents
        </p>
      </div>

      {/* Knowledge Base Documents (local) */}
      {kbData && kbData.documents.length > 0 && (
        <div className="bg-card rounded-lg border overflow-hidden">
          <button
            onClick={() => toggleCategory('knowledge')}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/50 transition-colors"
          >
            <h3 className="text-sm font-semibold text-card-foreground flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              Local Knowledge Documents
              <Badge variant="secondary" className="ml-2 text-xs">{kbData.documents.length}</Badge>
            </h3>
            {expandedCategories.has('knowledge') ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          </button>
          {expandedCategories.has('knowledge') && (
            <Separator />
          )}
          {expandedCategories.has('knowledge') && (
            <div className="divide-y">
              {kbData.documents.map((doc, i) => (
                <div key={i}>
                  <button
                    onClick={() => toggleDocExpand(doc.path)}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <File className="w-4 h-4 shrink-0 text-muted-foreground" />
                      <span className="text-sm text-card-foreground truncate">{doc.path}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">{doc.source}</Badge>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={(e) => {
                          e.stopPropagation()
                          setExpandedDoc(doc)
                        }}
                      >
                        View
                      </Button>
                      {expandedDocs.has(doc.path) ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                    </div>
                  </button>
                  {expandedDocs.has(doc.path) && (
                    <div className="px-4 pb-3 pt-1 pl-10">
                      <pre className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-md overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap font-mono">
                        {typeof doc.content === 'string' ? doc.content : JSON.stringify(doc.content, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* External Sources */}
      <div className="bg-card rounded-lg border overflow-hidden">
        <div className="px-4 py-3 border-b">
          <h3 className="text-sm font-semibold text-card-foreground">Patent & Knowledge Sources</h3>
        </div>
        <ScrollArea className="max-h-[600px]">
          <div className="divide-y">
            {sources.map((source, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-lg shrink-0">{source.icon}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-card-foreground">{source.name}</p>
                    <p className="text-xs text-muted-foreground">{source.type}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {source.docs.length > 0 && (
                    <span className="text-xs text-muted-foreground">{source.docs.length} doc(s)</span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    source.status === 'Connected' ? 'bg-green-100 text-green-700' :
                    source.status === 'Available' ? 'bg-blue-100 text-blue-700' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {source.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Document Viewer Dialog */}
      <Dialog open={!!expandedDoc} onOpenChange={(open) => !open && setExpandedDoc(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <File className="w-4 h-4" />
              {expandedDoc?.path ?? ''}
            </DialogTitle>
            <DialogDescription>
              Source: {expandedDoc?.source} &middot; {expandedDoc?.filename}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <pre className="text-xs text-card-foreground bg-muted/30 p-4 rounded-md overflow-x-auto whitespace-pre-wrap font-mono">
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
