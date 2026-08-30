# Docker Local Development & Testing

Run the **entire** application stack in Docker for local testing — backend,
Postgres, frontend, Firebase auth/Firestore emulators, and (optionally) a local
Ollama LLM. Nothing needs to run on your machine's terminal: **Docker is the
only runtime dependency**, plus Node.js for running the Playwright E2E suite.

- No local Python/venv, no local Node server, no local Java/Firebase tools.
- The frontend image is built with the emulator URLs baked in, so the app on
  `http://localhost:3000` signs in against the **local** auth emulator, not
  real Google.
- The backend runs the same deterministic **mock LLM** used by CI
  (`DEEPAGENTS_MODEL=openai:test-model`), so chat flows work with no API keys.

## Containers

| Container | Built from | Host ports | Purpose |
|---|---|---|---|
| `ideator-postgres` | `postgres:16-alpine` | `5433` | Postgres 16 (data in `postgres_data` volume) |
| `ideator-backend` | `./backend` | `8000` → 8080 | FastAPI/uvicorn; runs `alembic upgrade head` on start |
| `ideator-frontend` | `./frontend` | `3000` | nginx production build; proxies `/api` → backend |
| `ideator-firebase-emulators` | `docker/firebase-emulators.Dockerfile` | `9099` (auth), `8085` (firestore), `4000` (emulator UI) | Firebase auth + Firestore emulators for project `demo-companion-auth` |
| `ideator-ollama` *(profile `ollama`)* | `ollama/ollama:latest` | `11434` | Optional local LLM for testing the `ollama` provider |

The stack is defined by `docker-compose.yml` (tracked) plus
`docker-compose.override.yml`, which `docker compose` auto-applies for local
use (port/healthcheck fixes, alembic mount, emulator + Ollama services).
Pipelines deploy with the plain `docker-compose.yml` and are unaffected.

## Prerequisites

- **Docker Desktop** (on Windows: enable the WSL 2 backend).
- **Node.js 24** — only needed if you run the Playwright E2E suite (section
  "Run the E2E tests"). Not needed for running or manually testing the stack.
- Python is **not** required. It is only used by one optional one-liner below
  to generate a Fernet key (a PowerShell alternative is provided).

## Step 1 — Create the environment files

### Root `.env` (gitignored)

Fed to the backend container and to the frontend image build. Create
`<repo-root>/.env`:

```dotenv
# Deterministic mock LLM (sentinel handled by the backend test model — no real API call)
DEEPAGENTS_MODEL=openai:test-model
OPENAI_API_KEY=sk-test
OPENAI_MODEL_NAME=gpt-4

# Fernet key used to encrypt user-managed provider credentials at rest.
# Generate once and reuse (see below).
PROVIDER_CREDENTIAL_ENCRYPTION_KEY=<44-char Fernet key>

LANGGRAPH_STRICT_MSGPACK=true

# Firebase Admin — container-name hosts, because the backend runs INSIDE the compose network
FIREBASE_PROJECT_ID=demo-companion-auth
FIREBASE_AUTH_EMULATOR_HOST=firebase-emulators:9099
FIRESTORE_EMULATOR_HOST=firebase-emulators:8085

# Frontend build args (inlined into the frontend image at build time)
# Browser-side emulator URLs use the HOST-published ports, not container names:
VITE_FIREBASE_AUTH_EMULATOR_URL=http://127.0.0.1:9099
VITE_FIRESTORE_EMULATOR_HOST=127.0.0.1:8085
VITE_FIREBASE_API_KEY=fake-api-key
VITE_FIREBASE_AUTH_DOMAIN=demo-companion-auth.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=demo-companion-auth
VITE_FIREBASE_STORAGE_BUCKET=demo-companion-auth.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=000000000000
VITE_FIREBASE_APP_ID=1:000000000000:web:localtest
VITE_FIREBASE_MEASUREMENT_ID=
```

Generate the Fernet key (pick one):

