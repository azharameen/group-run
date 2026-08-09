# Milestone 1 Codebase Analysis: Hardcoded Logic & Refactoring Strategy

## Executive Summary
This analysis identifies all hardcoded skill routing rules, status mutator functions, status transition logic, and gate decision rules within the `bmad-cc` codebase. To transform `bmad-cc` into a pure Supervisor Agent-driven framework, these deterministic TypeScript control loops must be refactored into LLM-guided decision-making and BMad skill execution.

---

## 1. Hardcoded Skill Routing Rules

### 1.1 `src/supervisor/skill-router.ts`
- **Function**: `routeSkillsForStory` (Lines 13–97)
- **Code Snippet**:
  ```ts
  export function routeSkillsForStory(
    storyKey: string,
    storyStatus: string,
    storyContent: string,
    epicStatus: string,
    allStoriesInEpicDone: boolean
  ): SkillInvocation[] {
    const skills: SkillInvocation[] = [];
    const statusLower = (storyStatus || 'backlog').toLowerCase();

    switch (statusLower) {
      case 'backlog':
        skills.push({ skillName: 'bmad-create-story', phase: 'create', priority: 0, required: true, ... });
        break;
      case 'ready-for-dev':
      case 'in-progress': {
        const lowerContent = storyContent.toLowerCase();
        if (statusLower === 'ready-for-dev') {
          if (lowerContent.includes('ui') || lowerContent.includes('component') || ...) {
            skills.push({ skillName: 'bmad-ux', phase: 'develop', priority: -2, ... });
          }
          if (lowerContent.includes('architecture') || lowerContent.includes('invariant') || ...) {
            skills.push({ skillName: 'bmad-architecture', phase: 'develop', priority: -1, ... });
          }
        }
        skills.push({ skillName: 'bmad-dev-story', phase: 'develop', priority: 0, ... });
        break;
      }
      case 'review':
        skills.push({ skillName: 'bmad-code-review', phase: 'review', priority: 0, ... });
        break;
      case 'done':
        break;
    }

    if (allStoriesInEpicDone && statusLower === 'done') {
      skills.push({ skillName: 'bmad-retrospective', phase: 'retrospective', priority: 10, ... });
    }
    return skills.sort((a, b) => a.priority - b.priority);
  }
  ```
- **Analysis**: Uses a rigid TypeScript `switch` statement on status values (`backlog`, `ready-for-dev`, `in-progress`, `review`, `done`) combined with naive substring checks (`lowerContent.includes('ui')`, `lowerContent.includes('architecture')`). Hardcodes BMad skill names (`bmad-create-story`, `bmad-ux`, `bmad-architecture`, `bmad-dev-story`, `bmad-code-review`, `bmad-retrospective`).

### 1.2 `src/session/story-executor.ts`
- **Line Numbers**: Lines 111–117, Line 125
- **Code Snippet**:
  ```ts
  const skillInvocations = routeSkillsForStory(
    storyKey,
    currentStoryStatus,
    storyContent,
    epicStatus,
    false
  );
  ...
  for (const skill of skillInvocations) {
    if (options.skipReview && skill.phase === 'review') continue;
  ```
- **Analysis**: Invokes `routeSkillsForStory` to retrieve hardcoded skill sequences and iterates over them programmatically.

### 1.3 `src/supervisor/supervisor-agent.ts`
- **Line Numbers**: Lines 56–62, Line 67
- **Code Snippet**:
  ```ts
  const skills = routeSkillsForStory(
    storyKey,
    currentStatus,
    storySpec.content,
    sprintStatus.epicStatus,
    sprintStatus.allStoriesInEpicDone
  );
  ...
  for (const skill of skills) {
    if (options.skipReview && skill.phase === 'review') continue;
  ```
- **Analysis**: Parallel hardcoded invocation of `routeSkillsForStory` inside the `SupervisorAgent` class.

### 1.4 Command CLI Enablers (`src/commands/run.ts`, `src/cli/run-command.ts`, `src/commands/tui.ts`)
- **Line Numbers**:
  - `src/commands/run.ts`: Lines 154
  - `src/cli/run-command.ts`: Line 132
  - `src/commands/tui.ts`: Line 164
- **Code Snippet**:
  ```ts
  activeSkill = initialStatus === 'review' ? 'bmad-code-review' : 'bmad-dev-story';
  ```
- **Analysis**: Direct fallback assignment of skills based on status strings.

