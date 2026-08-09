import path from 'path';
import fs from 'fs/promises';
import type { SupervisorResult, GateDecisionType } from '../supervisor/supervisor-agent.js';
import type { BmadCcConfig } from '../config/config-schema.js';
import type { SprintStatus } from '../sprint/sprint-status-parser.js';
import type { AgentDriver } from '../agent/driver-interface.js';
import type { StateManager } from '../state/state-manager.js';
import type { SessionLogger } from '../state/session-logger.js';
import { parseStorySpec } from '../sprint/story-spec-parser.js';
import { routeSkillsForStory } from '../supervisor/skill-router.js';
import { assembleContext } from '../supervisor/context-assembler.js';
import { generateDirective } from '../supervisor/directive-generator.js';
import { evaluateResult } from '../supervisor/result-evaluator.js';
import { makeGateDecision } from '../supervisor/gate-decision.js';
import { runTestCommands, summarizeTestResults } from '../verification/test-runner.js';
import { fileExists } from '../utils/file-helpers.js';
import { updateStoryStatus, updateLastUpdated } from '../sprint/sprint-status-updater.js';

export interface StoryExecutionProgress {
  sessionId: string;
  storyKey: string;
  phase: string;
  skillName: string;
  eventType: 'start' | 'stdout' | 'stderr' | 'test-start' | 'test-result' | 'gate';
  message: string;
}

export interface StoryExecutionOptions {
  dryRun: boolean;
  skipReview: boolean;
  skipTests: boolean;
  onProgress?: (progress: StoryExecutionProgress) => void;
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
      message: `Session initialized (ID: ${sessionId.substring(0, 8)}). Starting ${storyKey}...`
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

    // Route skills based strictly on ACTUAL currentStoryStatus
    const skillInvocations = routeSkillsForStory(
      storyKey,
      currentStoryStatus,
      storyContent,
      epicStatus,
      false
    );

    const context = await assembleContext(this.config.projectRoot);
    const phases: Array<{ phase: string; skill: string; durationMs: number; outcome: string }> = [];
    let finalDecision: GateDecisionType = 'APPROVE';
    let totalRetries = 0;

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
        message: `Phase [${skill.phase.toUpperCase()}]: Spawning ${skill.skillName}...`
      });

      while (phaseDecision === 'RETRY_WITH_FEEDBACK' && attempt <= maxRetries) {
        const start = Date.now();
        const directive = generateDirective(
          storyKey,
          skill,
          { title: storyTitle, filePath: storyFilePath, content: storyContent },
          context,
          retryFeedback
        );

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

        // Execute agent CLI with real-time output event streaming
        const sessionResult = await this.driver.execute({
          prompt: directive.prompt,
          workingDirectory: this.config.projectRoot,
          model: this.config.agent.model,
          onStdout: (data) => {
            const clean = data.trim();
            if (!clean) return;
            this.logger.log({
              phase: skill.phase,
              storyKey,
              event: 'agent-output',
              data: { stream: 'stdout', chunk: clean }
            });
            options.onProgress?.({
              sessionId,
              storyKey,
              phase: skill.phase,
              skillName: skill.skillName,
              eventType: 'stdout',
              message: clean.length > 80 ? clean.substring(0, 78) + '..' : clean
            });
          },
          onStderr: (data) => {
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
              message: clean.length > 80 ? clean.substring(0, 78) + '..' : clean
            });
          }
        });

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
            message: `Running verification tests: ${this.config.verification.commands.join(', ')}...`
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
            message: summary.allPassed ? '✔ All verification tests passed' : `❌ Verification test failure (${summary.failedCount} failed)`
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

        const gate = makeGateDecision(evaluation, attempt, maxRetries);
        phaseDecision = gate.decision;
        retryFeedback = gate.feedback;

        options.onProgress?.({
          sessionId,
          storyKey,
          phase: skill.phase,
          skillName: skill.skillName,
          eventType: 'gate',
          message: `Gate Decision: ${gate.decision}`
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
        await this.stateManager.setError(`Escalated to human after ${totalRetries} retries in phase ${skill.phase}`);
        break;
      }
    }

    // Determine target status transition based on starting status and gate decision
    let nextStatus = currentStoryStatus;
    if (finalDecision === 'APPROVE') {
      if (currentStoryStatus === 'backlog') nextStatus = 'ready-for-dev';
      else if (currentStoryStatus === 'ready-for-dev' || currentStoryStatus === 'in-progress') nextStatus = 'review';
      else if (currentStoryStatus === 'review') nextStatus = 'done';

      if (!options.dryRun) {
        // Persist status change directly to sprint-status.yaml on disk!
        await updateStoryStatus(this.config.paths.sprintStatus, storyKey, nextStatus as any);
        await updateLastUpdated(this.config.paths.sprintStatus);
      }
    } else if (finalDecision === 'RETRY_WITH_FEEDBACK' && currentStoryStatus === 'review') {
      nextStatus = 'in-progress';
      if (!options.dryRun) {
        await updateStoryStatus(this.config.paths.sprintStatus, storyKey, 'in-progress');
      }
    }

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
