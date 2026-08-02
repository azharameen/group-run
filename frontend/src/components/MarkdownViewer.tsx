import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Code, Eye, Copy, Check } from 'lucide-react'

interface Props {
  content: string
  filename?: string
  className?: string
  defaultMode?: 'preview' | 'code'
}

export function MarkdownViewer({
  content,
  filename,
  className = '',
  defaultMode = 'preview',
}: Props) {
  const [mode, setMode] = useState<'preview' | 'code'>(defaultMode)
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Basic lightweight clean markdown formatter for preview
  const renderPreview = (text: string) => {
    if (!text) return <p className="text-muted-foreground italic">Empty document</p>

    const lines = text.split('\n')
    const elements: React.ReactNode[] = []
    let inCodeBlock = false
    let codeBuffer: string[] = []

    lines.forEach((line, idx) => {
      if (line.startsWith('```')) {
        if (inCodeBlock) {
          elements.push(
            <pre key={`code-${idx}`} className="bg-muted p-3.5 rounded-md font-mono text-xs overflow-x-auto my-3 border text-foreground">
              <code>{codeBuffer.join('\n')}</code>
            </pre>
          )
          codeBuffer = []
          inCodeBlock = false
        } else {
          inCodeBlock = true
        }
        return
      }

      if (inCodeBlock) {
        codeBuffer.push(line)
        return
      }

      // Headers
      if (line.startsWith('# ')) {
        elements.push(<h1 key={idx} className="text-xl font-bold tracking-tight text-foreground border-b pb-1.5 my-3">{line.slice(2)}</h1>)
      } else if (line.startsWith('## ')) {
        elements.push(<h2 key={idx} className="text-lg font-semibold tracking-tight text-foreground border-b pb-1 my-2.5">{line.slice(3)}</h2>)
      } else if (line.startsWith('### ')) {
        elements.push(<h3 key={idx} className="text-base font-semibold text-foreground my-2">{line.slice(4)}</h3>)
      } else if (line.startsWith('> ')) {
        elements.push(<blockquote key={idx} className="border-l-2 border-primary pl-3 my-2 text-xs italic text-muted-foreground">{line.slice(2)}</blockquote>)
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        elements.push(<li key={idx} className="text-xs text-foreground ml-4 list-disc my-0.5">{line.slice(2)}</li>)
      } else if (line.trim() === '---' || line.trim() === '***') {
        elements.push(<hr key={idx} className="my-3 border-border" />)
      } else if (line.trim() === '') {
        elements.push(<div key={idx} className="h-1.5" />)
      } else {
        // Formatted line text with inline code highlights
        elements.push(
          <p key={idx} className="text-xs text-foreground leading-relaxed my-1">
            {line}
          </p>
        )
      }
    })

    return <div className="space-y-1">{elements}</div>
  }

  return (
    <Card className={`overflow-hidden border ${className}`}>
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          {filename && <span className="text-xs font-mono font-medium text-foreground">{filename}</span>}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border bg-background p-0.5">
            <Button
              variant={mode === 'preview' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setMode('preview')}
              className="h-6 px-2.5 text-[11px] gap-1"
            >
              <Eye className="w-3 h-3" />
              Preview
            </Button>
            <Button
              variant={mode === 'code' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setMode('code')}
              className="h-6 px-2.5 text-[11px] gap-1"
            >
              <Code className="w-3 h-3" />
              Code
            </Button>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                className="h-7 w-7 p-0"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left" className="text-xs">
              {copied ? "Copied!" : "Copy content"}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
      <ScrollArea className="max-h-[500px] p-4">
        {mode === 'preview' ? (
          renderPreview(content)
        ) : (
          <pre className="text-xs font-mono text-foreground bg-muted/40 p-3 rounded-md overflow-x-auto whitespace-pre-wrap">
            {content}
          </pre>
        )}
      </ScrollArea>
    </Card>
  )
}
