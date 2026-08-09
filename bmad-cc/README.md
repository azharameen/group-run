# BMad Command Center (bmad-cc)

Autonomous sprint execution engine for BMad-powered projects. Orchestrates development, code review, testing, and documentation through a Supervisor Agent that dynamically routes to existing BMad skills.

## Features

- **Autonomous Sprint Execution**: Processes stories from sprint-status.yaml end-to-end
- **AI Supervisor Agent**: Dynamic skill routing, result evaluation, and gate decisions
- **Multi-Agent CLI Support**: Pluggable drivers for Antigravity, Gemini, OpenCode, Copilot
- **Crash Recovery**: Atomic state checkpointing with resume capability
- **120s Watchdog**: Detects and recovers from silent agent hangs
- **Human-in-the-Loop Escalation**: Prompts for decisions only when genuinely needed
- **Rich Terminal UI**: Real-time sprint progress, story status, and agent output

## Quick Start

```bash
cd ideator
npx tsx bmad-cc/bin/bmad-cc.ts status    # View sprint status
npx tsx bmad-cc/bin/bmad-cc.ts doctor    # Check compatibility  
npx tsx bmad-cc/bin/bmad-cc.ts run       # Start autonomous execution
```

## Commands

| Command | Description |
|---------|-------------|
| `bmad-cc run` | Start autonomous sprint execution |
| `bmad-cc run --dry-run` | Simulate without invoking agents |
| `bmad-cc run --driver gemini` | Override agent driver |
| `bmad-cc run --story 4-5-hitl` | Execute specific story |
| `bmad-cc status` | Display sprint progress |
| `bmad-cc doctor` | Diagnose compatibility |
| `bmad-cc resume` | Resume from checkpoint |
| `bmad-cc history` | Show session history |
| `bmad-cc config` | View configuration |

## Configuration

Create `.bmad-cc/config.json` in your project root (optional, defaults are sensible):

```json
{
  "agent": {
    "driver": "gemini",
    "model": "gemini-3-flash-preview"
  },
  "limits": {
    "maxRetries": 3,
    "watchdogTimeoutSeconds": 120,
    "sessionTimeoutMinutes": 90
  },
  "verification": {
    "commands": [
      "pytest backend/tests -q",
      "cd frontend && npx vitest run"
    ]
  }
}
```

## Architecture

```
┌─────────────────────────────────────────┐
│         bmad-cc CLI (TypeScript)         │
├─────────────────────────────────────────┤
│ Sprint Parser → Execution Queue         │
│ Supervisor Agent → Skill Router         │
│ Phase Runner → Watchdog → Verifier      │
├─────────────────────────────────────────┤
│     74 BMad Skills (zero recreated)     │
└─────────────────────────────────────────┘
```

## Story Execution Lifecycle

1. **Pre-flight**: Validate story spec, check dependencies
2. **Supervisor Directive**: AI selects BMad skill, generates prompt
3. **Development**: Agent CLI executes bmad-dev-story
4. **Code Review**: Fresh agent session runs bmad-code-review  
5. **Verification**: Run pytest + vitest + hygiene checks
6. **Gate Decision**: APPROVE → next story | RETRY → re-dev | ESCALATE → human

## Development

```bash
cd bmad-cc
npm install
npm test          # Run unit tests
npm run typecheck # Type checking
npm run build     # Build for production
```

## License

Private - Siemens Internal
