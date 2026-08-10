import { Command, Flags } from '@oclif/core';
import React from 'react';
import { render } from 'ink';
import path from 'node:path';
import cliCursor from 'cli-cursor';
import { loadConfig } from '../config/config-loader.js';
import { parseSprintStatus, type SprintStatus } from '../sprint/sprint-status-parser.js';
import { App } from '../tui/app.js';
import type { DashboardState } from '../tui/render-dashboard.js';
import type { StoryRow } from '../tui/story-status-table.js';
import { fileExists, ensureDir } from '../utils/file-helpers.js';
import { ExecutionQueue } from '../session/execution-queue.js';
import { StateManager } from '../state/state-manager.js';
import { SessionLogger } from '../state/session-logger.js';
import { StoryExecutor } from '../session/story-executor.js';
import { createDriver, type DriverName } from '../agent/driver-factory.js';
import { AgentOutputStream } from '../tui/agent-output-stream.js';
import { routeSkillsForStory } from '../supervisor/skill-router.js';
import { StreamThrottler } from '../utils/stream-throttler.js';
import { stripAnsi } from '../utils/ansi-cleaner.js';
import type { SubagentQueryInfo } from '../session/stream-parser.js';
import type { EscalationContextInfo, EscalationDecisionResult } from '../tui/modals/escalation-modal.js';

export default class Tui extends Command {
  static override description = 'Launch full-screen interactive React Ink Command Center TUI app';

  static override flags = {
    epic: Flags.string({ char: 'e', description: 'Filter initial dashboard view by epic' }),
    driver: Flags.string({ char: 'd', description: 'Agent CLI driver (gemini, antigravity, opencode, copilot)' })
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Tui);
    const config = loadConfig();
    const sprintStatusPath = config.paths.sprintStatus;

    if (!(await fileExists(sprintStatusPath))) {
      this.error(`Sprint status file not found at ${sprintStatusPath}`);
    }

    // Switch to Alternate Screen Buffer & clear terminal for full-screen view
    process.stdout.write('\x1b[?1049h\x1b[2J\x1b[3J\x1b[H');
    cliCursor.hide();

    const cleanupScreen = () => {
      process.stdout.write('\x1b[?1049l');
      cliCursor.show();
    };

    process.once('exit', cleanupScreen);
    process.once('SIGINT', () => {
      cleanupScreen();
      process.exit(0);
    });

    let sprintStatus: SprintStatus = await parseSprintStatus(sprintStatusPath);
    let isExecuting = false;
    let isPaused = false;

    const buildState = (
      activeStoryKey: string | null = null,
      activePhase: string = 'idle',
      activeSkill?: string,
      agentOutput: string = 'Supervisor Agent active. Native BMad Workstation loaded.',
      driverName: DriverName = (flags.driver || config.agent.driver) as DriverName
    ): DashboardState => {
      const stories: StoryRow[] = [];
      let completedCount = 0;
      let inProgressCount = 0;

      for (const [key, status] of Object.entries(sprintStatus.developmentStatus)) {
        if (key.startsWith('epic-') || key.endsWith('-retrospective')) continue;

        const epicMatch = key.match(/^(\d+)-/);
        const epicNum = epicMatch ? epicMatch[1] : '0';
        const epicKey = `EP-${epicNum}`;

        if (flags.epic && epicNum !== flags.epic.replace(/\D/g, '')) continue;

        if (status === 'done') completedCount++;
        if (status === 'in-progress' || status === 'review') inProgressCount++;

        stories.push({
          key,
          epic: epicKey,
          status,
          phase: status === 'in-progress' ? 'dev' : status === 'review' ? 'review' : status === 'done' ? 'done' : '-',
          retries: 0
        });
      }

      return {
        projectName: sprintStatus.meta.project || 'BMad Project',
        totalStories: stories.length,
        completedStories: completedCount,
        inProgressStories: inProgressCount,
        currentStoryKey: activeStoryKey,
        currentPhase: activePhase,
        activeSkill,
        epicFilter: flags.epic,
        stories,
        agentOutput,
        elapsedTime: 0,
        driverName
      };
    };

    let currentState = buildState();
    let inkInstance: any;

    let renderTimer: NodeJS.Timeout | null = null;
    let pendingState: DashboardState | null = null;

    const performRerender = (newState: DashboardState) => {
      currentState = newState;
      if (inkInstance) {
        inkInstance.rerender(
          React.createElement(App, {
            initialState: currentState,
            onRun: handleRun,
            onPause: handlePause
          })
        );
      }
    };

    const updateUIState = (newState: DashboardState, immediate: boolean = false) => {
      pendingState = newState;
      if (immediate) {
        if (renderTimer) {
          clearTimeout(renderTimer);
          renderTimer = null;
        }
        performRerender(newState);
        pendingState = null;
        return;
      }
      if (!renderTimer) {
        renderTimer = setTimeout(() => {
          renderTimer = null;
          if (pendingState) {
            performRerender(pendingState);
            pendingState = null;
          }
        }, 50);
      }
    };

