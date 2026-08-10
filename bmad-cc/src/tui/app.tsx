import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput, useApp, useStdout } from 'ink';
import InkSpinner from 'ink-spinner';
const Spinner = InkSpinner as any;
import path from 'node:path';

import type { DashboardState } from './render-dashboard.js';
import type { DriverName } from '../agent/driver-factory.js';
import type { StoryRow } from './story-status-table.js';
import { THEME } from './theme.js';

// New panels
import { EpicTreePanel, type FlattenedTreeNode } from './panels/epic-tree-panel.js';
import { SupervisorChatPanel, type ChatMessage } from './panels/supervisor-chat-panel.js';
import { StorySpecViewer } from './panels/story-spec-viewer.js';
import { SubSessionPanel, type SessionEntry } from './panels/sub-session-panel.js';
import { StatusBar } from './panels/status-bar.js';

// Modals
import { LogInspectorModal } from './modals/log-inspector-modal.js';
import { HelpOverlay } from './modals/help-overlay.js';
import { FilterModal } from './modals/filter-modal.js';
import { GitDiffModal } from './modals/git-diff-modal.js';
import { EscalationModal, type EscalationContextInfo, type EscalationDecisionResult } from './modals/escalation-modal.js';
import { QueryModal } from './modals/query-modal.js';
import type { SubagentQueryInfo } from '../session/stream-parser.js';
import { askConversationalSupervisor } from '../supervisor/conversational-supervisor.js';
import { createDriver } from '../agent/driver-factory.js';
import { StreamThrottler } from '../utils/stream-throttler.js';
import { stripAnsi } from '../utils/ansi-cleaner.js';

// ── Types ──────────────────────────────────────────────────────────────────────

type AppMode = 'workstation' | 'log-inspector' | 'help' | 'filter' | 'git-diff' | 'escalation' | 'subagent-query';
type MiddlePaneView = 'chat' | 'story-spec';
type FocusedPane = 'tree' | 'console' | 'monitor';

const DRIVERS: DriverName[] = ['gemini', 'antigravity', 'opencode', 'copilot', 'custom'];

