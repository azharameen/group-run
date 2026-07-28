import * as React from "react"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ArrowDown,
  Copy,
  Check,
  Pencil,
  RotateCw,
  ThumbsUp,
  ThumbsDown,
  Wrench,
  Brain,
  ChevronDown,
  ChevronRight,
  Cpu,
  GitBranch,
  ArrowRight,
  Zap,
  CheckCircle2,
} from "lucide-react"

// ── 1. MessageScroller Primitive ──────────────────────────────────────────────
interface MessageScrollerProps extends React.HTMLAttributes<HTMLDivElement> {
  autoScroll?: boolean
}

export const MessageScroller = React.forwardRef<HTMLDivElement, MessageScrollerProps>(
  ({ className, children, autoScroll = true, ...props }, ref) => {
    const scrollRef = React.useRef<HTMLDivElement>(null)
    const bottomRef = React.useRef<HTMLDivElement>(null)
    const [showScrollButton, setShowScrollButton] = React.useState(false)

    const scrollToBottom = () => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }

    const handleScroll = () => {
      if (!scrollRef.current) return
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
      const isUp = scrollHeight - scrollTop - clientHeight > 80
      setShowScrollButton(isUp)
    }

    React.useEffect(() => {
      if (autoScroll && !showScrollButton && bottomRef.current) {
        bottomRef.current.scrollIntoView({ behavior: "smooth" })
      }
    }, [children, autoScroll, showScrollButton])

    return (
      <div className="relative flex-1 h-full overflow-hidden flex flex-col">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className={cn("flex-1 overflow-y-auto pr-2 space-y-3.5", className)}
          {...props}
        >
          {children}
          <div ref={bottomRef} />
        </div>

        {showScrollButton && (
          <Button
            size="icon"
            variant="secondary"
            onClick={scrollToBottom}
            title="Scroll to latest"
            className="absolute bottom-3 right-3 h-8 w-8 shadow-md border rounded-full bg-background/95 backdrop-blur text-foreground hover:bg-muted z-10"
          >
            <ArrowDown className="w-4 h-4 text-primary" />
            <span className="sr-only">Scroll to latest</span>
          </Button>
        )}
      </div>
    )
  }
)
MessageScroller.displayName = "MessageScroller"

// ── 2. Interactive Turn Minimap Strip — vertically centered ───────────────────
interface TurnMinimapProps {
  totalTurns: number
  activeTurnIndex?: number
  onTurnClick: (index: number) => void
  visible?: boolean
}

export const TurnMinimap: React.FC<TurnMinimapProps> = ({
  totalTurns,
  onTurnClick,
  visible = false,
}) => {
  const [hoveredIdx, setHoveredIdx] = React.useState<number | null>(null)

  if (totalTurns <= 0) return null

  return (
    /* Sidebar-extension strip — fixed at the left edge of the right sidebar (right-80).
       Spans full viewport height. Uses bg-sidebar + border-l to look like part of the sidebar.
       Slides in from the right and fades on hover, hides on unhover. */
    <div
      className={cn(
        "fixed right-80 top-1/2 -translate-y-1/2 w-6 z-40",
        "bg-sidebar border-l border-border/60",
        "shadow-[-4px_0_10px_rgba(0,0,0,0.1)]",
        "rounded-l-xl",
        "flex flex-col items-center justify-center gap-[3px] py-3 select-none",
        "transition-all duration-200 ease-out",
        visible
          ? "opacity-100 translate-x-0"
          : "opacity-0 translate-x-2 pointer-events-none"
      )}
      onMouseEnter={() => {}}
      onMouseLeave={() => setHoveredIdx(null)}
    >
      {Array.from({ length: totalTurns }).map((_, i) => {
        let dotClass = "w-1.5 h-1.5 bg-muted-foreground/40"

        if (hoveredIdx !== null) {
          const dist = Math.abs(hoveredIdx - i)
          if (dist === 0)      dotClass = "w-2.5 h-2.5 bg-primary shadow-sm shadow-primary/30"
          else if (dist === 1) dotClass = "w-2 h-2 bg-primary/60"
          else if (dist === 2) dotClass = "w-1.5 h-1.5 bg-primary/30"
        }

        return (
          <button
            key={i}
            onClick={() => onTurnClick(i)}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
            title={`Jump to turn ${i + 1}`}
            className="flex items-center justify-center w-5 h-5 cursor-pointer"
          >
            <div
              className={cn(
                "rounded-full aspect-square shrink-0 transition-all duration-150 ease-out",
                dotClass
              )}
            />
          </button>
        )
      })}
    </div>
  )
}
TurnMinimap.displayName = "TurnMinimap"

