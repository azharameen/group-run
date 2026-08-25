# Deployment Guide

Deploy the Companion application using Docker Compose. The application runs as two services — Backend (FastAPI) and Frontend (Vite + nginx) — communicating via internal Docker networking.

## Prerequisites

- **Docker 24.x+**
- **Docker Compose 2.x**
- **.env file** configured (copy from `.env.example`)

## Quick Start

```bash
# Build and start both services
docker compose up --build

# Run in background
docker compose up --build -d

# Stop services
docker compose down
```

The frontend is available at **http://localhost:3000** and the backend API at **http://localhost:8000**.

## Service Architecture

```
┌─────────────────┐     http:8000     ┌─────────────────┐
│   Frontend      │ ──────────────►   │   Backend       │
│   (nginx:80)    │                   │   (FastAPI)     │
│   Port 3000     │                   │   Port 8000     │
└─────────────────┘                   └─────────────────┘
                                                │
                                           ┌────┴────┐
                                           │ Volumes │
                                           │ config/ │
                                           │workspace│
                                           │  kb/    │
                                           └─────────┘
```

## Configuration

### Environment Variables

Create `.env` from `.env.example` in the project root:

```bash
cp .env.example .env
```

Required for agent features:

| Variable | Purpose | Example |
|----------|---------|---------|
| `OPENAI_API_KEY` | LLM API key | `sk-...` |
| `OPENAI_MODEL_NAME` | Model to use | `gpt-4o` |
| `LANGGRAPH_STRICT_MSGPACK` | **Must be `true`** | `true` |

Optional:

| Variable | Purpose | Default |
|----------|---------|---------|
| `DEEPAGENTS_MODEL` | Override model | Auto-derived from `OPENAI_MODEL_NAME` |
| `MCP_SERVERS` | MCP server JSON config | Empty (no MCP tools) |
| `AGENT_TIMEOUT_SEC` | Agent operation timeout | `120` |

### Volume Mounts

Docker Compose mounts these volumes for persistent data:

| Mount | Container Path | Purpose | Access |
|-------|---------------|---------|--------|
| `./config` | `/app/config` | Teams and MCP config | Read-only |
| `./instructions` | `/app/instructions` | Agent system prompts | Read-only |
| `./workspace` | `/app/workspace` | Agent work artifacts | Read/Write |
| `./knowledge-base` | `/app/knowledge-base` | KB documents | Read/Write |

