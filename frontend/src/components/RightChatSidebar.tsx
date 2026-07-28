import * as React from "react"
import { useState, useEffect, useRef, useCallback } from "react"
import { useLocation } from "react-router-dom"
import {
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  MessageScroller,
  Message,
  Bubble,
  Marker,
  MessageActions,
  LiveTrace,
  TurnMinimap,
  type TraceStep,
} from "@/components/ui/chat-primitives"
import { connectSSE, streamChat, type StreamEvent } from "@/api/client"
import {
  MessageSquare,
  Send,
  Plus,
  Mic,
  Square,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Clock,
  Cpu,
  ListTodo,
} from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string
  sender: string
  role?: string
  text: string
  timestamp: string
  isStreaming?: boolean
  /** legacy thinking tokens (from non-streaming messages) */
  thinking?: string[]
  /** live streaming trace steps */
  liveTrace?: TraceStep[]
  isTraceOpen?: boolean
}

interface TaskItem {
  id: string
  title: string
  agent: string
  status: "In Progress" | "To Do" | "Completed"
  thought?: string
}

// ── Component ─────────────────────────────────────────────────────────────────

export function RightChatSidebar({ ...props }: React.ComponentProps<"aside">) {
  const location = useLocation()
  const [input, setInput] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [messageQueue, setMessageQueue] = useState<string[]>([])
  const [showTasks, setShowTasks] = useState(false)
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [taskStats, setTaskStats] = useState({ completed: 0, total: 0 })
  const abortRef = useRef<AbortController | null>(null)
  const messageRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const [isSidebarHovered, setIsSidebarHovered] = useState(false)

  const match = location.pathname.match(/\/ideas\/([^/]+)/)
  const currentIdeaId = match ? match[1] : null

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "m1",
      sender: "Alex — Lead Engineer",
      text: "Welcome! Our agentic team is ready to evaluate your disclosure and generate patent assets.",
      timestamp: "12:00",
      liveTrace: [
        { type: "thinking", content: "Initialized Siemens DeepAgents graph.", agent: "Orchestrator" },
        { type: "handover", from_agent: "Orchestrator", to_agent: "Alex — Lead Engineer" },
      ],
    },
    {
      id: "m2",
      sender: "David — Data Analyst",
      text: "Knowledge base taxonomy synced with Siemens Patent Database.",
      timestamp: "12:01",
      liveTrace: [
        { type: "thinking", content: "Synced 1,420 Siemens patent claims.", agent: "David — Data Analyst" },
        { type: "tool_call", tool: "query_prior_art_taxonomy", agent: "David — Data Analyst" },
        { type: "tool_result", output: "Synced 1,420 Siemens patent claims.", agent: "David — Data Analyst" },
      ],
    },
  ])

  // ── Fetch initial tasks (one-time bootstrap only) ─────────────────────────
  useEffect(() => {
    fetch(`/api/agent-tasks${currentIdeaId ? `?idea_id=${currentIdeaId}` : ""}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.tasks) {
          setTasks(data.tasks)
          setTaskStats({ completed: data.completed, total: data.total })
        }
      })
      .catch((err) => console.error(err))
  }, [currentIdeaId])

  // ── SSE: background agent.progress events + tasks_update ─────────────────
  useEffect(() => {
    const es = connectSSE((event, data) => {
      if (event === "agent.progress" && data) {
        const streamMsg: ChatMessage = {
          id: `sse_${Date.now()}`,
          sender: data.agent_name || "Autonomous Runner",
          text: data.message || "Processing invention step...",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          liveTrace: [
            { type: "thinking", content: data.message, agent: data.agent_name || "Agent" },
          ],
        }
        setMessages((prev) => [...prev, streamMsg])
      }
    })
    return () => es.close()
  }, [])

  // ── Fetch chat history on idea change ────────────────────────────────────
  useEffect(() => {
    if (currentIdeaId) {
      fetch(`/api/ideas/${currentIdeaId}/chat`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.messages?.length > 0) {
            setMessages(data.messages)
          }
        })
        .catch((err) => console.error(err))
    }
  }, [currentIdeaId])

  // ── Toggle trace open/closed per message ─────────────────────────────────
  const toggleTrace = (id: string) => {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === id ? { ...msg, isTraceOpen: !msg.isTraceOpen } : msg
      )
    )
  }

  // ── Stop streaming ────────────────────────────────────────────────────────
  const handleStopGeneration = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setIsGenerating(false)
    setMessages((prev) =>
      prev.map((msg) => (msg.isStreaming ? { ...msg, isStreaming: false } : msg))
    )
  }

  // ── Scroll to turn by index ───────────────────────────────────────────────
  const scrollToTurnIndex = (idx: number) => {
    const el = messageRefs.current[idx]
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" })
  }

  // ── Real streaming send ───────────────────────────────────────────────────
  const executeSend = useCallback(
    async (textToSend: string) => {
      // 1) Append user message
      const userMsg: ChatMessage = {
        id: `u_${Date.now()}`,
        sender: "You",
        text: textToSend,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      }
      setMessages((prev) => [...prev, userMsg])
      setIsGenerating(true)

      // 2) Create a placeholder agent message that we'll update live
      const agentId = `a_${Date.now()}`
      const agentTs = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      setMessages((prev) => [
        ...prev,
        {
          id: agentId,
          sender: "Alex — Lead Engineer",
          text: "",
          timestamp: agentTs,
          isStreaming: true,
          liveTrace: [],
          isTraceOpen: true,
        },
      ])

      // 3) Open AbortController for stop support
      const ctrl = new AbortController()
      abortRef.current = ctrl

      try {
        await streamChat(
          currentIdeaId,
          textToSend,
          (evt: StreamEvent) => {
            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id !== agentId) return msg

                switch (evt.type) {
                  case "thinking":
                    return {
                      ...msg,
                      liveTrace: [
                        ...(msg.liveTrace || []),
                        { type: "thinking", content: evt.content, agent: evt.agent } as TraceStep,
                      ],
                    }

                  case "tool_call":
                    return {
                      ...msg,
                      liveTrace: [
                        ...(msg.liveTrace || []),
                        { type: "tool_call", tool: evt.tool, params: evt.params, agent: evt.agent } as TraceStep,
                      ],
                    }

                  case "tool_result":
                    return {
                      ...msg,
                      liveTrace: [
                        ...(msg.liveTrace || []),
                        { type: "tool_result", tool: evt.tool, output: evt.output, agent: evt.agent } as TraceStep,
                      ],
                    }

                  case "subagent":
                    return {
                      ...msg,
                      liveTrace: [
                        ...(msg.liveTrace || []),
                        { type: "subagent", agent: evt.agent, action: evt.action } as TraceStep,
                      ],
                      // Update sender to the spawned agent
                      sender: evt.agent || msg.sender,
                    }

                  case "handover":
                    return {
                      ...msg,
                      liveTrace: [
                        ...(msg.liveTrace || []),
                        { type: "handover", from_agent: evt.from_agent, to_agent: evt.to_agent } as TraceStep,
                      ],
                      sender: evt.to_agent || msg.sender,
                    }

                  case "token":
                    return { ...msg, text: msg.text + (evt.content || "") }

                  case "tasks_update":
                    // Update task panel from SSE (no polling)
                    if (evt.tasks) {
                      setTasks(evt.tasks as TaskItem[])
                      setTaskStats({ completed: evt.completed || 0, total: evt.total || 0 })
                    }
                    return msg

                  case "done":
                    return { ...msg, isStreaming: false }

                  default:
                    return msg
                }
              })
            )
          },
          ctrl.signal
        )
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          console.error("[Chat Stream Error]", err)
        }
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === agentId ? { ...msg, isStreaming: false } : msg
          )
        )
      } finally {
        setIsGenerating(false)
        abortRef.current = null

        // Process queue
        setMessageQueue((prevQueue) => {
          if (prevQueue.length > 0) {
            const [nextMsg, ...remaining] = prevQueue
            setTimeout(() => executeSend(nextMsg), 200)
            return remaining
          }
          return []
        })
      }
    },
    [currentIdeaId]
  )

  const handleSendOrQueue = () => {
    if (!input.trim()) return
    const textToSend = input.trim()
    setInput("")

    if (isGenerating) {
      setMessageQueue((prev) => [...prev, textToSend])
    } else {
      executeSend(textToSend)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <aside
      className="sticky top-0 h-svh w-80 shrink-0 border-l bg-sidebar text-sidebar-foreground flex flex-col z-20"
      onMouseEnter={() => setIsSidebarHovered(true)}
      onMouseLeave={() => setIsSidebarHovered(false)}
      {...props}
    >
      {/* Header — matches left AppSidebar exactly */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip="Agent Team Chat">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shrink-0">
                <MessageSquare className="size-5" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">Agent Team Chat</span>
                <span className="truncate text-xs text-muted-foreground">
                  {currentIdeaId ? `Idea: ${currentIdeaId}` : "Global Workspace"}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* Agent Plan & Tasks — SSE-driven (tasks updated from stream events) */}
      <div className="px-3 py-1.5 border-b bg-muted/20">
        <button
          onClick={() => setShowTasks(!showTasks)}
          className="w-full flex items-center justify-between text-xs font-semibold text-muted-foreground hover:text-foreground py-1"
        >
          <div className="flex items-center gap-1.5">
            <ListTodo className="w-3.5 h-3.5 text-primary" />
            <span>Agent Plan &amp; Tasks</span>
          </div>
          <div className="flex items-center gap-1">
            <Badge variant="outline" className="text-[10px] px-1 py-0 font-normal">
              {taskStats.completed}/{taskStats.total || tasks.length} Done
            </Badge>
            {showTasks ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </div>
        </button>

        {showTasks && (
          <div className="mt-2 space-y-1.5 pb-1 max-h-48 overflow-y-auto">
            {tasks.map((task) => (
              <div key={task.id} className="p-2 rounded border bg-background text-[11px] space-y-1">
                <div className="flex items-center justify-between font-medium">
                  <span className="text-foreground truncate">{task.title}</span>
                  {task.status === "Completed" ? (
                    <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                  ) : task.status === "In Progress" ? (
                    <Cpu className="w-3 h-3 text-primary animate-pulse shrink-0" />
                  ) : (
                    <Clock className="w-3 h-3 text-muted-foreground shrink-0" />
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground">{task.agent}</div>
                {task.thought && (
                  <div className="text-[9.5px] text-muted-foreground/80 italic border-l pl-1.5 font-mono">
                    {task.thought}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SidebarContent is flex-col — we place ONE flex-row child inside so
          TurnMinimap and messages sit side-by-side without fighting flex direction */}
      {/* SidebarContent — TurnMinimap is fixed so it floats outside the sidebar boundary */}
      <SidebarContent className="overflow-hidden p-0">
        {/* Fixed floating minimap strip — only visible when sidebar is hovered */}
        <TurnMinimap
          totalTurns={messages.length}
          onTurnClick={scrollToTurnIndex}
          visible={isSidebarHovered}
        />

        <div className="flex-1 p-3 overflow-hidden flex flex-col h-full">
          <MessageScroller>
            {messages.map((msg, idx) => {
              const isUser =
                msg.sender === "You" || msg.sender === "Inventor" || msg.sender === "user"
              const hasTrace = Boolean(msg.liveTrace?.length || msg.thinking?.length)
              const isTraceOpen = Boolean(msg.isTraceOpen)

              return (
                <div
                  key={msg.id}
                  ref={(el) => { messageRefs.current[idx] = el }}
                >
                  <Message variant={isUser ? "user" : "agent"} avatarText={isUser ? "YOU" : "AI"}>
                    <Marker sender={msg.sender} timestamp={msg.timestamp} />

                    {/* Live Trace — shows thinking, tool calls, handovers in real-time */}
                    {!isUser && hasTrace && isTraceOpen && msg.liveTrace && (
                      <LiveTrace steps={msg.liveTrace} isStreaming={msg.isStreaming} />
                    )}

                    {/* Legacy thinking (for historical messages loaded from backend) */}
                    {!isUser && !msg.liveTrace?.length && msg.thinking && isTraceOpen && (
                      <div className="mb-1.5 border rounded-lg bg-muted/30 text-[10px] p-2 space-y-1 font-mono text-muted-foreground">
                        {msg.thinking.map((t, i) => (
                          <div key={i} className="flex gap-1">
                            <span className="text-primary">›</span>
                            <span>{t}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <Bubble variant={isUser ? "user" : "agent"} isStreaming={msg.isStreaming}>
                      {msg.text || (msg.isStreaming ? "" : "...")}
                    </Bubble>

                    <MessageActions
                      text={msg.text}
                      variant={isUser ? "user" : "agent"}
                      hasTrace={hasTrace}
                      onEdit={(t) => setInput(t)}
                      onRegenerate={() => executeSend(msg.text)}
                      onToggleTrace={() => toggleTrace(msg.id)}
                    />
                  </Message>
                </div>
              )
            })}
            </MessageScroller>
          </div>
      </SidebarContent>

      {/* Footer Input */}
      <SidebarFooter className="border-t p-3 bg-sidebar">
        <div className="space-y-2">
          {messageQueue.length > 0 && (
            <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
              <span>{messageQueue.length} message{messageQueue.length > 1 ? "s" : ""} queued</span>
              <Badge variant="secondary" className="text-[9px] px-1 py-0">
                Sequencing
              </Badge>
            </div>
          )}

          <div className="rounded-lg border bg-background p-2 focus-within:ring-1 focus-within:ring-ring focus-within:border-ring">
            <textarea
              placeholder={
                isGenerating
                  ? "Type to queue message..."
                  : "Ask the team to bring your idea to life"
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleSendOrQueue()
                }
              }}
              className="w-full bg-transparent border-0 outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 text-xs min-h-[40px] resize-none p-0 placeholder:text-muted-foreground"
            />
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Button variant="ghost" size="icon" className="h-6 w-6" title="Add attachment">
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>

              {/* Dynamic: Stop / Send / Mic */}
              {isGenerating ? (
                <Button
                  size="icon"
                  variant="destructive"
                  onClick={handleStopGeneration}
                  title="Stop generation"
                  className="h-7 w-7 rounded-md"
                >
                  <Square className="w-3 h-3 fill-current" />
                </Button>
              ) : input.trim() ? (
                <Button
                  size="icon"
                  onClick={handleSendOrQueue}
                  title="Send message"
                  className="h-7 w-7 rounded-md"
                >
                  <Send className="w-3 h-3" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  variant="ghost"
                  title="Voice input"
                  className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground"
                >
                  <Mic className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </SidebarFooter>
    </aside>
  )
}