    let activeAbortController: AbortController | null = null;

    const handlePause = () => {
      isPaused = true;
      if (activeAbortController) {
        activeAbortController.abort();
        activeAbortController = null;
      }
    };

    const handleRun = async (
      epicFilter?: string,
      statusFilter?: string,
      driverOverride?: DriverName,
      externalOnLogUpdate?: (sessionId: string, skill: string, message: string) => void,
      externalOnQuery?: (queryInfo: SubagentQueryInfo) => Promise<string>,
      externalOnEscalation?: (context: EscalationContextInfo) => Promise<EscalationDecisionResult>
    ) => {
      if (isExecuting) {
        isPaused = false;
        return;
      }

      isExecuting = true;
      isPaused = false;

      const activeDriverName = driverOverride || (flags.driver || config.agent.driver) as DriverName;
      const driver = createDriver(activeDriverName, config.agent.drivers?.[activeDriverName]);
      
      // Store state and sessions natively inside `_bmad/sessions/`
      const stateDir = path.resolve(config.projectRoot, '_bmad');
      await ensureDir(stateDir);
      const stateManager = new StateManager(stateDir);

      const sessionId = crypto.randomUUID();
      const sessionsDir = path.resolve(stateDir, 'sessions');
      await ensureDir(sessionsDir);
      const sessionLogger = new SessionLogger(sessionsDir, sessionId);

      const storyExecutor = new StoryExecutor(config, driver, stateManager, sessionLogger);
      const outputStream = new AgentOutputStream(20);
      const queue = new ExecutionQueue();

      // Throttler for stream output updates to UI (50ms buffer)
      const streamThrottler = new StreamThrottler<{ sessionId: string; skill: string; message: string; phase: string; storyKey: string }>((batch) => {
        for (const item of batch) {
          const cleanMsg = stripAnsi(item.message);
          outputStream.append(`[${item.skill}] ${cleanMsg}`);
          if (externalOnLogUpdate) {
            externalOnLogUpdate(item.sessionId, item.skill, cleanMsg);
          }
        }
        const lastItem = batch[batch.length - 1];
        if (lastItem) {
          updateUIState(buildState(lastItem.storyKey, lastItem.phase, lastItem.skill, outputStream.render(), activeDriverName));
        }
      }, 50);

      queue.buildFromSprintStatus(sprintStatus, {
        epic: epicFilter,
        status: statusFilter
      });

      let currentStoryKey: string | null = null;
      let activePhase: string = 'idle';
      let activeSkill: string = 'bmad-dev-story';

      try {
        let nextStory = queue.next();
        while (nextStory && !isPaused) {
          const storyKey = nextStory.storyKey;
          currentStoryKey = storyKey;
          const initialStatus = sprintStatus.developmentStatus[storyKey] || 'backlog';
          const epicMatch = storyKey.match(/^(\d+)-/);
          const epicNumber = epicMatch ? epicMatch[1] : '0';
          const epicStatus = sprintStatus.developmentStatus[`epic-${epicNumber}`] || 'in-progress';
          const routedSkills = routeSkillsForStory(storyKey, initialStatus, '', epicStatus, false);
          activePhase = routedSkills[0]?.phase || 'develop';
          activeSkill = routedSkills[0]?.skillName || 'bmad-dev-story';

          activeAbortController = new AbortController();

          outputStream.append(`Supervisor continuous loop starting execution for ${storyKey} (status: ${initialStatus})...`);
          streamThrottler.flush();
          updateUIState(buildState(storyKey, activePhase, activeSkill, outputStream.render(), activeDriverName), true);

          let result;
          try {
            result = await storyExecutor.execute(storyKey, sprintStatus, {
              dryRun: false,
              skipReview: false,
              skipTests: false,
              abortController: activeAbortController,
              onProgress: (progress) => {
                const cleanMsg = stripAnsi(progress.message);
                streamThrottler.push({
                  sessionId: progress.sessionId,
                  skill: progress.skillName,
                  message: cleanMsg,
                  phase: progress.phase,
                  storyKey
                });
              },
              onSubagentQuery: async (query) => {
                outputStream.append(`[SUB-AGENT QUERY] ${query.rawPrompt}`);
                streamThrottler.flush();
                if (externalOnQuery) {
                  return await externalOnQuery(query);
                }

                // Interactive QueryModal wiring in TUI
                return new Promise<string>((resolve) => {
                  updateUIState({
                    ...buildState(storyKey, activePhase, activeSkill, outputStream.render(), activeDriverName),
                    activeQuery: query,
                    onQueryAnswer: (answer: string) => {
                      outputStream.append(`[USER ANSWER] ${answer}`);
                      updateUIState({
                        ...buildState(storyKey, activePhase, activeSkill, outputStream.render(), activeDriverName),
                        activeQuery: null,
                        onQueryAnswer: undefined
                      }, true);
                      resolve(answer);
                    }
                  }, true);
                });
              },
              onEscalation: async (escContext) => {
                outputStream.append(`[ESCALATION REQUIRED] ${escContext.storyKey}: ${escContext.reason}`);
                streamThrottler.flush();
                if (externalOnEscalation) {
                  return await externalOnEscalation(escContext);
                }
                return new Promise<EscalationDecisionResult>((resolve) => {
                  updateUIState({
                    ...buildState(storyKey, activePhase, activeSkill, outputStream.render(), activeDriverName),
                    escalationContext: escContext,
                    onEscalationDecision: (decision: EscalationDecisionResult) => {
                      outputStream.append(`[USER ESCALATION SELECTION] Action: ${decision.action}`);
                      updateUIState({
                        ...buildState(storyKey, activePhase, activeSkill, outputStream.render(), activeDriverName),
                        escalationContext: null,
                        onEscalationDecision: undefined
                      }, true);
                      resolve(decision);
                    }
                  }, true);
                });
              }
            });
          } catch (execErr: any) {
            const cleanErr = stripAnsi(execErr?.message || String(execErr));
            outputStream.append(`[SUPERVISOR EXCEPTION HANDLED] ${cleanErr}`);
            streamThrottler.flush();
            result = {
              storyKey,
              finalDecision: 'ESCALATE_TO_HUMAN' as const,
              totalRetries: 0,
              phases: [],
              sessionId,
              nextStatus: initialStatus
            };
          }

          streamThrottler.flush();
          activeAbortController = null;

          // Reload sprint status natively from disk
          sprintStatus = await parseSprintStatus(sprintStatusPath);

          outputStream.append(`Decision for ${storyKey}: ${result.finalDecision} -> next: ${result.nextStatus || 'done'}`);
          updateUIState(buildState(storyKey, 'gate', activeSkill, outputStream.render(), activeDriverName), true);

          if (result.finalDecision === 'APPROVE') {
            queue.markCompleted(storyKey);
          } else if (result.finalDecision === 'ESCALATE_TO_HUMAN') {
            const escalationContext: EscalationContextInfo = {
              storyKey,
              reason: `Gate decision: ESCALATE_TO_HUMAN after ${result.totalRetries} retries in phase ${activePhase}`,
              retryCount: result.totalRetries,
              maxRetries: config.limits.maxRetries || 3,
              testOutput: result.phases.map(p => `[${p.phase}] ${p.outcome}`).join('\n')
            };

            let decision: EscalationDecisionResult;
            if (externalOnEscalation) {
              decision = await externalOnEscalation(escalationContext);
            } else {
              decision = await new Promise<EscalationDecisionResult>((resolve) => {
                updateUIState({
                  ...buildState(storyKey, 'gate', activeSkill, outputStream.render(), activeDriverName),
                  escalationContext,
                  onEscalationDecision: (dec: EscalationDecisionResult) => {
                    updateUIState({
                      ...buildState(storyKey, 'gate', activeSkill, outputStream.render(), activeDriverName),
                      escalationContext: null,
                      onEscalationDecision: undefined
                    }, true);
                    resolve(dec);
                  }
                }, true);
              });
            }

            outputStream.append(`[HUMAN ESCALATION DECISION] Action: ${decision.action}`);
            updateUIState(buildState(storyKey, 'gate', activeSkill, outputStream.render(), activeDriverName), true);

            if (decision.action === 'override-pass') {
              outputStream.append(`Human override: Story ${storyKey} marked as PASSED/COMPLETED.`);
              queue.markCompleted(storyKey);
            } else if (decision.action === 'retry' || decision.action === 'retry-with-prompt') {
              outputStream.append(`Human retry: Re-queuing story ${storyKey}${decision.customPrompt ? ` with prompt: "${decision.customPrompt}"` : ''}...`);
              continue;
            } else if (decision.action === 'abort') {
              outputStream.append(`Human abort: Sprint execution aborted.`);
              isPaused = true;
              break;
            } else {
              outputStream.append(`Human skip: Story ${storyKey} skipped.`);
              queue.markSkipped(storyKey);
            }
          } else {
            queue.markSkipped(storyKey);
          }

          nextStory = queue.next();
        }
      } catch (loopError: any) {
        const cleanErr = stripAnsi(loopError?.message || String(loopError));
        outputStream.append(`[SUPERVISOR CONTINUOUS LOOP RECOVERY] ${cleanErr}`);
        streamThrottler.flush();
      } finally {
        streamThrottler.flush();
        isExecuting = false;
        outputStream.append(isPaused ? 'Execution paused by user.' : 'Supervisor monitoring active. Continuous loop ready.');
        updateUIState(buildState(null, 'idle', undefined, outputStream.render(), activeDriverName), true);
      }
    };

    inkInstance = render(
      React.createElement(App, {
        initialState: currentState,
        onRun: handleRun,
        onPause: handlePause
      })
    );

    await inkInstance.waitUntilExit();
    cleanupScreen();
  }
}


