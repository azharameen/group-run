import path from 'path';
import fs from 'fs/promises';
import type { SupervisorResult, GateDecisionType } from '../supervisor/supervisor-agent.js';
import type { BmadCcConfig } from '../config/config-schema.js';
import type { SprintStatus } from '../sprint/sprint-status-parser.js';
import type { AgentDriver } from '../agent/driver-interface.js';
import { createDriver, type DriverName } from '../agent/driver-factory.js';
import type { StateManager } from '../state/state-manager.js';
import type { SessionLogger } from '../state/session-logger.js';
import { parseStorySpec } from '../sprint/story-spec-parser.js';
import { routeSkillsForStoryAsync } from '../supervisor/skill-router.js';
import { assembleContext } from '../supervisor/context-assembler.js';
import { generateDirective } from '../supervisor/directive-generator.js';
import { evaluateResult } from '../supervisor/result-evaluator.js';
import { makeGateDecision } from '../supervisor/gate-decision.js';
import { runTestCommands, summarizeTestResults } from '../verification/test-runner.js';
import { fileExists } from '../utils/file-helpers.js';
import { HeartbeatMonitor } from '../watchdog/heartbeat-monitor.js';
import { StreamQueryParser, type SubagentQueryInfo } from './stream-parser.js';

export interface StoryExecutionProgress {
  sessionId: string;
  storyKey: string;
  phase: string;
  skillName: string;
  eventType: 'start' | 'driver-init' | 'prompt' | 'stdout' | 'stderr' | 'test-start' | 'test-result' | 'gate';
  message: string;
  fullData?: Record<string, unknown>;
}

export interface StoryExecutionOptions {
  dryRun: boolean;
  skipReview: boolean;
  skipTests: boolean;
  abortController?: AbortController;
  inactivityTimeoutMs?: number;
  onProgress?: (progress: StoryExecutionProgress) => void;
  onSubagentQuery?: (queryInfo: SubagentQueryInfo) => void;
}

export class StoryExecutor {
  constructor(
    private config: BmadCcConfig,
    private driver: AgentDriver,
    private stateManager: StateManager,
    private logger: SessionLogger
  ) {}