// ── 3. Live Execution Trace Stream ───────────────────────────────────────────
export interface TraceStep {
  type: "thinking" | "tool_call" | "tool_result" | "subagent" | "handover"
  agent?: string
  content?: string
  tool?: string
  params?: Record<string, any>
  output?: string
  action?: string
  from_agent?: string
  to_agent?: string
  timestamp?: string
}

interface LiveTraceProps {
  steps: TraceStep[]
  isStreaming?: boolean
}

const traceIcon = (type: TraceStep["type"]) => {
  switch (type) {
    case "thinking":   return <Brain className="w-3 h-3 text-violet-500 shrink-0" />
    case "tool_call":  return <Cpu className="w-3 h-3 text-amber-500 shrink-0" />
    case "tool_result":return <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
    case "subagent":   return <GitBranch className="w-3 h-3 text-blue-500 shrink-0" />
    case "handover":   return <ArrowRight className="w-3 h-3 text-pink-500 shrink-0" />
    default:           return <Zap className="w-3 h-3 text-muted-foreground shrink-0" />
  }
}

const traceBadgeColor = (type: TraceStep["type"]) => {
  switch (type) {
    case "thinking":    return "bg-violet-500/10 text-violet-600 border-violet-500/20"
    case "tool_call":   return "bg-amber-500/10 text-amber-600 border-amber-500/20"
    case "tool_result": return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
    case "subagent":    return "bg-blue-500/10 text-blue-600 border-blue-500/20"
    case "handover":    return "bg-pink-500/10 text-pink-600 border-pink-500/20"
    default:            return "bg-muted text-muted-foreground"
  }
}

const traceLabel = (step: TraceStep): string => {
  switch (step.type) {
    case "thinking":    return step.content || "Thinking..."
    case "tool_call":   return `→ ${step.tool}(${step.params ? JSON.stringify(step.params).slice(0, 40) : ""})`
    case "tool_result": return step.output || "Done"
    case "subagent":    return `Spawned ${step.agent}: ${step.action || ""}`
    case "handover":    return `${step.from_agent} → ${step.to_agent}`
    default:            return ""
  }
}