export interface AppProps {
  initialState: DashboardState;
  onRun?: (
    epicFilter?: string,
    statusFilter?: string,
    driver?: DriverName,
    onLogUpdate?: (sessionId: string, skill: string, message: string, fullData?: string) => void
  ) => void;
  onPause?: () => void;
  escalationContext?: EscalationContextInfo | null;
  onEscalationDecision?: (decision: EscalationDecisionResult) => void;
  activeQuery?: SubagentQueryInfo | null;
  onQueryAnswer?: (answer: string) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function nowHHMMSS(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function buildFlattenedNodes(
  stories: StoryRow[],
  expandedEpics: Record<string, boolean>
): FlattenedTreeNode[] {
  const epicsMap: Record<string, StoryRow[]> = {};
  for (const story of stories) {
    if (!epicsMap[story.epic]) epicsMap[story.epic] = [];
    epicsMap[story.epic].push(story);
  }

  const nodes: FlattenedTreeNode[] = [];
  for (const [epicKey, epicStories] of Object.entries(epicsMap)) {
    const done = epicStories.filter(s => s.status === 'done').length;
    const isExpanded = expandedEpics[epicKey] ?? false;
    nodes.push({ type: 'epic', epicKey, done, total: epicStories.length, isExpanded });
    if (isExpanded) {
      for (const story of epicStories) {
        nodes.push({ type: 'story', story, epicKey });
      }
    }
  }
  return nodes;
}

// ── Main App Component ─────────────────────────────────────────────────────────

export const App: React.FC<AppProps> = ({
  initialState,
  onRun,
  onPause,
  escalationContext: propsEscalationContext,
  onEscalationDecision: propsOnEscalationDecision,
  activeQuery: propsActiveQuery,
  onQueryAnswer: propsOnQueryAnswer
}) => {
  const { exit } = useApp();
  const { stdout } = useStdout();

  // Terminal dimensions
  const [dimensions, setDimensions] = useState({
    columns: stdout?.columns || 120,
    rows: stdout?.rows || 36
  });

  useEffect(() => {
    const handleResize = () => setDimensions({
      columns: stdout?.columns || 120,
      rows: stdout?.rows || 36
    });
    stdout?.on('resize', handleResize);
    return () => { stdout?.off('resize', handleResize); };
  }, [stdout]);

  // ── App mode & pane state ────────────────────────────────────────────────────
  const [appMode, setAppMode] = useState<AppMode>('workstation');
  const [middlePaneView, setMiddlePaneView] = useState<MiddlePaneView>('chat');
  const [focusedPane, setFocusedPane] = useState<FocusedPane>('console');

  // ── Sprint state ─────────────────────────────────────────────────────────────
  const [state, setState] = useState<DashboardState>(initialState);
  const [isRunning, setIsRunning] = useState(false);
  const [driverIndex, setDriverIndex] = useState(0);
  const [epicFilter, setEpicFilter] = useState<string | undefined>(initialState.epicFilter);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  // ── Tree state ───────────────────────────────────────────────────────────────
  const [expandedEpics, setExpandedEpics] = useState<Record<string, boolean>>({});
  const [treeCursorIndex, setTreeCursorIndex] = useState(0);
  const [selectedStoryKey, setSelectedStoryKey] = useState<string | null>(null);
  const [selectedStoryFilePath, setSelectedStoryFilePath] = useState<string | null>(null);
  const [specViewerCursor, setSpecViewerCursor] = useState(0);

  // ── Chat state ───────────────────────────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: 'supervisor',
      text: `BMad Command Center online. Native workstation loaded.\nSprint: ${initialState.projectName}\nType "run" to begin autonomous execution, or "help" for commands.`,
      timestamp: nowHHMMSS()
    }
  ]);
  const [chatCursorIndex, setChatCursorIndex] = useState(0);

  // ── Sessions & Monitor state ─────────────────────────────────────────────────
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [selectedSessionIndex, setSelectedSessionIndex] = useState(0);
  const [monitorCursorIndex, setMonitorCursorIndex] = useState(0);

  // ── Inspector & Git Diff state ────────────────────────────────────────────────
  const [inspectorLog, setInspectorLog] = useState<string>('');
  const [inspectorCursor, setInspectorCursor] = useState(0);
  const [inspectorMeta, setInspectorMeta] = useState<{
    sessionId?: string; skill?: string; phase?: string;
  }>({});
  const [gitDiffCursor, setGitDiffCursor] = useState(0);

  // ── Elapsed time ─────────────────────────────────────────────────────────────
  const [elapsedMs, setElapsedMs] = useState(0);
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current);
    }, 1000);
    return () => clearInterval(timer);
  }, [isRunning]);

  // ── Active modal contexts & interactive resolvers ───────────────────────────
  const [internalActiveQuery, setInternalActiveQuery] = useState<SubagentQueryInfo | null>(null);
  const [queryResolver, setQueryResolver] = useState<((answer: string) => void) | null>(null);

  const [internalEscalationContext, setInternalEscalationContext] = useState<EscalationContextInfo | null>(null);
  const [escalationResolver, setEscalationResolver] = useState<((decision: EscalationDecisionResult) => void) | null>(null);

  const currentActiveQuery = propsActiveQuery ?? state.activeQuery ?? initialState.activeQuery ?? internalActiveQuery;
  const currentEscalationContext = propsEscalationContext ?? state.escalationContext ?? initialState.escalationContext ?? internalEscalationContext;
  const handleQueryAnswer = propsOnQueryAnswer ?? state.onQueryAnswer ?? initialState.onQueryAnswer;
  const handleEscalationDecision = propsOnEscalationDecision ?? state.onEscalationDecision ?? initialState.onEscalationDecision;

  const handleQuery = (queryInfo: SubagentQueryInfo): Promise<string> => {
    return new Promise<string>((resolve) => {
      setInternalActiveQuery(queryInfo);
      setQueryResolver(() => resolve);
      setAppMode('subagent-query');
    });
  };

  const handleEscalation = (contextInfo: EscalationContextInfo): Promise<EscalationDecisionResult> => {
    return new Promise<EscalationDecisionResult>((resolve) => {
      setInternalEscalationContext(contextInfo);
      setEscalationResolver(() => resolve);
      setAppMode('escalation');
    });
  };

  const onQuerySubmit = (answer: string) => {
    setAppMode('workstation');
    setInternalActiveQuery(null);
    if (queryResolver) {
      queryResolver(answer);
      setQueryResolver(null);
    }
    if (handleQueryAnswer) {
      handleQueryAnswer(answer);
    }
  };

  const onEscalationSubmit = (decision: EscalationDecisionResult) => {
    setAppMode('workstation');
    setInternalEscalationContext(null);
    if (escalationResolver) {
      escalationResolver(decision);
      setEscalationResolver(null);
    }
    if (handleEscalationDecision) {
      handleEscalationDecision(decision);
    }
  };

  // ── Re-sync state & auto-trigger modal mode ──────────────────────────────────
  useEffect(() => {
    setState(initialState);
    if (propsActiveQuery || initialState.activeQuery || internalActiveQuery) {
      setAppMode('subagent-query');
    } else if (propsEscalationContext || initialState.escalationContext || internalEscalationContext) {
      setAppMode('escalation');
    } else {
      setAppMode((prev: AppMode) => {
        if (prev === 'escalation' || prev === 'subagent-query') {
          return 'workstation';
        }
        return prev;
      });
    }
  }, [initialState, propsActiveQuery, propsEscalationContext, internalActiveQuery, internalEscalationContext]);

  // ── Computed values ──────────────────────────────────────────────────────────
  const activeDriver = DRIVERS[driverIndex] || 'gemini';
  const stories = state.stories;

  // Apply filters for tree display
  const filteredStories = stories.filter((s: StoryRow) => {
    if (epicFilter) {
      const epicNum = epicFilter.replace(/\D/g, '');
      if (!s.epic.includes(epicNum)) return false;
    }
    if (statusFilter && s.status !== statusFilter) return false;
    return true;
  });

  const flattenedNodes = buildFlattenedNodes(filteredStories, expandedEpics);
  const currentNode = flattenedNodes[treeCursorIndex];

  const completedCount = filteredStories.filter((s: StoryRow) => s.status === 'done').length;

  // ── Throttled session log update handler (~50ms buffer + ANSI cleaning) ──────
  const logThrottlerRef = useRef<StreamThrottler<{ sessionId: string; skill: string; message: string; fullData?: string }>>(
    new StreamThrottler((batch) => {
      setSessions((prev: SessionEntry[]) => {
        let updated = [...prev];
        for (const item of batch) {
          const cleanMessage = stripAnsi(item.message);
          const lines = cleanMessage.split(/\r?\n/).filter(Boolean);
          const existingIdx = updated.findIndex((s: SessionEntry) => s.sessionId === item.sessionId);
          if (existingIdx >= 0) {
            updated[existingIdx] = {
              ...updated[existingIdx],
              logs: [...updated[existingIdx].logs, ...lines],
              status: 'running'
            };
            setMonitorCursorIndex(updated[existingIdx].logs.length - 1);
          } else {
            const newSession: SessionEntry = {
              sessionId: item.sessionId,
              storyKey: state.currentStoryKey || 'unknown',
              driverName: activeDriver,
              skill: item.skill,
              status: 'running',
              startedAt: nowHHMMSS(),
              logs: lines.length > 0 ? lines : [cleanMessage]
            };
            setSelectedSessionIndex(updated.length);
            updated.push(newSession);
          }
        }
        return updated;
      });
    }, 50)
  );

  useEffect(() => {
    return () => {
      logThrottlerRef.current.flush();
    };
  }, []);

  const handleLogUpdate = (sessionId: string, skill: string, message: string, fullData?: string) => {
    logThrottlerRef.current.push({ sessionId, skill, message, fullData });
  };

  // ── Supervisor directive handler ─────────────────────────────────────────────
  const handleDirectiveSubmit = (text: string) => {
    const cmd = text.toLowerCase().trim();

    // Add user message to chat
    setChatMessages((prev: ChatMessage[]) => {
      const next = [...prev, { role: 'user' as const, text, timestamp: nowHHMMSS() }];
      setChatCursorIndex(next.length - 1);
      return next;
    });

    const addSupervisorMsg = (msg: string, eventType?: string) => {
      setChatMessages((prev: ChatMessage[]) => {
        const next = [...prev, {
          role: 'supervisor' as const,
          text: msg,
          timestamp: nowHHMMSS(),
          eventType
        }];
        setChatCursorIndex(next.length - 1);
        return next;
      });
    };

    if (cmd === 'run' || cmd === 'start') {
      setIsRunning(true);
      startTimeRef.current = Date.now();
      addSupervisorMsg(`Launching sprint execution with driver [${activeDriver}]...\nProcessing queue for ${epicFilter ? `Epic ${epicFilter}` : 'all epics'}.`);
      if (onRun) onRun(epicFilter, statusFilter, activeDriver, handleLogUpdate);
    } else if (cmd === 'pause' || cmd === 'stop') {
      setIsRunning(false);
      addSupervisorMsg('Execution paused. Sprint state preserved. Type "run" to resume.');
      if (onPause) onPause();
    } else if (cmd.startsWith('driver ')) {
      const targetDriver = cmd.split(' ')[1] as DriverName;
      const idx = DRIVERS.indexOf(targetDriver);
      if (idx !== -1) {
        setDriverIndex(idx);
        addSupervisorMsg(`Driver switched to [${targetDriver}]. Next execution will use this driver.`);
      } else {
        addSupervisorMsg(`Unknown driver "${targetDriver}". Available: ${DRIVERS.join(', ')}`);
      }
    } else if (cmd === 'help') {
      addSupervisorMsg(
        'Available directives:\n' +
        '  run / start     — Begin sprint execution\n' +
        '  pause / stop    — Pause execution\n' +
        '  driver <name>   — Switch driver (gemini|opencode|copilot|antigravity)\n' +
        '  help            — Show this message\n\n' +
        'Keyboard shortcuts: [?] for full keybinding reference'
      );
    } else {
      // Conversational Supervisor prompt
      addSupervisorMsg(`Directive logged. Asking Supervisor AI (${activeDriver})...`, 'directive');
      const driverInstance = createDriver(activeDriver);
      askConversationalSupervisor({
        userPrompt: text,
        driver: driverInstance,
        projectRoot: process.cwd(),
        dashboardState: state,
        onChunk: (chunk) => {
          addSupervisorMsg(chunk, 'supervisor-stream');
        }
      });
    }
  };

  // ── Story selection from tree ─────────────────────────────────────────────────
  const handleStorySelect = (storyKey: string, filePath: string | null) => {
    setSelectedStoryKey(storyKey);
    setSelectedStoryFilePath(filePath);
    setSpecViewerCursor(0);
    setMiddlePaneView('story-spec');

    // Update global state current story key so header & status bar reflect selected story
    setState((prev: DashboardState) => ({ ...prev, currentStoryKey: storyKey }));

    const status = stories.find((s: StoryRow) => s.key === storyKey)?.status ?? 'backlog';
    setChatMessages((prev: ChatMessage[]) => {
      const next = [
        ...prev,
        {
          role: 'supervisor' as const,
          text: `★ Selected Story: ${storyKey} (Status: ${status})\nSupervisor loaded for this story. Press [r] to run or enter directives below.`,
          timestamp: nowHHMMSS(),
          eventType: 'story-select'
        }
      ];
      setChatCursorIndex(next.length - 1);
      return next;
    });
  };

  // ── Keyboard input ────────────────────────────────────────────────────────────
  useInput((input, key) => {
    // ── Git Diff modal controls ──────────────────────────────────────────────
    if (appMode === 'git-diff') {
      if (key.upArrow) setGitDiffCursor((prev: number) => Math.max(0, prev - 1));
      if (key.downArrow) setGitDiffCursor((prev: number) => prev + 1);
      if (key.escape || input === 'g') { setAppMode('workstation'); setGitDiffCursor(0); }
      if (key.ctrl && input === 'c') { exit(); }
      return;
    }

    // ── Log Inspector modal controls ─────────────────────────────────────────
    if (appMode === 'log-inspector') {
      if (key.upArrow) setInspectorCursor((prev: number) => Math.max(0, prev - 1));
      if (key.downArrow) setInspectorCursor((prev: number) => prev + 1);
      if (key.escape) { setAppMode('workstation'); setInspectorCursor(0); }
      if (key.ctrl && input === 'c') { exit(); }
      return;
    }

    // ── Help overlay controls ────────────────────────────────────────────────
    if (appMode === 'help') {
      if (key.escape || input === '?') setAppMode('workstation');
      if (key.ctrl && input === 'c') { exit(); }
      return;
    }

    // ── Filter modal controls (handled inside FilterModal via useInput) ──────
    if (appMode === 'filter') {
      // FilterModal handles its own useInput
      return;
    }

    // ── Global hotkeys (workstation mode) ────────────────────────────────────
    if (key.ctrl && input === 'c') { exit(); return; }
    if (key.escape) {
      if (middlePaneView === 'story-spec') {
        setMiddlePaneView('chat');
        setSelectedStoryKey(null);
        return;
      }
      if (isRunning) {
        setIsRunning(false);
        if (onPause) onPause();
        return;
      }
      exit();
      return;
    }
    if (input === '?') { setAppMode('help'); return; }
    if (input === 'g' && focusedPane !== 'console') { setAppMode('git-diff'); return; }
    if (input === 'f' && focusedPane !== 'console') { setAppMode('filter'); return; }

    // ── Tab: cycle pane focus ────────────────────────────────────────────────
    if (key.tab) {
      setFocusedPane((prev: FocusedPane) => prev === 'tree' ? 'console' : prev === 'console' ? 'monitor' : 'tree');
      return;
    }

    // ── Pane-specific arrow key navigation ────────────────────────────────────
    if (focusedPane === 'tree') {
      if (key.upArrow) setTreeCursorIndex((prev: number) => Math.max(0, prev - 1));
      if (key.downArrow) setTreeCursorIndex((prev: number) => Math.min(flattenedNodes.length - 1, prev + 1));

      if (key.return && currentNode) {
        if (currentNode.type === 'epic') {
          setExpandedEpics((prev: Record<string, boolean>) => ({ ...prev, [currentNode.epicKey]: !prev[currentNode.epicKey] }));
        } else if (currentNode.type === 'story') {
          // Build story file path from config
          const storyKey = currentNode.story.key;
          const storyFilePath = path.join(
            state.stories.length > 0 ? initialState.stories[0]?.key ? `_bmad-output/implementation-artifacts` : '.' : '.',
            `${storyKey}.md`
          );
          handleStorySelect(storyKey, storyFilePath);
        }
      }
      if (input === ' ' && currentNode?.type === 'epic') {
        setExpandedEpics((prev: Record<string, boolean>) => ({ ...prev, [currentNode.epicKey]: !prev[currentNode.epicKey] }));
      }
    }

    if (focusedPane === 'console') {
      if (key.upArrow) setChatCursorIndex((prev: number) => Math.max(0, prev - 1));
      if (key.downArrow) setChatCursorIndex((prev: number) => prev + 1);
      if (key.escape && middlePaneView === 'story-spec') {
        setMiddlePaneView('chat');
        setSelectedStoryKey(null);
      }
    }

    if (focusedPane === 'monitor') {
      if (key.upArrow) setMonitorCursorIndex((prev: number) => Math.max(0, prev - 1));
      if (key.downArrow) {
        const sel = sessions[selectedSessionIndex];
        const maxIdx = (sel?.logs.length ?? 1) - 1;
        setMonitorCursorIndex((prev: number) => Math.min(maxIdx, prev + 1));
      }
      // Session list navigation
      if (key.leftArrow) setSelectedSessionIndex((prev: number) => Math.max(0, prev - 1));
      if (key.rightArrow) setSelectedSessionIndex((prev: number) => Math.min(sessions.length - 1, prev + 1));

      // Open log inspector
      if ((input === 'v' || key.return) && sessions.length > 0) {
        const sel = sessions[selectedSessionIndex];
        if (sel) {
          const lineIdx = Math.min(monitorCursorIndex, sel.logs.length - 1);
          const fullLog = sel.logs.join('\n');
          setInspectorLog(fullLog);
          setInspectorMeta({ sessionId: sel.sessionId, skill: sel.skill, phase: 'session' });
          setInspectorCursor(lineIdx);
          setAppMode('log-inspector');
        }
      }
    }

    // ── Global action keys (only when not typing in console) ──────────────────
    if (focusedPane !== 'console') {
      if (input === 'r') {
        setIsRunning(true);
        startTimeRef.current = Date.now();
        if (onRun) onRun(epicFilter, statusFilter, activeDriver, handleLogUpdate);
      }
      if (input === 'p') {
        setIsRunning(false);
        if (onPause) onPause();
      }
      if (input === 'd') {
        setDriverIndex((prev: number) => (prev + 1) % DRIVERS.length);
      }
    }
  });

  // ── Layout calculations ───────────────────────────────────────────────────────
  // Top header(1) + status bar(3) + borders = ~4 rows overhead
  const totalHeight = Math.max(20, dimensions.rows - 1);
  const panelHeight = Math.max(14, totalHeight - 4);

  // ── Render: full-screen overlays take priority ────────────────────────────────
  if (appMode === 'log-inspector') {
    return (
      <Box width="100%" height={totalHeight} flexDirection="column">
        <LogInspectorModal
          fullLog={inspectorLog}
          sessionId={inspectorMeta.sessionId}
          skillName={inspectorMeta.skill}
          phase={inspectorMeta.phase}
          cursorIndex={inspectorCursor}
        />
      </Box>
    );
  }

  if (appMode === 'help') {
    return (
      <Box width="100%" height={totalHeight} flexDirection="column" alignItems="center" justifyContent="center">
        <HelpOverlay />
      </Box>
    );
  }

  if (appMode === 'git-diff') {
    return (
      <Box width="100%" height={totalHeight} flexDirection="column">
        <GitDiffModal projectRoot={process.cwd()} cursorIndex={gitDiffCursor} />
      </Box>
    );
  }

  if (appMode === 'escalation' && currentEscalationContext) {
    return (
      <Box width="100%" height={totalHeight} flexDirection="column" alignItems="center" justifyContent="center">
        <EscalationModal
          context={currentEscalationContext}
          onDecision={(decision: EscalationDecisionResult) => {
            setAppMode('workstation');
            handleEscalationDecision?.(decision);
          }}
        />
      </Box>
    );
  }

  if (appMode === 'subagent-query' && currentActiveQuery) {
    return (
      <Box width="100%" height={totalHeight} flexDirection="column" alignItems="center" justifyContent="center">
        <QueryModal
          rawPrompt={currentActiveQuery.rawPrompt}
          onAnswer={(answer: string) => {
            setAppMode('workstation');
            handleQueryAnswer?.(answer);
          }}
        />
      </Box>
    );
  }

  // ── Main workstation render ───────────────────────────────────────────────────
  return (
    <Box flexDirection="column" width="100%" height={totalHeight}>
      {/* Top Header Bar */}
      <Box
        flexDirection="row"
        justifyContent="space-between"
        borderStyle="single"
        borderColor={THEME.focusBorder}
        paddingX={1}
        width="100%"
      >
        <Box gap={1}>
          <Text bold color={THEME.heading}>🚀 BMad Command Center</Text>
          <Text color={THEME.muted}>│</Text>
          <Text color={THEME.muted}>Project: <Text bold color="white">{state.projectName}</Text></Text>
          {epicFilter && (
            <>
              <Text color={THEME.muted}>│</Text>
              <Text color={THEME.muted}>Filter: <Text bold color={THEME.accent}>EP-{epicFilter}</Text></Text>
            </>
          )}
        </Box>
        <Box gap={1}>
          {isRunning
            ? <Text color={THEME.success}><Spinner type="dots" /> <Text bold>RUNNING</Text></Text>
            : <Text color={THEME.muted}>IDLE</Text>
          }
          <Text color={THEME.muted}>│ v0.2.0</Text>
        </Box>
      </Box>

      {/* Filter modal overlay (inline above 3-column layout) */}
      {appMode === 'filter' && (
        <Box width="100%" alignItems="center" justifyContent="center">
          <FilterModal
            currentEpicFilter={epicFilter}
            currentStatusFilter={statusFilter}
            onApply={(epic: string | undefined, status: string | undefined) => {
              setEpicFilter(epic);
              setStatusFilter(status);
              setAppMode('workstation');
            }}
            onCancel={() => setAppMode('workstation')}
          />
        </Box>
      )}

      {/* 3-Column Workstation Layout */}
      <Box flexDirection="row" gap={1} width="100%" flexGrow={1}>
        {/* Left 25%: Epic Tree */}
        <Box width="25%">
          <EpicTreePanel
            flattenedNodes={flattenedNodes}
            cursorIndex={treeCursorIndex}
            currentStoryKey={state.currentStoryKey}
            selectedStoryKey={selectedStoryKey}
            isFocused={focusedPane === 'tree'}
            panelHeight={panelHeight}
            totalStories={filteredStories.length}
            onStorySelect={handleStorySelect}
            storyLocationDir="_bmad-output/implementation-artifacts"
          />
        </Box>

        {/* Middle 50%: Supervisor Chat or Story Spec Viewer */}
        <Box width="50%">
          {middlePaneView === 'story-spec' && selectedStoryKey ? (
            <StorySpecViewer
              storyKey={selectedStoryKey}
              storyFilePath={selectedStoryFilePath}
              storyStatus={filteredStories.find((s: StoryRow) => s.key === selectedStoryKey)?.status ?? 'backlog'}
              isFocused={focusedPane === 'console'}
              panelHeight={panelHeight}
              cursorIndex={specViewerCursor}
              driverName={activeDriver}
              onClose={() => { setMiddlePaneView('chat'); setSelectedStoryKey(null); }}
            />
          ) : (
            <SupervisorChatPanel
              messages={chatMessages}
              driverName={activeDriver}
              currentStoryKey={state.currentStoryKey}
              currentPhase={state.currentPhase}
              isExecuting={isRunning}
              isFocused={focusedPane === 'console'}
              panelHeight={panelHeight}
              cursorIndex={chatCursorIndex}
              onSubmitDirective={handleDirectiveSubmit}
            />
          )}
        </Box>

        {/* Right 25%: Sub-Session Monitor */}
        <Box width="25%">
          <SubSessionPanel
            sessions={sessions}
            selectedSessionIndex={selectedSessionIndex}
            activeSkill={state.activeSkill}
            isExecuting={isRunning}
            isFocused={focusedPane === 'monitor'}
            panelHeight={panelHeight}
            logCursorIndex={monitorCursorIndex}
            onInspectLog={(fullLog: string) => {
              setInspectorLog(fullLog);
              setInspectorMeta({ skill: state.activeSkill, phase: state.currentPhase });
              setInspectorCursor(0);
              setAppMode('log-inspector');
            }}
          />
        </Box>
      </Box>

      {/* Persistent Bottom Status Bar */}
      <StatusBar
        activeStoryKey={state.currentStoryKey}
        activePhase={state.currentPhase}
        driverName={activeDriver}
        completedStories={completedCount}
        totalStories={filteredStories.length}
        elapsedMs={elapsedMs}
        isRunning={isRunning}
        focusedPane={focusedPane}
        appMode={appMode}
      />
    </Box>
  );
};
