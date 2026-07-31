# UI Design

> **Last updated: 2026-07-29**

## 1. Design System

### 1.1 Stack

| Technology | Purpose |
| ------------ | --------- |
| React 18 + TypeScript | Component framework |
| Vite | Build tool |
| Tailwind CSS | Utility-first styling |
| shadcn/ui | Component library (built on Radix UI) |
| Radix UI | Accessible UI primitives |
| Lucide React | Icon library |

### 1.2 shadcn/ui Configuration

Configured in `frontend/components.json`:

```json
{
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "src/index.css",
    "baseColor": "zinc",
    "cssVariables": true
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

### 1.3 Theme

- **Base color**: Zinc
- **CSS variables**: Enabled
- **Style**: Default (shadcn/ui)
- **Icons**: Lucide React

## 2. Page Structure

### 2.1 Layout

```
┌─────────────────────────────────────────────────────┐
│  AppSidebar (left)  │  SiteHeader                    │
│                     ├────────────────────────────────┤
│                     │  Main Content Area             │
│                     │  (Routes)                      │
│                     │                                │
│                     │                                │
│                     │                                │
│                     ├────────────────────────────────┤
│                     │  RightChatSidebar (transcript) │
└─────────────────────────────────────────────────────┘
```

### 2.2 Routes

| Path | Page | Description |
| ------ | ------ | ------------- |
| `/` | Dashboard | Main dashboard with stats + idea list |
| `/ideas/:ideaId` | IdeaDetail | Full idea detail with tabs |
| `/knowledge-base` | KnowledgeBase | KB document browser |
| `/siemens-controls` | SiemensControls | Siemens-specific controls |

### 2.3 Component Hierarchy

```
App
├── SidebarProvider
│   ├── AppSidebar
│   │   ├── Nav items (Dashboard, Ideas, KB, Siemens)
│   │   └── Status indicators
│   ├── SidebarInset
│   │   ├── SiteHeader
│   │   │   ├── Breadcrumb
│   │   │   ├── Idea title (contextual)
│   │   │   └── Chat toggle button
│   │   └── <Routes>
│   │       ├── Dashboard
│   │       │   ├── Stats cards (total, by phase, avg score)
│   │       │   ├── IdeaCard[] (grid)
│   │       │   └── Action buttons (seed, cycle, pipeline)
│   │       ├── IdeaDetail
│   │       │   ├── Idea info header
│   │       │   ├── Tabs: Overview, Scores, Artifacts, Timeline
│   │       │   ├── WorkflowTimeline
│   │       │   ├── ScoreRadar
│   │       │   ├── IdeaHistoryTimeline
│   │       │   └── ArtifactDiffPanel
│   │       ├── KnowledgeBase
│   │       │   ├── Document list
│   │       │   └── Upload/ingest controls
│   │       └── SiemensControls
│   │           ├── Domain alignment view
│   │           └── Strategy controls
│   └── RightChatSidebar
│       ├── Chat header (idea context)
│       ├── Message list (transcript events)
│       │   ├── User message cards
│       │   ├── Agent thinking cards
│       │   ├── Tool call cards (expandable)
│       │   ├── Subagent activity cards
│       │   ├── Interrupt cards (with action buttons)
│       │   ├── Approval/rejection cards
│       │   └── Error/retry cards
│       ├── AgentTodoPanel
│       └── Chat input
```

## 3. Component Library (shadcn/ui)

### 3.1 Installed Components

The following shadcn/ui components are available:

| Component | Usage |
| ----------- | ------- |
| `Button` | Actions, submissions |
| `Card` | Idea cards, stat cards |
| `Dialog` | Modals, confirmations |
| `Input` | Text inputs |
| `Select` | Dropdown selections |
| `Tabs` | Tabbed interfaces |
| `Badge` | Status indicators |
| `Sidebar` | Navigation layout |
| `Sheet` | Slide-out panels |
| `Tooltip` | Hover information |
| `Separator` | Visual dividers |
| `ScrollArea` | Scrollable containers |

### 3.2 DeepAgents-Specific Components

Located in `frontend/src/components/deepagents/`:

| Component | Purpose | Status |
| ----------- | --------- | -------- |
| `AgentTodoPanel` | Task/progress panel | Implemented |
| `SubagentActivityCard` | Subagent activity display | Implemented |
| `ToolCallTimeline` | Tool call inspection | Implemented |
| `InterruptInbox` | Approval interrupt inbox | Implemented |
| `ArtifactDiffPanel` | Artifact diff viewer | Implemented |

## 4. Data Flow

### 4.1 REST API Flow

```
User Action → Component → api/client.ts → HTTP Request → Backend → Response → Component State Update
```

### 4.2 SSE Streaming Flow

```
Component mounts → Subscribe to /api/sse → Backend pushes events → Component updates reactively
```

### 4.3 Chat/Transcript Flow

```
User types message → POST /api/ideas/{id}/chat/stream → Backend invokes DeepAgents runtime
→ Runtime emits events → SSE stream → RightChatSidebar renders transcript cards
```

## 5. Responsive Behavior

- **Desktop**: Full layout with left sidebar, main content, right chat sidebar
- **Tablet**: Collapsible sidebars, stacked layout
- **Mobile**: Single column, chat as overlay

## 6. Accessibility

- All shadcn/ui components are built on Radix UI primitives with ARIA attributes
- Keyboard navigation supported
- Focus management for dialogs and sidebars
- Color contrast meets WCAG AA standards

## 7. Related Documents

- [Architecture](./architecture.md) — System architecture and data flow
- [PRD](./prd.md) — Product requirements
- [Features](./features.md) — Feature tree
- [Architecture Decisions](./architecture-decisions.md) — ADR log