### 1.5 `src/sprint/sprint-status-parser.ts`
- **Function**: `getNextActionableStory` (Lines 91–100)
- **Code Snippet**:
  ```ts
  export function getNextActionableStory(status: SprintStatus): string | null {
    const allStories = Object.keys(status.developmentStatus).filter((key) => /^\d+-\d+-/.test(key));
    const readyStory = allStories.find((key) => status.developmentStatus[key] === 'ready-for-dev');
    if (readyStory) return readyStory;
    const backlogStory = allStories.find((key) => status.developmentStatus[key] === 'backlog');
    return backlogStory || null;
  }
  ```
- **Analysis**: Hardcoded priority ordering selecting `ready-for-dev` before `backlog`.

---

## 2. Hardcoded Status Mutator Functions & Transition Logic

### 2.1 `src/sprint/sprint-status-updater.ts`
- **Functions**: `updateYamlKey`, `updateStoryStatus`, `updateEpicStatus`, `updateLastUpdated` (Lines 5–39)
- **Code Snippet**:
  ```ts
  export async function updateStoryStatus(filePath: string, storyKey: string, newStatus: StoryStatusValue): Promise<void> {
    await updateYamlKey(filePath, ['development_status', storyKey], newStatus);
  }

  export async function updateEpicStatus(filePath: string, epicKey: string, newStatus: StoryStatusValue): Promise<void> {
    await updateYamlKey(filePath, ['development_status', epicKey], newStatus);
  }

  export async function updateLastUpdated(filePath: string): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    ...
    doc.set('last_updated', today);
    ...
  }
  ```
- **Analysis**: Serves as direct filesystem mutators modifying YAML documents programmatically. Currently invoked by fixed TypeScript status transition logic.

### 2.2 `src/session/story-executor.ts`
- **Line Numbers**: Lines 312–333
- **Code Snippet**:
  ```ts
  // Determine target status transition based on starting status and gate decision
  let nextStatus = currentStoryStatus;
  if (finalDecision === 'APPROVE') {
    if (currentStoryStatus === 'backlog') nextStatus = 'ready-for-dev';
    else if (currentStoryStatus === 'ready-for-dev' || currentStoryStatus === 'in-progress') nextStatus = 'review';
    else if (currentStoryStatus === 'review') nextStatus = 'done';

    if (!options.dryRun) {
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
  ```
- **Analysis**: Contains a hardcoded state machine. Status progressions (`backlog -> ready-for-dev -> review -> done` and failed review `review -> in-progress`) are hardcoded in procedural TypeScript statements.

### 2.3 `src/supervisor/supervisor-agent.ts`
- **Line Numbers**: Lines 112–128
- **Code Snippet**:
  ```ts
  let nextStatus = currentStatus;
  if (finalDecision === 'APPROVE') {
    if (currentStatus === 'backlog') nextStatus = 'ready-for-dev';
    else if (currentStatus === 'ready-for-dev' || currentStatus === 'in-progress') nextStatus = 'review';
    else if (currentStatus === 'review') nextStatus = 'done';
  } else if (finalDecision === 'RETRY_WITH_FEEDBACK' && currentStatus === 'review') {
    nextStatus = 'in-progress';
  }
  ```
- **Analysis**: Duplemented hardcoded status transition state machine inside `SupervisorAgent`.

### 2.4 `src/state/state-manager.ts`
- **Functions**: `updatePhase`, `markStoryCompleted`, `markStorySkipped` (Lines 75–101)
- **Analysis**: Programmatically mutates state tracking `_bmad/state.json`.

---

## 3. Hardcoded Gate Decision Logic & Checks

### 3.1 `src/supervisor/gate-decision.ts`
- **Function**: `makeGateDecision` (Lines 16–60)
- **Code Snippet**:
  ```ts
  export function makeGateDecision(
    evaluation: EvaluationReport,
    retryCount: number,
    maxRetries: number
  ): GateDecision {
    const reviewOk = !evaluation.reviewFindings || 
      (evaluation.reviewFindings.critical === 0 && evaluation.reviewFindings.high === 0);
    
    if (evaluation.testsPassed && reviewOk && evaluation.acCompletion.percentage >= 80) {
      return {
        decision: 'APPROVE',
        reason: 'Tests passed, no critical/high review findings, and AC completion >= 80%.',
        retryCount,
        maxRetries
      };
    }

    if (retryCount >= maxRetries) {
      return {
        decision: 'ESCALATE_TO_HUMAN',
        reason: `Max retries (${maxRetries}) exceeded. Errors: ${evaluation.errors.join(', ')}`,
        retryCount,
        maxRetries
      };
    }

    const feedbackParts = [];
    if (!evaluation.testsPassed) {
      feedbackParts.push(`Test failure output: ${evaluation.testOutput.substring(0, 2000)}`);
    }
    if (!reviewOk) {
      feedbackParts.push(`Review findings found: Critical/High issues need resolution.`);
    }
    if (evaluation.acCompletion.percentage < 80) {
      feedbackParts.push(`AC completion too low (${evaluation.acCompletion.percentage}%). Please complete all remaining Acceptance Criteria.`);
    }

    return {
      decision: 'RETRY_WITH_FEEDBACK',
      reason: 'Criteria not met for approval, retrying with feedback.',
      feedback: feedbackParts.join('\n'),
      retryCount,
      maxRetries
    };
  }
  ```
