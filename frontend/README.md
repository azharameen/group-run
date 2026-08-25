# Frontend — React + Vite

React frontend for the Companion agentic platform. Built with Vite, TypeScript (strict mode), and shadcn/ui components.

## Prerequisites

- **Node.js 24 LTS**
- **npm**

## Setup

```bash
cd frontend
npm install
```

## Running Locally

```bash
# Start development server (auto-reloads)
npm run dev
```

The frontend will be available at **http://localhost:3000**.

### Backend Connection

The dev server proxies `/api` requests to the backend. You must set the proxy target:

```bash
# Windows PowerShell
$env:VITE_API_PROXY="http://localhost:8000"

# macOS/Linux
export VITE_API_PROXY="http://localhost:8000"

# Start the dev server
npm run dev
```

The default proxy target is `http://backend:8000` (Docker hostname), so `VITE_API_PROXY` is required for local development.

```bash
# Set proxy target (Windows PowerShell)
$env:VITE_API_PROXY="http://localhost:8000"
npm run dev
```

## Project Structure

```
frontend/
├── src/
│   ├── api/            # Centralized API clients (REST, SSE)
│   ├── components/     # UI components (shadcn/ui + feature components)
│   │   └── ui/         # shadcn/ui base components
│   ├── hooks/          # Custom React hooks
│   │   ├── useChatStream.ts    # SSE streaming for chat
│   │   ├── useThreadManager.ts # Thread CRUD operations
│   │   └── ...
│   ├── pages/          # Route pages (Chat, Threads, Ideas, KB, Settings)
│   ├── lib/            # Utilities (cn() for class merging)
│   └── types/          # TypeScript type definitions
├── e2e/                # Playwright E2E tests
├── src/__tests__/      # Vitest unit tests
├── playwright.config.ts # E2E test configuration
├── vitest.config.ts     # Unit test configuration
└── package.json
```

## Running Tests

### Unit Tests (Vitest)

```bash
# Run all unit tests
npm test

# Watch mode
npm run test:watch
```

### E2E Tests (Playwright)

```bash
# Install Playwright browsers (first time)
npx playwright install

# Run against local dev server (backend must be running on port 8000)
npm run test:e2e

# Run with browser visible
npm run test:e2e:headed

# Run in Playwright UI mode (interactive)
npm run test:e2e:ui

# Run against Docker Compose stack
npm run test:e2e:docker
```

### Building for Production

```bash
# TypeScript check + Vite build
npm run build

# Preview production build
npm run preview
```

Build output is in `frontend/dist/`.

## Key Concepts

- **API Client:** Use `@/api/client` for REST calls and `@/api/deepagents` for agent/interrupt calls — don't scatter raw `fetch` calls
- **SSE Streaming:** Chat uses the `useChatStream` hook (binds to backend `astream_events`) — don't create raw `EventSource` per component
- **shadcn/ui:** Components from `@/components/ui/` — use these, don't hand-roll equivalents
- **Path Alias:** Use `@/*` → `./src/*` (e.g., `@/components/ui/button`)
- **snake_case APIs:** Backend returns `snake_case` (e.g., `idea_id`) — don't convert to `camelCase`
- **Tailwind CSS:** All styling via Tailwind — no inline styles or CSS modules

## Configuration

| Environment Variable | Purpose | Default |
|---------------------|---------|---------|
| `VITE_API_URL` | Backend API URL | `http://localhost:8000` |
| `VITE_API_PROXY` | Vite dev proxy target | `http://localhost:8000` |
| `PLAYWRIGHT_DEV_BASE_URL` | E2E dev server URL | `http://localhost:3000` |
| `PLAYWRIGHT_DOCKER_BASE_URL` | E2E Docker URL | `http://localhost:3000` |