Create these directories before first run (if they don't already exist in the repo):

```bash
mkdir -p config instructions workspace knowledge-base
# Windows: New-Item -ItemType Directory -Force -Path config,instructions,workspace,knowledge-base
```

Note: `config/` and `instructions/` should already contain `teams.yaml` and system prompts from the repository.

### App Root Directory

`APP_ROOT_DIR=/app` is automatically set by `docker-compose.yml` for the backend service. **Do not change this** — it ensures paths resolve correctly inside the container.

## Health Checks

Both services include health checks:

- **Backend:** `curl -f http://localhost:8000/health` (30s interval, 30s start period)
- **Frontend:** `wget -q --spider http://localhost:80/` (30s interval, 5s start period)

The frontend service waits for the backend to be healthy before starting (`depends_on: condition: service_healthy`).

Check service status:

```bash
docker compose ps
```

Unexpected backend request failures are logged with a request ID and returned
as a safe HTTP 500 response instead of terminating the server. The frontend
logs uncaught browser errors, rejected promises, failed API requests, and
React render failures through the browser console and Firebase exception
events. These handlers report failures; they do not turn failed operations
into successful results.

## Operations

### View Logs

```bash
# All services
docker compose logs -f

# Backend only
docker compose logs -f backend

# Frontend only
docker compose logs -f frontend
```

### Restart After Config Changes

```bash
# Restart with updated config
docker compose restart

# Rebuild after code changes
docker compose up --build
```

### Access Container Shells

```bash
# Backend shell
docker exec -it ideator-backend /bin/bash

# Frontend shell
docker exec -it ideator-frontend /bin/sh
```

## Dockerfile Details

### Backend

- **Base:** Python 3.12 slim image
- **Working directory:** `/app`
- **COPY strategy:** `requirements.txt` first (layer caching), then application code
- **CMD:** `uvicorn app.main:app --host 0.0.0.0 --port 8000`

### Frontend

- **Build stage:** Node.js 24 LTS — installs deps and runs `npm run build`
- **Production stage:** nginx — serves `dist/` static files
- **Build args:** `VITE_API_URL` passed during build for production API URL

## Production Considerations

### Secrets Management

For production, avoid committing `.env`. Use Docker secrets or a secrets manager:

```bash
# Mount .env as a secret
docker compose --env-file /secure/path/.env up -d
```

### Resource Limits

Add to `docker-compose.yml` as needed:

```yaml
services:
  backend:
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '1.0'
```

### Networking

Both services are on the default `compose` network. The frontend reaches the backend via container name `backend:8000` internally, while both expose ports to the host.

## Troubleshooting

### Frontend can't reach backend

- Verify backend health: `docker compose ps` — backend should show `healthy`
- Check backend logs: `docker compose logs backend`
- Verify `VITE_API_URL=http://localhost:8000` in frontend environment

### "Database is locked" in Docker

- Ensure only one backend container is running: `docker compose ps backend`
- On Unix systems: check volume permissions (`chmod 644` on SQLite files)

### MCP tools not loading

- Verify `MCP_SERVERS` env var in `.env` contains valid JSON
- Check backend logs for MCP adapter errors
- Note: MCP tools bypass the permissions model (ADR-013)

### Container exits immediately

- Check logs: `docker compose logs backend`
- Common cause: `LANGGRAPH_STRICT_MSGPACK` not set to `true`
- Common cause: Missing or invalid `OPENAI_API_KEY`

## CI/CD

The project uses GitHub Actions for CI (runs on push/PR to main):

- **Backend lint:** Syntax check + forbidden import check
- **Backend tests:** pytest with 60% coverage minimum
- **Frontend lint:** TypeScript type checking
- **Frontend tests:** Vitest with coverage
- **Frontend build:** Production build verification
- **Security audit:** pip-audit + npm audit

E2E tests (Playwright) are not yet integrated into CI — run locally or in staging.

See `.github/workflows/ci.yml` for pipeline configuration.

## Cloud deployment

Merges to `develop` run **Release - Beta & Deployment Test**. A merged pull
request to `main` runs **Release - Production**. Both workflows:

1. Validate all required configuration before changing the database.
2. Run the Alembic migration gate.
3. Deploy the backend to Cloud Run.
4. Build and deploy the frontend to Firebase Hosting.
5. Verify the backend at `/api/health` and the hosted frontend with HTTP
   smoke checks.

Beta and production intentionally share the same Cloud Run service
(`backend-service`), Firebase Hosting target, and database for now. This is
not concurrent isolation: the most recent successful beta or production
deployment owns the live revision and frontend. Configure a required reviewer
on the `production` GitHub Environment before using the production workflow.

### GitHub Environment configuration

Create `beta` and `production` Environments in repository settings. Put
credentials and connection strings in **Environment secrets**, not variables:

| Environment | Required secrets |
|-------------|------------------|
| `beta` | `GCP_SA_KEY`, `GCP_PROJECT_ID`, `BETA_DATABASE_DIRECT_URL`, `BETA_DATABASE_URL`, `OPENAI_API_KEY` |
| `production` | `GCP_SA_KEY`, `GCP_PROJECT_ID`, `PROD_DATABASE_DIRECT_URL`, `PROD_DATABASE_URL`, `OPENAI_API_KEY` |

`GCP_REGION` is optional and defaults to `asia-south1`. Optional
Environment variables are `GCP_PROJECT_ID`, `CLOUD_RUN_SERVICE`,
`OPENAI_API_BASE`, `OPENAI_MODEL_NAME`, and `DEEPAGENTS_MODEL`; the workflows
default to the current shared service and `gpt-4o-mini` settings when omitted.
Use the same infrastructure values in both Environments until beta needs
independent resources.

### Verify and troubleshoot a deployment

Open the completed workflow run and confirm the migration, Cloud Run, Firebase,
and smoke-check steps are green. The run summary contains the backend URL and
shared-target warning. Then use the URL from the summary:

```bash
curl -fsS "https://<cloud-run-url>/api/health"
curl -fsS "https://<firebase-project-id>.web.app/"
```

Finally open the Firebase URL in a browser and send a chat message. A real
agent response verifies that the runtime `OPENAI_API_KEY` and model settings
were injected into Cloud Run.

### Rollback

For a backend rollback, list revisions and move traffic to the last known
good revision:

```bash
gcloud run revisions list --service backend-service --region asia-south1
gcloud run services update-traffic backend-service \
  --region asia-south1 --to-revisions <known-good-revision>=100
```

For frontend rollback, use the Firebase Hosting release history in the
Firebase console and select the last known good release. Database migrations
are forward-only; restore a database backup or apply a reviewed corrective
migration rather than attempting to reverse production schema changes.