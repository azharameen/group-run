import { useEffect, useState, useCallback } from 'react'
import { Database, FileText, FolderOpen, Loader2 } from 'lucide-react'
import { fetchIdeas, fetchKnowledgeBase, type IdeaListItem, type KBDocument, type KnowledgeBaseData, connectSSE } from '../api/client'
import { Card, CardContent } from '@/components/ui/card'
import { DocumentUploadCard } from '@/components/knowledge-base/DocumentUploadCard'
import { DocumentViewerCard } from '@/components/knowledge-base/DocumentViewerCard'

export default function KnowledgeBase() {
  const [ideas, setIdeas] = useState<IdeaListItem[]>([])
  const [kbData, setKbData] = useState<KnowledgeBaseData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedDoc, setExpandedDoc] = useState<KBDocument | null>(null)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['knowledge']))
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set())
  const [uploading, setUploading] = useState(false)

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
      <div className="h-full overflow-y-auto p-6 md:p-8 pt-6 max-w-7xl w-full mx-auto flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-6 md:p-8 pt-6 max-w-7xl w-full mx-auto space-y-6">
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
              <span className="text-xs font-medium">Repository Sources</span>
            </div>
            <p className="text-3xl font-bold tracking-tight">{kbData ? Object.keys(kbData.sources).length : 0}</p>
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

      <DocumentUploadCard
        uploading={uploading}
        setUploading={setUploading}
        onSuccess={loadData}
      />

      <DocumentViewerCard
        kbData={kbData}
        expandedCategories={expandedCategories}
        toggleCategory={toggleCategory}
        expandedDocs={expandedDocs}
        toggleDocExpand={toggleDocExpand}
        expandedDoc={expandedDoc}
        setExpandedDoc={setExpandedDoc}
      />
    </div>
  )
}