- **Analysis**: Hardcodes approval threshold rules (`testsPassed && reviewOk && acCompletion.percentage >= 80`), hardcodes review severity thresholds (`critical === 0 && high === 0`), and assembles feedback using hardcoded string templates.

### 3.2 `src/supervisor/result-evaluator.ts`
- **Function**: `evaluateResult` (Lines 19–66)
- **Code Snippet**:
  ```ts
  export async function evaluateResult(...): Promise<EvaluationReport> {
    const testsPassed = testExitCode === 0;
    ...
    if (reviewOutput) {
      reviewFindings = {
        critical: (reviewOutput.match(/critical/gi) || []).length,
        high: (reviewOutput.match(/high/gi) || []).length,
        medium: (reviewOutput.match(/medium/gi) || []).length,
        low: (reviewOutput.match(/low/gi) || []).length
      };
    }
    ...
    const acLines = specContent.split('\n').filter(l => l.trim().startsWith('- ['));
    completedAc = acLines.filter(l => l.trim().startsWith('- [x]') || l.trim().startsWith('- [X]')).length;
  ```
- **Analysis**: Uses regex pattern matching on plain text (`/critical/gi`, `/high/gi`) and markdown line prefixes (`- [x]`) to construct artificial metrics.

### 3.3 `src/session/story-executor.ts` & `src/supervisor/supervisor-agent.ts`
- **Line Numbers**:
  - `story-executor.ts`: Lines 145–309
  - `supervisor-agent.ts`: Lines 69–109
- **Code Snippet**:
  ```ts
  while (phaseDecision === 'RETRY_WITH_FEEDBACK' && attempt <= maxRetries) {
    ...
    const gate = makeGateDecision(evaluation, attempt, maxRetries);
    phaseDecision = gate.decision;
    retryFeedback = gate.feedback;
    ...
    attempt++;
    totalRetries++;
  }
  ```
- **Analysis**: Procedural while-loop retry mechanism that depends on hardcoded gate decision objects.

---

## 4. Recommended Refactoring Strategies

### Strategy 1: Dynamic Supervisor Agent Skill Routing
- **Objective**: Eliminate `skill-router.ts` static switch statements.
- **Approach**:
  1. Define a Supervisor Agent Prompt / Directive Schema where the Supervisor LLM receives the story specification, full sprint status, and available BMad skill descriptions.
  2. The Supervisor Agent dynamically decides which BMad skill(s) to execute based on story objectives, current repository state, and contextual intent (e.g. recommending `bmad-ux` for front-end stories or `bmad-architecture` for structural changes without relying on regex keyword matches).

### Strategy 2: LLM-Driven Quality Gate Evaluation & Tailored Feedback
- **Objective**: Replace `gate-decision.ts` and `result-evaluator.ts` regex rules.
- **Approach**:
  1. Feed test execution output, git diff summaries, review artifacts, and story acceptance criteria directly into a Supervisor Evaluation prompt.
  2. The Supervisor LLM performs nuanced analysis of whether acceptance criteria are truly satisfied, determines the gate outcome (`APPROVE`, `RETRY_WITH_FEEDBACK`, `ESCALATE_TO_HUMAN`), and synthesizes targeted actionable feedback for the sub-agent.

### Strategy 3: Supervisor-Controlled Status Transitions
- **Objective**: Remove hardcoded state machine logic from `story-executor.ts` and `supervisor-agent.ts`.
- **Approach**:
  1. Make target status transition a explicit output of the Supervisor Agent's gate decision JSON payload.
  2. Retain `sprint-status-updater.ts` strictly as an execution tool primitive invoked when the Supervisor Agent decides to persist a status change.

### Strategy 4: Agentic Loop Orchestration in `StoryExecutor`
- **Objective**: Refactor `StoryExecutor` from a rigid procedural controller into an agentic loop runner.
- **Approach**:
  1. Re-architect `StoryExecutor` to execute an iterative loop managed by the Supervisor Agent: `Assemble Context -> Generate Directive -> Execute BMad Skill -> Evaluate Artifacts -> Make Gate & Status Transition Decision`.
