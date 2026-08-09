
import { randomUUID } from 'crypto';
import { routeSkillsForStoryAsync, type SkillInvocation } from './skill-router.js';
import { assembleContext } from './context-assembler.js';
import { generateDirective } from './directive-generator.js';
import { evaluateResult } from './result-evaluator.js';
import { makeGateDecision, type GateDecisionType } from './gate-decision.js';
export type { GateDecisionType };

import { HeartbeatMonitor } from '../watchdog/heartbeat-monitor.js';

export interface SupervisorResult {
  storyKey: string;
  finalDecision: GateDecisionType;
  totalRetries: number;
  phases: Array<{ phase: string; skill: string; durationMs: number; outcome: string }>;
  sessionId: string;
  nextStatus?: string;
}

export interface StorySpec {
  title: string;
  filePath: string;
  content: string;
  status: string;
}

export interface SprintStatus {
  epicStatus: string;
  allStoriesInEpicDone: boolean;
  developmentStatus: Record<string, string>;
}

export interface AgentDriver {
  executeSkill(directive: any, options?: { signal?: AbortSignal }): Promise<{ testExitCode: number; testOutput: string; gitDiff: string; changedFiles: string[]; reviewOutput?: string }>;
}

export class SupervisorAgent {
  constructor(
    private projectRoot: string,
    private maxRetries: number
  ) {}

  /** Run the full supervised lifecycle for one story */
  async superviseStory(
    storyKey: string,
    storySpec: StorySpec,
    sprintStatus: SprintStatus,
    driver: AgentDriver,
    options: { dryRun?: boolean; skipReview?: boolean; skipTests?: boolean; abortController?: AbortController; inactivityTimeoutMs?: number } = {}
  ): Promise<SupervisorResult> {
    const sessionId = randomUUID();
    let retryCount = 0;
    const phases: Array<{ phase: string; skill: string; durationMs: number; outcome: string }> = [];
    let finalDecision: GateDecisionType = 'APPROVE';

    const currentStatus = sprintStatus.developmentStatus[storyKey] || storySpec.status || 'backlog';
    
    // Route skills based on ACTUAL story status using dynamic skill catalog & bmad-help discovery
    const skills = await routeSkillsForStoryAsync(
      storyKey,
      currentStatus,
      storySpec.content,
      sprintStatus.epicStatus,
      sprintStatus.allStoriesInEpicDone,
      { projectRoot: this.projectRoot }
    );

    const context = await assembleContext(this.projectRoot);
    
    let lastGateDecision: import('./gate-decision.js').GateDecision | undefined = undefined;

    const activeAbortController = options.abortController || new AbortController();
    const timeoutMs = options.inactivityTimeoutMs || 120000;

    for (const skill of skills) {
      if (options.skipReview && skill.phase === 'review') continue;

      let phaseDecision: GateDecisionType = 'RETRY_WITH_FEEDBACK';
      let retryFeedback: string | undefined = undefined;
      let attempt = 0;
      
      while (phaseDecision === 'RETRY_WITH_FEEDBACK' && attempt <= this.maxRetries) {
        const start = Date.now();
        const directive = generateDirective(storyKey, skill, storySpec, context, retryFeedback, lastGateDecision?.statusUpdateNote);
        
        if (options.dryRun) {
          phases.push({ phase: skill.phase, skill: skill.skillName, durationMs: 0, outcome: 'DRY_RUN' });
          phaseDecision = 'APPROVE';
          break;
        }

        const heartbeat = new HeartbeatMonitor({
          timeoutMs,
          onTimeout: () => activeAbortController.abort(),
          onActivity: () => {}
        });

        heartbeat.start();
        let result: { testExitCode: number; testOutput: string; gitDiff: string; changedFiles: string[]; reviewOutput?: string };
        try {
          result = await driver.executeSkill(directive, { signal: activeAbortController.signal });
        } finally {
          heartbeat.stop();
        }
        
        const evaluation = await evaluateResult(
          storyKey,
          skill.phase,
          options.skipTests ? 0 : result.testExitCode,
          result.testOutput,
          result.gitDiff,
          result.changedFiles,
          storySpec.filePath,
          options.skipReview ? undefined : result.reviewOutput
        );

        const gate = makeGateDecision(evaluation, attempt, this.maxRetries, currentStatus);
        lastGateDecision = gate;
        phaseDecision = gate.decision;
        retryFeedback = gate.feedback;
        
        phases.push({ phase: skill.phase, skill: skill.skillName, durationMs: Date.now() - start, outcome: phaseDecision });
        attempt++;
        retryCount++;
      }
      
      if (phaseDecision === 'ESCALATE_TO_HUMAN') {
        finalDecision = 'ESCALATE_TO_HUMAN';
        break;
      }
    }

    // Target status transition determined agentically by supervisor gate evaluation
    const nextStatus = lastGateDecision?.targetStatus || currentStatus;
    
    return {
      storyKey,
      finalDecision,
      totalRetries: retryCount,
      phases,
      sessionId,
      nextStatus
    };
  }
}

