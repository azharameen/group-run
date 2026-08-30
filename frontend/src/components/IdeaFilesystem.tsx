import { useState, useMemo } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { MarkdownViewer } from '@/components/MarkdownViewer'
import type { IdeaFile } from '@/api/client'
import { File, Folder, Search, FileText, Code, Clock, Copy, Check } from 'lucide-react'

interface Props {
  files: IdeaFile[]
  ideaId: string
}

export function IdeaFilesystem({ files, ideaId }: Props) {
  const [selectedFilePath, setSelectedFilePath] = useState<string>(
    files.find((f) => f.path === 'idea.yaml')?.path || files[0]?.path || ''
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [copied, setCopied] = useState(false)

  const selectedFile = files.find((f) => f.path === selectedFilePath) || files[0]

  const filteredFiles = useMemo(() => {
    return files.filter((f) =>
      f.path.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [files, searchQuery])

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  return (
    <Card className="w-full overflow-hidden">
      <CardHeader className="p-4 pb-3 border-b bg-muted/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Folder className="w-4 h-4 text-primary" />
              Idea Filesystem Explorer
              <Badge variant="outline" className="font-mono text-xs font-normal">
                workspace/ideas/{ideaId}/
              </Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Complete filesystem inspection of all YAML metadata, handover packets, and revision logs
            </p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search file path..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs bg-background"
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="grid grid-cols-1 md:grid-cols-12 min-h-[500px]">
          {/* File Tree / List Sidebar */}
          <div className="md:col-span-4 border-r bg-muted/10 p-3 space-y-2">
            <div className="flex items-center justify-between px-2 pb-1 border-b">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Files ({filteredFiles.length})
              </span>
            </div>

            <ScrollArea className="h-[480px]">
              <div className="space-y-1">
                {filteredFiles.map((file) => {
                  const isSelected = file.path === selectedFilePath
                  const isMarkdown = file.ext === '.md'
                  const isYaml = file.ext === '.yaml' || file.ext === '.yml'

                  return (
                    <button
                      key={file.path}
                      onClick={() => setSelectedFilePath(file.path)}
                      className={`w-full flex items-center justify-between p-2 rounded-md text-left transition-colors text-xs ${
                        isSelected
                          ? 'bg-primary text-primary-foreground font-medium shadow-2xs'
                          : 'hover:bg-muted text-foreground'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isMarkdown ? (
                          <FileText className={`w-4 h-4 shrink-0 ${isSelected ? 'text-primary-foreground' : 'text-blue-500'}`} />
                        ) : isYaml ? (
                          <Code className={`w-4 h-4 shrink-0 ${isSelected ? 'text-primary-foreground' : 'text-emerald-500'}`} />
                        ) : (
                          <File className={`w-4 h-4 shrink-0 ${isSelected ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
                        )}
                        <span className="truncate font-mono text-[11px]">{file.path}</span>
                      </div>

                      <span className={`text-[10px] font-mono shrink-0 ml-2 ${isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                        {formatBytes(file.size_bytes)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </ScrollArea>
          </div>

          {/* Main Viewer Pane */}
          <div className="md:col-span-8 p-4 flex flex-col justify-between">
            {selectedFile ? (
              <div className="space-y-4">
                {/* File Header Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-muted/30 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <File className="w-4 h-4 text-primary" />
                    <span className="font-mono text-xs font-semibold text-foreground">
                      {selectedFile.path}
                    </span>
                    <Badge variant="secondary" className="text-[10px] uppercase font-mono">
                      {selectedFile.ext.replace('.', '') || 'file'}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1 font-mono">
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(selectedFile.modified_at).toLocaleString()}
                    </span>
                    <span>{formatBytes(selectedFile.size_bytes)}</span>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopy(selectedFile.content)}
                          className="h-7 w-7 p-0"
                        >
                          {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="text-xs">
                        {copied ? "Copied!" : "Copy file contents"}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>

                {/* Content Renderer */}
                {selectedFile.ext === '.md' ? (
                  <MarkdownViewer
                    content={selectedFile.content}
                    filename={selectedFile.filename}
                    defaultMode="preview"
                  />
                ) : (
                  <ScrollArea className="max-h-[440px] border rounded-lg p-4 bg-muted/40 font-mono text-xs text-foreground">
                    <pre className="whitespace-pre-wrap">{selectedFile.content}</pre>
                  </ScrollArea>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
                Select a file from the sidebar to inspect its content.
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