  /** Execute a single story through all supervised phases */
  public async execute(
    storyKey: string,
    sprintStatus: SprintStatus,
    options: StoryExecutionOptions
  ): Promise<SupervisorResult> {
    const sessionId = crypto.randomUUID();
    const currentStoryStatus = sprintStatus.developmentStatus[storyKey] || 'backlog';

    await this.logger.log({
      phase: 'pre-flight',
      storyKey,
      event: 'phase-start',
      data: { storyKey, currentStatus: currentStoryStatus, dryRun: options.dryRun }
    });

    options.onProgress?.({
      sessionId,
      storyKey,
      phase: 'pre-flight',
      skillName: 'supervisor',
      eventType: 'start',
      message: `Session initialized (ID: ${sessionId.substring(0, 8)}). Target story: ${storyKey}`
    });

    // Update state manager checkpoint
    let state = await this.stateManager.load();
    if (!state) {
      state = {
        version: 1,
        startedAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
        currentPhase: 'pre-flight',
        currentStoryKey: storyKey,
        currentEpicKey: null,
        retryCount: 0,
        completedStories: [],
        skippedStories: [],
        activeSessionId: sessionId,
        lastError: null,
        driverName: this.driver.name
      };
    } else {
      state.currentStoryKey = storyKey;
      state.currentPhase = 'pre-flight';
      state.activeSessionId = sessionId;
    }
    await this.stateManager.save(state);

    // Locate story spec file
    const storyLocation = this.config.paths.storyLocation;
    const storyFilePath = path.join(storyLocation, `${storyKey}.md`);

    let storyContent = '';
    let storyTitle = storyKey;
    if (await fileExists(storyFilePath)) {
      const parsedSpec = await parseStorySpec(storyFilePath);
      storyTitle = parsedSpec.title || storyKey;
      storyContent = await fs.readFile(storyFilePath, 'utf8');
    }

    const epicMatch = storyKey.match(/^(\d+)-/);
    const epicNumber = epicMatch ? epicMatch[1] : '0';
    const epicStatus = sprintStatus.developmentStatus[`epic-${epicNumber}`] || 'in-progress';

    // Route skills based strictly on ACTUAL currentStoryStatus using dynamic catalog & bmad-help discovery
    const skillInvocations = await routeSkillsForStoryAsync(
      storyKey,
      currentStoryStatus,
      storyContent,
      epicStatus,
      false,
      { projectRoot: this.config.projectRoot, driver: this.driver }
    );

    const context = await assembleContext(this.config.projectRoot);
    const phases: Array<{ phase: string; skill: string; durationMs: number; outcome: string }> = [];
    let finalDecision: GateDecisionType = 'APPROVE';
    let totalRetries = 0;
    let lastGateDecision: import('../supervisor/gate-decision.js').GateDecision | undefined = undefined;

    for (const skill of skillInvocations) {
      if (options.skipReview && skill.phase === 'review') continue;

      let phaseDecision: GateDecisionType = 'RETRY_WITH_FEEDBACK';
      let retryFeedback: string | undefined = undefined;
      let attempt = 0;
      const maxRetries = this.config.limits.maxRetries || 3;

      await this.stateManager.updatePhase(
        skill.phase === 'develop' ? 'development' : skill.phase === 'review' ? 'review' : 'verification'
      );

      options.onProgress?.({
        sessionId,
        storyKey,
        phase: skill.phase,
        skillName: skill.skillName,
        eventType: 'start',
        message: `Phase [${skill.phase.toUpperCase()}]: Spawning sub-agent ${skill.skillName}...`
      });

      while (phaseDecision === 'RETRY_WITH_FEEDBACK' && attempt <= maxRetries) {
        const start = Date.now();
        const directive = generateDirective(
          storyKey,
          skill,
          { title: storyTitle, filePath: storyFilePath, content: storyContent },
          context,
          retryFeedback,
          lastGateDecision?.statusUpdateNote
        );

        // Emit Detailed Driver Initialization & Prompt Info
        options.onProgress?.({
          sessionId,
          storyKey,
          phase: skill.phase,
          skillName: skill.skillName,
          eventType: 'driver-init',
          message: `[DRIVER INIT] Command: ${this.driver.getCommand()} | Driver: ${this.driver.displayName} | Model: ${this.config.agent.model || 'default'}`
        });

        options.onProgress?.({
          sessionId,
          storyKey,
          phase: skill.phase,
          skillName: skill.skillName,
          eventType: 'prompt',
          message: `[PROMPT LOG] Directive Prompt (${directive.prompt.length} chars):\n"${directive.prompt.substring(0, 160)}..."`
        });

        if (options.dryRun) {
          await this.logger.log({
            phase: skill.phase,
            storyKey,
            event: 'agent-output',
            data: { dryRun: true, skill: skill.skillName, prompt: directive.prompt }
          });
          phases.push({ phase: skill.phase, skill: skill.skillName, durationMs: 0, outcome: 'DRY_RUN' });
          phaseDecision = 'APPROVE';
          break;
        }

        // Resolve driver per skill if configured in skillDrivers mapping
        const activeDriverName = (this.config.agent.skillDrivers?.[skill.skillName] || this.driver.name) as DriverName;
        const activeDriver = activeDriverName === this.driver.name
          ? this.driver
          : createDriver(activeDriverName, this.config.agent.drivers?.[activeDriverName]);

        const activeAbortController = options.abortController || new AbortController();
        const inactivityTimeoutMs = options.inactivityTimeoutMs || (this.config.limits as any)?.inactivityTimeoutMs || 120000;

        let processStalled = false;
        const heartbeat = new HeartbeatMonitor({
          timeoutMs: inactivityTimeoutMs,
          onTimeout: () => {
            processStalled = true;
            this.logger.log({
              phase: skill.phase,
              storyKey,
              event: 'stalled-process-timeout',
              data: { durationMs: inactivityTimeoutMs }
            });
            options.onProgress?.({
              sessionId,
              storyKey,
              phase: skill.phase,
              skillName: skill.skillName,
              eventType: 'stderr',
              message: `[WATCHDOG] Subprocess output stalled (inactivity threshold ${inactivityTimeoutMs}ms reached). Aborting process...`
            });
            activeAbortController.abort();
          },
          onActivity: () => {}
        });

        const streamParser = new StreamQueryParser();
        heartbeat.start();

        let sessionResult: import('../agent/driver-interface.js').AgentSessionResult;

        try {
          // Execute agent CLI with full untruncated streaming
          sessionResult = await activeDriver.execute({
            prompt: directive.prompt,
            workingDirectory: this.config.projectRoot,
            model: this.config.agent.model,
            signal: activeAbortController.signal,
            onStdout: (data) => {
              heartbeat.pulse();
              const query = streamParser.parseChunk(data);
              if (query && options.onSubagentQuery) {
                options.onSubagentQuery(query);
              }
              const clean = data.trim();
              if (!clean) return;
              this.logger.log({
                phase: skill.phase,
                storyKey,
                event: 'agent-output',
                data: { stream: 'stdout', chunk: clean }
              });
              // Pipe full lines without artificial length truncation!
              options.onProgress?.({
                sessionId,
                storyKey,
                phase: skill.phase,
                skillName: skill.skillName,
                eventType: 'stdout',
                message: clean
              });
            },
            onStderr: (data) => {
              heartbeat.pulse();
              const query = streamParser.parseChunk(data);
              if (query && options.onSubagentQuery) {
                options.onSubagentQuery(query);
              }
              const clean = data.trim();
              if (!clean) return;
              this.logger.log({
                phase: skill.phase,
                storyKey,
                event: 'agent-output',
                data: { stream: 'stderr', chunk: clean }
              });
              options.onProgress?.({
                sessionId,
                storyKey,
                phase: skill.phase,
                skillName: skill.skillName,
                eventType: 'stderr',
                message: clean
              });
            }
          });
        } finally {
          heartbeat.stop();
        }

        if (processStalled || activeAbortController.signal.aborted) {
          await this.stateManager.setError(
            processStalled
              ? `Subprocess output stalled in phase ${skill.phase}`
              : `Subprocess aborted in phase ${skill.phase}`
          );
          phaseDecision = 'ESCALATE_TO_HUMAN';
          break;
        }

        // Run verification test commands if phase is develop/review and tests enabled
        let testExitCode = sessionResult.exitCode;
        let testOutput = sessionResult.stdout + '\n' + sessionResult.stderr;

        if (!options.skipTests && this.config.verification?.commands && this.config.verification.commands.length > 0) {
          options.onProgress?.({
            sessionId,
            storyKey,
            phase: 'verification',
            skillName: skill.skillName,
            eventType: 'test-start',
            message: `[TEST RUNNER] Executing: ${this.config.verification.commands.join(' && ')}...`
          });

          const testResults = await runTestCommands(
            this.config.verification.commands,
            this.config.projectRoot
          );
          const summary = summarizeTestResults(testResults);
          testExitCode = summary.allPassed ? 0 : 1;
          testOutput = summary.failureDetails || testOutput;

          options.onProgress?.({
            sessionId,
            storyKey,
            phase: 'verification',
            skillName: skill.skillName,
            eventType: 'test-result',
            message: summary.allPassed 
              ? `[TEST PASSED] All ${testResults.length} test commands executed cleanly.` 
              : `[TEST FAILED] Failures in ${summary.failedCommands} commands:\n${summary.failureDetails || 'Exit code non-zero'}`
          });
        }

        const evaluation = await evaluateResult(
          storyKey,
          skill.phase,
          options.skipTests ? 0 : testExitCode,
          testOutput,
          '',
          [],
          storyFilePath,
          skill.phase === 'review' ? sessionResult.stdout : undefined
        );

        const gate = makeGateDecision(evaluation, attempt, maxRetries, currentStoryStatus);
        lastGateDecision = gate;
        phaseDecision = gate.decision;
        retryFeedback = gate.feedback;

        options.onProgress?.({
          sessionId,
          storyKey,
          phase: skill.phase,
          skillName: skill.skillName,
          eventType: 'gate',
          message: `[GATE AUDIT] Outcome: ${gate.decision} (Attempt ${attempt + 1}/${maxRetries + 1})${gate.feedback ? ` - Feedback: ${gate.feedback}` : ''}`
        });

        phases.push({
          phase: skill.phase,
          skill: skill.skillName,
          durationMs: Date.now() - start,
          outcome: phaseDecision
        });

        attempt++;
        totalRetries++;
      }

      if (phaseDecision === 'ESCALATE_TO_HUMAN') {
        finalDecision = 'ESCALATE_TO_HUMAN';
        const currentState = await this.stateManager.load();
        if (!currentState?.lastError) {
          await this.stateManager.setError(`Escalated to human after ${totalRetries} retries in phase ${skill.phase}`);
        }
        break;
      }
    }

    // Target status transition is driven natively by BMad agents executing via driver sessions
    // guided by the SPRINT STATUS DIRECTIVE in their prompt.
    const nextStatus = lastGateDecision?.targetStatus || currentStoryStatus;

    if (nextStatus === 'done') {
      await this.stateManager.markStoryCompleted(storyKey);
    }


    await this.logger.log({
      phase: 'gate-decision',
      storyKey,
      event: 'gate-decision',
      data: { finalDecision, totalRetries, startingStatus: currentStoryStatus, nextStatus }
    });

    return {
      storyKey,
      finalDecision,
      totalRetries,
      phases,
      sessionId,
      nextStatus
    };
  }
}
