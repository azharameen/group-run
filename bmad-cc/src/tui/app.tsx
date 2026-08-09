import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp, useStdout } from 'ink';
import Spinner from 'ink-spinner';
import type { DashboardState } from './render-dashboard.js';
import type { DriverName } from '../agent/driver-factory.js';
import { EpicTreePanel, type FlattenedTreeNode } from './epic-tree-panel.js';
import { SupervisorConsolePanel } from './supervisor-console-panel.js';
import { SubSessionMonitorPanel } from './sub-session-monitor-panel.js';
import type { StoryRow } from './story-status-table.js';

export interface AppProps {
  initialState: DashboardState;
  onRun?: (
    epicFilter?: string,
    statusFilter?: string,
    driver?: DriverName,
    onLogUpdate?: (sessionId: string, skill: string, message: string) => void
  ) => void;
  onPause?: () => void;
}

const DRIVERS: DriverName[] = ['gemini', 'antigravity', 'opencode', 'copilot', 'custom'];
type FocusedPane = 'tree' | 'console' | 'monitor';

export const App: React.FC<AppProps> = ({ initialState, onRun, onPause }) => {
  const { exit } = useApp();
  const { stdout } = useStdout();

  const [dimensions, setDimensions] = useState({
    columns: stdout?.columns || 100,
    rows: stdout?.rows || 30
  });

  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        columns: stdout?.columns || 100,
        rows: stdout?.rows || 30
      });
    };
    stdout?.on('resize', handleResize);
    return () => {
      stdout?.off('resize', handleResize);
    };
  }, [stdout]);

  const [focusedPane, setFocusedPane] = useState<FocusedPane>('console');
  const [treeCursorIndex, setTreeCursorIndex] = useState(0);
  const [state, setState] = useState<DashboardState>(initialState);
  const [isRunning, setIsRunning] = useState(false);
  const [driverIndex, setDriverIndex] = useState(0);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const [supervisorLogs, setSupervisorLogs] = useState<string[]>([
    initialState.agentOutput || 'Supervisor Agent active. Full-screen workstation loaded.'
  ]);
  const [subSessionLogs, setSubSessionLogs] = useState<string[]>([
    'Sub-agent standing by.',
    'Session transcripts logged to .bmad-cc/sessions/'
  ]);
  const [expandedEpics, setExpandedEpics] = useState<Record<string, boolean>>({
    'EP-4': true
  });

  useEffect(() => {
    setState(initialState);
    if (initialState.agentOutput) {
      setSupervisorLogs(prev => [...prev.slice(-10), initialState.agentOutput]);
    }
  }, [initialState]);

  const activeDriver = DRIVERS[driverIndex] || 'gemini';
  const stories = state.stories;

  // Compute flattened tree nodes for navigation
  const epicsMap: Record<string, StoryRow[]> = {};
  for (const story of stories) {
    if (!epicsMap[story.epic]) {
      epicsMap[story.epic] = [];
    }
    epicsMap[story.epic].push(story);
  }

  const flattenedNodes: FlattenedTreeNode[] = [];
  for (const [epicKey, epicStories] of Object.entries(epicsMap)) {
    const isExpanded = expandedEpics[epicKey] ?? false;
    const doneCount = epicStories.filter(s => s.status === 'done').length;
    flattenedNodes.push({
      type: 'epic',
      epicKey,
      done: doneCount,
      total: epicStories.length,
      isExpanded
    });

    if (isExpanded) {
      for (const story of epicStories) {
        flattenedNodes.push({
          type: 'story',
          story,
          epicKey
        });
      }
    }
  }

  const currentNode = flattenedNodes[treeCursorIndex] || flattenedNodes[0];

  const handleLogUpdate = (sessionId: string, skill: string, message: string) => {
    setActiveSessionId(sessionId);
    setSubSessionLogs(prev => [...prev.slice(-8), `[${skill}] ${message}`]);
  };

  const handleDirectiveSubmit = (text: string) => {
    const cmd = text.toLowerCase().trim();
    setSupervisorLogs(prev => [...prev.slice(-10), `User Directive: ${text}`]);

    if (cmd === 'run' || cmd === 'start') {
      setIsRunning(true);
      setSupervisorLogs(prev => [...prev, 'Supervisor: Launching sprint execution loop...']);
      if (onRun) onRun(state.epicFilter, undefined, activeDriver, handleLogUpdate);
    } else if (cmd === 'pause' || cmd === 'stop') {
      setIsRunning(false);
      setSupervisorLogs(prev => [...prev, 'Supervisor: Execution paused clean.']);
      if (onPause) onPause();
    } else if (cmd.startsWith('driver ')) {
      const targetDriver = cmd.split(' ')[1] as DriverName;
      const idx = DRIVERS.indexOf(targetDriver);
      if (idx !== -1) {
        setDriverIndex(idx);
        setSupervisorLogs(prev => [...prev, `Supervisor: Driver switched to [${targetDriver}].`]);
      } else {
        setSupervisorLogs(prev => [...prev, `Supervisor: Unknown driver. Options: ${DRIVERS.join(', ')}`]);
      }
    } else if (cmd === 'help') {
      setSupervisorLogs(prev => [
        ...prev,
        'Supervisor: Available commands: run, pause, driver <gemini|opencode|copilot|antigravity>, help'
      ]);
    } else {
      setSupervisorLogs(prev => [
        ...prev,
        `Supervisor: Directing agent on "${text}". Context updated.`
      ]);
      setSubSessionLogs(prev => [
        ...prev.slice(-6),
        `bmad-dev-story directive: "${text}"`
      ]);
    }
  };

  useInput((input, key) => {
    if (key.escape) {
      exit();
    }

    if (key.tab) {
      setFocusedPane(prev => {
        if (prev === 'tree') return 'console';
        if (prev === 'console') return 'monitor';
        return 'tree';
      });
    }

    if (focusedPane === 'tree') {
      if (key.upArrow) {
        setTreeCursorIndex(prev => Math.max(0, prev - 1));
      }
      if (key.downArrow) {
        setTreeCursorIndex(prev => Math.min(flattenedNodes.length - 1, prev + 1));
      }

      if (input === ' ' || key.return) {
        if (currentNode && currentNode.type === 'epic') {
          const epicKey = currentNode.epicKey;
          setExpandedEpics(prev => ({
            ...prev,
            [epicKey]: !prev[epicKey]
          }));
        }
      }
    }

    if (input === 'd' && focusedPane !== 'console') {
      setDriverIndex(prev => (prev + 1) % DRIVERS.length);
    }

    if (input === 'r' && focusedPane !== 'console') {
      setIsRunning(true);
      if (onRun) onRun(state.epicFilter, undefined, activeDriver, handleLogUpdate);
    }
    if (input === 'p' && focusedPane !== 'console') {
      setIsRunning(false);
      if (onPause) onPause();
    }
  });

  // Calculate dynamic panel height to fit 100% of terminal screen
  const totalContainerHeight = Math.max(20, dimensions.rows - 2);
  const panelHeight = Math.max(14, totalContainerHeight - 5);

  return (
    <Box flexDirection="column" padding={1} borderWidth={1} borderColor="cyan" width="100%" height={totalContainerHeight}>
      {/* Top Banner */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Box gap={1}>
          <Text bold color="cyan">🚀 BMad Command Center Workstation v0.1.0</Text>
          <Text color="gray">|</Text>
          <Text color="gray">Project: <Text bold color="white">{state.projectName}</Text></Text>
        </Box>
        <Box gap={1}>
          <Text color="gray">Driver: <Text bold color="yellow">[{activeDriver}]</Text></Text>
          <Text color="gray">|</Text>
          <Text color="gray">Focus: <Text bold color="cyan">[{focusedPane.toUpperCase()}] (press Tab)</Text></Text>
        </Box>
      </Box>

      {/* Main 3-Column Workstation Layout */}
      <Box flexDirection="row" gap={1} width="100%">
        {/* Left Column (30%): Epics & Story Tree */}
        <Box width="30%">
          <EpicTreePanel
            stories={stories}
            cursorIndex={treeCursorIndex}
            currentStoryKey={state.currentStoryKey}
            expandedEpics={expandedEpics}
            isFocused={focusedPane === 'tree'}
            panelHeight={panelHeight}
          />
        </Box>

        {/* Middle Column (45%): Supervisor Console */}
        <Box width="45%">
          <SupervisorConsolePanel
            currentStoryKey={state.currentStoryKey}
            currentPhase={state.currentPhase}
            driverName={activeDriver}
            agentOutput={supervisorLogs.join('\n')}
            isExecuting={isRunning}
            isFocused={focusedPane === 'console'}
            panelHeight={panelHeight}
            onSubmitDirective={handleDirectiveSubmit}
          />
        </Box>

        {/* Right Column (25%): Sub-Sessions Monitor */}
        <Box width="25%">
          <SubSessionMonitorPanel
            activeSkill={state.activeSkill}
            activeSessionId={activeSessionId}
            driverName={activeDriver}
            isExecuting={isRunning}
            isFocused={focusedPane === 'monitor'}
            panelHeight={panelHeight}
            subSessionOutput={subSessionLogs}
          />
        </Box>
      </Box>

      {/* Bottom Keybindings Bar */}
      <Box marginTop={1} justifyContent="space-between">
        <Text color="gray">
          [Tab] Pane Focus | [↑/↓] Tree Cursor | [Space] Toggle Epic | [Esc] Quit
        </Text>
        <Text color="yellow">
          {isRunning ? (
            <Text color="green"><Spinner type="dots" /> Running ({activeDriver})...</Text>
          ) : (
            <Text color="gray">System Idle</Text>
          )}
        </Text>
      </Box>
    </Box>
  );
};