export const LiveTrace: React.FC<LiveTraceProps> = ({ steps, isStreaming }) => {
  const [isOpen, setIsOpen] = React.useState(true)

  if (!steps || steps.length === 0) return null

  return (
    <div className="mb-2 border rounded-lg bg-muted/20 overflow-hidden text-[11px]">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-2.5 py-1.5 bg-muted/30 text-muted-foreground hover:text-foreground font-semibold text-[10px]"
      >
        <div className="flex items-center gap-1.5">
          <Zap className={cn("w-3 h-3", isStreaming ? "text-primary animate-pulse" : "text-primary")} />
          <span>{isStreaming ? "Agent Thinking..." : `Execution Trace (${steps.length} steps)`}</span>
        </div>
        {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      </button>

      {isOpen && (
        <div className="p-2 space-y-1.5 border-t max-h-56 overflow-y-auto">
          {steps.map((step, idx) => (
            <div key={idx} className="flex items-start gap-1.5 group/step">
              <div className="mt-0.5 shrink-0">{traceIcon(step.type)}</div>
              <div className="flex-1 min-w-0">
                <div className={cn(
                  "inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-mono max-w-full",
                  traceBadgeColor(step.type)
                )}>
                  {step.agent && (
                    <span className="font-sans font-semibold opacity-70 shrink-0">
                      [{step.agent.split("—")[0]?.trim() || step.agent}]
                    </span>
                  )}
                  <span className="truncate">{traceLabel(step)}</span>
                </div>
              </div>
            </div>
          ))}
          {isStreaming && (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground animate-pulse">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
              <span>Processing...</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
LiveTrace.displayName = "LiveTrace"

// ── 4. Thinking Reasoning Primitive (legacy, kept for compat) ─────────────────
interface ThinkingProps {
  tokens: string[]
}

export const Thinking: React.FC<ThinkingProps> = ({ tokens }) => {
  const [isOpen, setIsOpen] = React.useState(true)

  if (!tokens || tokens.length === 0) return null

  return (
    <div className="mb-1.5 border rounded-lg bg-muted/30 overflow-hidden text-[11px]">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-2 py-1 bg-muted/50 text-muted-foreground hover:text-foreground font-semibold text-[10px]"
      >
        <div className="flex items-center gap-1">
          <Brain className="w-3 h-3 text-primary animate-pulse" />
          <span>Thought Process ({tokens.length} steps)</span>
        </div>
        {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      </button>

      {isOpen && (
        <div className="p-2 space-y-1 font-mono text-[10px] text-muted-foreground border-t">
          {tokens.map((token, idx) => (
            <div key={idx} className="leading-tight flex items-start gap-1">
              <span className="text-primary font-bold">›</span>
              <span className="flex-1">{token}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
Thinking.displayName = "Thinking"

// ── 5. Message Wrapper Primitive ──────────────────────────────────────────────
interface MessageProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "user" | "agent"
  avatarText?: string
}

export const Message = React.forwardRef<HTMLDivElement, MessageProps>(
  ({ className, variant = "agent", avatarText, children, ...props }, ref) => {
    const isUser = variant === "user"

    return (
      <div
        ref={ref}
        className={cn("flex gap-2 text-xs group relative", isUser ? "flex-row-reverse" : "flex-row", className)}
        {...props}
      >
        <Avatar className="h-6 w-6 shrink-0 mt-0.5">
          <AvatarFallback
            className={cn(
              "font-bold text-[9px]",
              isUser ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            )}
          >
            {avatarText || (isUser ? "YOU" : "AI")}
          </AvatarFallback>
        </Avatar>
        <div className={cn("space-y-1 max-w-[85%]", isUser ? "text-right" : "text-left")}>
          {children}
        </div>
      </div>
    )
  }
)
Message.displayName = "Message"

// ── 6. Bubble Speech Primitive ────────────────────────────────────────────────
interface BubbleProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "user" | "agent"
  isStreaming?: boolean
}

export const Bubble = React.forwardRef<HTMLDivElement, BubbleProps>(
  ({ className, variant = "agent", isStreaming = false, children, ...props }, ref) => {
    const isUser = variant === "user"

    return (
      <div
        ref={ref}
        className={cn(
          "p-2.5 rounded-lg text-xs leading-relaxed transition-all",
          isUser
            ? "bg-primary text-primary-foreground rounded-tr-none"
            : "bg-muted border text-foreground rounded-tl-none",
          className
        )}
        {...props}
      >
        {children}
        {isStreaming && <span className="inline-block w-1.5 h-3 ml-1 bg-primary animate-ping" />}
      </div>
    )
  }
)
Bubble.displayName = "Bubble"

// ── 7. Clean Marker Metadata Primitive ───────────────────────────────────────
interface MarkerProps extends React.HTMLAttributes<HTMLDivElement> {
  sender: string
  timestamp?: string
}

export const Marker: React.FC<MarkerProps> = ({ sender, timestamp, className }) => {
  return (
    <div className={cn("flex items-center gap-1.5 text-[10px] text-muted-foreground mb-0.5", className)}>
      <span className="font-semibold text-foreground">{sender}</span>
      {timestamp && <span className="ml-auto text-[9px] font-mono text-muted-foreground/70">{timestamp}</span>}
    </div>
  )
}
Marker.displayName = "Marker"

// ── 8. Contextual Message Actions Toolbar ────────────────────────────────────
interface MessageActionsProps {
  text: string
  variant?: "user" | "agent"
  hasTrace?: boolean
  onEdit?: (text: string) => void
  onRegenerate?: () => void
  onToggleTrace?: () => void
}

export const MessageActions: React.FC<MessageActionsProps> = ({
  text,
  variant = "agent",
  hasTrace = false,
  onEdit,
  onRegenerate,
  onToggleTrace,
}) => {
  const [copied, setCopied] = React.useState(false)
  const [liked, setLiked] = React.useState<boolean | null>(null)
  const isUser = variant === "user"

  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className={cn(
        "flex items-center gap-1 mt-1 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={handleCopy}
        title="Copy message"
        className="h-5 w-5 text-muted-foreground hover:text-foreground hover:bg-muted"
      >
        {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
      </Button>

      {isUser && onEdit && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onEdit(text)}
          title="Edit message"
          className="h-5 w-5 text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          <Pencil className="w-3 h-3" />
        </Button>
      )}

      {!isUser && (
        <>
          {onRegenerate && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onRegenerate}
              title="Regenerate reply"
              className="h-5 w-5 text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <RotateCw className="w-3 h-3" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLiked(liked === true ? null : true)}
            title="Good response"
            className={cn("h-5 w-5 hover:bg-muted", liked === true ? "text-emerald-500" : "text-muted-foreground")}
          >
            <ThumbsUp className="w-3 h-3" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLiked(liked === false ? null : false)}
            title="Poor response"
            className={cn("h-5 w-5 hover:bg-muted", liked === false ? "text-rose-500" : "text-muted-foreground")}
          >
            <ThumbsDown className="w-3 h-3" />
          </Button>

          {hasTrace && onToggleTrace && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleTrace}
              title="View Execution Trace"
              className="h-5 w-5 text-muted-foreground hover:text-primary hover:bg-muted"
            >
              <Wrench className="w-3 h-3" />
            </Button>
          )}
        </>
      )}
    </div>
  )
}
MessageActions.displayName = "MessageActions"
