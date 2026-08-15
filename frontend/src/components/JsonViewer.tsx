import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface JsonViewerProps {
  data: unknown
  defaultExpanded?: boolean
}

function JsonNode({ value, depth = 0 }: { value: unknown; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 2)

  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">null</span>
  }

  if (typeof value === 'string') {
    return <span className="text-emerald-600 dark:text-emerald-400">"{value}"</span>
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return <span className="text-blue-600 dark:text-blue-400">{String(value)}</span>
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-muted-foreground">[]</span>
    }

    return (
      <span>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? <ChevronDown className="w-3 h-3 inline" /> : <ChevronRight className="w-3 h-3 inline" />}
        </button>{' '}
        [
        {expanded && (
          <>
            <br />
            {value.map((item, i) => (
              <div key={i} style={{ paddingLeft: `${(depth + 1) * 16}px` }} className="inline-block">
                <JsonNode value={item} depth={depth + 1} />
                {i < value.length - 1 && <span>,</span>}
                <br />
              </div>
            ))}
            <br />
            <span style={{ paddingLeft: `${depth * 16}px` }} />
          </>
        )}
        ]
      </span>
    )
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value)
    if (entries.length === 0) {
      return <span className="text-muted-foreground">{}</span>
    }

    return (
      <span>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? <ChevronDown className="w-3 h-3 inline" /> : <ChevronRight className="w-3 h-3 inline" />}
        </button>{' '}
        {'{'}
        {expanded && (
          <>
            <br />
            {entries.map(([k, v], i) => (
              <div key={k} style={{ paddingLeft: `${(depth + 1) * 16}px` }} className="inline-block">
                <span className="text-purple-600 dark:text-purple-400 font-medium">{k}</span>
                <span className="text-muted-foreground">: </span>
                <JsonNode value={v} depth={depth + 1} />
                {i < entries.length - 1 && <span>,</span>}
                <br />
              </div>
            ))}
            <br />
            <span style={{ paddingLeft: `${depth * 16}px` }} />
          </>
        )}
        {'}'}
      </span>
    )
  }

  return <span>{String(value)}</span>
}

export function JsonViewer({ data }: JsonViewerProps) {
  const parsed = typeof data === 'string' ? data : null

  if (!parsed) {
    return <JsonNode value={data} />
  }

  try {
    const json = JSON.parse(parsed)
    return <JsonNode value={json} />
  } catch {
    return <span className="text-foreground">{parsed}</span>
  }
}