```bash
# Python (needs the cryptography package)
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

```powershell
# PowerShell (any version)
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
([Convert]::ToBase64String($bytes) -replace '\+','-' -replace '/','_')
```

> The key only matters once you save provider credentials in the app; for
> plain smoke testing any valid Fernet key works.

### `frontend/.env.local` (gitignored)

Used **only** by the Vite dev server that Playwright's E2E run boots on the
host (it is never copied into the Docker image — see `frontend/.dockerignore`):

```dotenv
VITE_FIREBASE_AUTH_EMULATOR_URL=http://127.0.0.1:9099
VITE_FIRESTORE_EMULATOR_HOST=127.0.0.1:8085
VITE_FIREBASE_API_KEY=fake-api-key
VITE_FIREBASE_PROJECT_ID=demo-companion-auth
```

## Step 2 — Start the stack

```bash
docker compose up -d --build
```

- First build takes a few minutes (backend image, frontend image, emulators
  image).
- The backend runs `alembic upgrade head` before starting uvicorn, so the
  database is migrated automatically on a fresh volume.
- Wait until the services report `healthy`:

```bash
docker compose ps
```

Expected:

```
ideator-postgres            healthy
ideator-backend             healthy
ideator-frontend            healthy
ideator-firebase-emulators  running
```

Ollama is opt-in:

```bash
docker compose --profile ollama up -d
```

## Step 3 — Verify

```bash
curl.exe -s http://localhost:8000/api/health   # backend  -> 200
curl.exe -s -o /dev/null -w "%{http_code}\n" http://localhost:3000        # frontend -> 200
curl.exe -s -o /dev/null -w "%{http_code}\n" http://localhost:4000        # emulator UI -> 200
```

| URL | What it is |
|---|---|
| <http://localhost:3000> | The app. Sign in with Google — the popup goes to the **local** auth emulator (`127.0.0.1:9099`), no real Google account needed. |
| <http://localhost:8000/api/health> | Backend health |
| <http://localhost:9099> | Firebase **auth** emulator |
| <http://localhost:8085> | **Firestore** emulator |
| <http://localhost:4000> | Firebase Emulator Suite UI (inspect auth users + Firestore data) |
| <http://localhost:11434> | Ollama (only with `--profile ollama`) |

Manual testing notes:

- The application only accepts **Google** sign-in (the backend rejects other
  providers with `unsupported_provider`) — this is by design, and the
  emulator's fake Google credential satisfies it.
- Chat runs on the deterministic mock LLM out of the box. To test a *real*
  provider, configure one under **Settings → Providers** in the app (API keys
  are stored encrypted). For a local `ollama` provider, pull a model first:

  ```bash
  docker exec ideator-ollama ollama pull llama3.2
  ```

  and use endpoint `http://host.docker.internal:11434` in the provider form
  (the backend reaches Ollama through the host bridge — not
  `localhost`, which would be the backend container itself). No API key is
  required for Ollama; the form hides the key field for that provider.

## Run the E2E tests (Playwright)

One-time setup:

```bash
cd frontend
npm ci
npx playwright install
```

Run against the Docker stack:

```powershell
# PowerShell
cd frontend
$env:PLAYWRIGHT_DEV_BASE_URL='http://localhost:3002'
$env:VITE_API_PROXY='http://localhost:8000'
npx playwright test --project=dev                # full suite
npx playwright test --project=dev chat.spec.ts   # single spec
```

```bash
# bash
cd frontend
PLAYWRIGHT_DEV_BASE_URL='http://localhost:3002' \
VITE_API_PROXY='http://localhost:8000' \
npx playwright test --project=dev
```

Why a dev server when everything else is Docker?

- `--project=dev` boots a Vite dev server for the run. Port 3000 is taken by
  the Docker frontend, so `PLAYWRIGHT_DEV_BASE_URL` pins the run to a free
  port (Playwright auto-picks 3001/3002 as well, but pinning is
  deterministic).
- `VITE_API_PROXY` repoints the Vite `/api` proxy at the host-published
  backend port; the Vite default target is the compose-internal hostname
  `backend:8000`, which only resolves inside the Docker network.
- The E2E global setup signs the browser into the auth emulator through an
  app module (`/src/lib/firebase-emulator-testing.ts`) that only exists in
  the Vite dev build — the production nginx image does not ship it. That is
  why `--project=docker` is not supported.
- Everything under test on the *server* side — backend, Postgres, and both
  emulators — runs **in Docker**; Playwright's helper frontend is the only
  host process, and Playwright shuts it down automatically after the run.

The suite resets application state between specs via
`POST /api/testing/reset` and runs with a single worker (see
[Testing Guide](testing.md) for the full E2E strategy).

## Reset & teardown

```bash
docker compose down        # stop + remove containers; Postgres data volume kept
docker compose down -v     # also delete the postgres_data + ollama volumes (fresh DB)
```

- After `down -v`, the next `up` migrates the database from scratch and the
  emulators start empty (auth users and Firestore data are container-local
  and ephemeral).
- `docker compose logs -f backend` (or `frontend`, `firebase-emulators`,
  `ollama`) streams a service's log for debugging.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `docker compose up` blocks with postgres "Waiting" | Postgres init is still running (first start only). It resolves on its own within a minute; if it doesn't, `docker start ideator-backend`. |
| `Empty reply from server` on `9099`/`8085`/`4000` from the host | Emulators must bind `0.0.0.0` inside the container. `firebase.json` sets `"host": "0.0.0.0"` for `auth`, `firestore`, and `ui` — if it was reverted, restore it and `docker compose up -d --force-recreate firebase-emulators`. |
| Google sign-in popup opens `accounts.google.com` instead of `127.0.0.1:9099` | The frontend image was built without the emulator URLs. Check `VITE_FIREBASE_AUTH_EMULATOR_URL` / `VITE_FIRESTORE_EMULATOR_HOST` in the root `.env`, then `docker compose up -d --build frontend`. |
| Backend 401s with `unsupported_provider` for manual curl tests | Expected: only Google sign-in is accepted. Use the app UI (or the emulator Google test credential), not raw email/password emulator sign-ups. |
| E2E fails with "Backend … did not become healthy" | The Docker stack is down or the backend is still starting — `docker compose ps` first. |
| E2E fails to launch a browser | `cd frontend && npx playwright install`. |
| Port conflict (3000/8000/5433/9099/8085/4000/11434 already in use) | Stop the other process, or remap the host port in `docker-compose.override.yml` (and update the matching `.env` / E2E env vars). |

## Related

- [Getting Started](GETTING_STARTED.md) — non-Docker local setup (Python + Node)
- [Testing Guide](testing.md) — E2E strategy, isolation, and spec authoring
- [Deployment](DEPLOYMENT.md) — beta/prod pipeline (uses plain `docker-compose.yml`)
