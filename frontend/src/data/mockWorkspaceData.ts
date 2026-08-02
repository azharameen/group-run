import type {
	StaticFile,
	AgentTaskItem,
	SystemMetricItem,
	ActivityLogItem,
	TaskAgent,
} from "@/types/workspace";

// ─── Workspace File System ─────────────────────────────────────────────────────

export const STATIC_FILES: StaticFile[] = [
	{
		path: "docs/file_tree.md",
		filename: "file_tree.md",
		ext: ".md",
		size_bytes: 489,
		modified_at: new Date().toISOString(),
		content: `# File Tree: Agentic Organization Web Prototype

agentic-org/
├── docker-compose.yml       # PostgreSQL, Redis, Backend, Frontend
├── .env.example              # Environment variables template
├── README.md                 # Project overview and setup guide
└── backend/
    ├── Dockerfile
    ├── pyproject.toml        # Python dependencies (FastAPI, SQLModel, etc.)
    ├── alembic.ini           # Database migrations config
    └── app/
        ├── main.py           # FastAPI app entry point
        └── api/
            ├── router.py     # Main API router
            ├── goals.py      # POST/GET /api/goals
            └── tasks.py      # CRUD /api/tasks
`,
	},
	{
		path: "docs/system_design.md",
		filename: "system_design.md",
		ext: ".md",
		size_bytes: 612,
		modified_at: new Date().toISOString(),
		content: `# System Design: Agentic Organization Web Prototype

## Architecture Overview
The platform utilizes a multi-agent workflow architecture where specialized agents handle different stages of product definition, technical architectural design, source code generation, and validation.

## Orchestration Engine
The orchestrator coordinates transitions between states and validates criteria using gate checklists.
`,
	},
	{
		path: "docs/architect.plantuml",
		filename: "architect.plantuml",
		ext: ".plantuml",
		size_bytes: 284,
		modified_at: new Date().toISOString(),
		content: `@startuml
actor User
participant Orchestrator
participant "Research Agent" as Research
participant "Architect Agent" as Architect

User -> Orchestrator : Submit Idea
Orchestrator -> Research : Run Deep Research
Research --> Orchestrator : Research Dossier
Orchestrator -> Architect : Define Technical Specs
@enduml
`,
	},
	{
		path: "docs/class_diagram.plantuml",
		filename: "class_diagram.plantuml",
		ext: ".plantuml",
		size_bytes: 218,
		modified_at: new Date().toISOString(),
		content: `@startuml
class Idea {
  +String id
  +String title
  +String phase
  +Float compositeScore
}
class AgentTask {
  +String id
  +String title
  +String status
  +String agentName
}
Idea "1" *-- "many" AgentTask
@enduml
`,
	},
	{
		path: "docs/er_diagram.plantuml",
		filename: "er_diagram.plantuml",
		ext: ".plantuml",
		size_bytes: 242,
		modified_at: new Date().toISOString(),
		content: `@startuml
entity "Idea" {
  * idea_id : UUID <<PK>>
  --
  title : TEXT
  phase : VARCHAR
  composite_score : NUMERIC
}
entity "Artifact" {
  * artifact_id : UUID <<PK>>
  --
  idea_id : UUID <<FK>>
  name : TEXT
  content : TEXT
}
Idea ||--o{ Artifact
@enduml
`,
	},
	{
		path: "docs/sequence_diagram.plantuml",
		filename: "sequence_diagram.plantuml",
		ext: ".plantuml",
		size_bytes: 234,
		modified_at: new Date().toISOString(),
		content: `@startuml
loop Until Pipeline Completes
  Orchestrator -> Agent : Assign Task
  Agent -> LLM : Generate Content
  LLM --> Agent : Response
  Agent -> Gate : Validate Output
  Gate --> Orchestrator : Status (Passed/Failed)
end
@enduml
`,
	},
	{
		path: ".wiki.md",
		filename: ".wiki.md",
		ext: ".md",
		size_bytes: 182,
		modified_at: new Date().toISOString(),
		content: `# Companion Wiki

Welcome to the Siemens Companion Engine Wiki. This is the centralized knowledge repository for platform developers.
`,
	},
];

// ─── Agent Tasks ───────────────────────────────────────────────────────────────

export const DEFAULT_TASK_ITEMS: AgentTaskItem[] = [
	{
		id: "task_1",
		title: "Design System Architecture & Core Specs",
		agent: "Bob (Architect)",
		status: "In Progress",
		thought: "Compiling architectural requirements and plantuml sequence diagrams...",
		priority: "High",
	},
	{
		id: "task_2",
		title: "Generate Web Prototype & Layouts",
		agent: "Alex (Engineer)",
		status: "To Do",
		thought: "Queued behind core architecture specification definition...",
		priority: "High",
	},
	{
		id: "task_3",
		title: "Write Research & Competitive Dossier",
		agent: "David (Data Analyst)",
		status: "Completed",
		thought: "Synthesized literature review and competitive analysis inside docs/...",
		priority: "Medium",
	},
	{
		id: "task_4",
		title: "Validate PRD Requirements & Gate Checklists",
		agent: "Emma (Product Manager)",
		status: "Completed",
		thought: "Verified all user stories and gate criteria.",
		priority: "Medium",
	},
	{
		id: "task_5",
		title: "Security & Authorization Audit",
		agent: "Siemens Security",
		status: "Needs Review",
		thought: "Awaiting approval on token authorization schema.",
		priority: "High",
	},
];

// ─── Assignable Task Agents ────────────────────────────────────────────────────

export const TASK_AGENTS: TaskAgent[] = [
	{ id: "agent_bob", label: "Bob (Architect)" },
	{ id: "agent_alex", label: "Alex (Engineer)" },
	{ id: "agent_david", label: "David (Data Analyst)" },
	{ id: "agent_emma", label: "Emma (Product Manager)" },
	{ id: "agent_security", label: "Siemens Security" },
];

// ─── System Performance Metrics ───────────────────────────────────────────────

export const DEFAULT_SYSTEM_METRICS: SystemMetricItem[] = [
	{
		id: "metric_fidelity",
		label: "Fidelity Core",
		value: "94.2%",
		valueColor: "text-primary",
	},
	{
		id: "metric_reliability",
		label: "Reliability",
		value: "99.8%",
		valueColor: "text-emerald-600",
	},
	{
		id: "metric_agents",
		label: "Agents",
		value: "4 / 6",
	},
	{
		id: "metric_queue",
		label: "Task Queue",
		value: "0 Active",
	},
];

// ─── Agent Activity Log ────────────────────────────────────────────────────────

export const DEFAULT_ACTIVITY_LOG: ActivityLogItem[] = [
	{
		id: "act_1",
		badgeLabel: "Research",
		badgeColor: "bg-blue-600",
		description: "David compiled research documents inside `/workspace/research/`",
		timestamp: "Just now",
	},
	{
		id: "act_2",
		badgeLabel: "Architect",
		badgeColor: "bg-purple-600",
		description: "Bob initialized system design diagrams and layout flow",
		timestamp: "5 mins ago",
	},
];
