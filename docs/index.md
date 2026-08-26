# Group Run — Companion AI Platform

> **Multi-agent AI workspace** for idea generation, organization management, and knowledge base operations — powered by LangGraph, DeepAgents, FastAPI, and React.

[![CI Pipeline](https://github.com/azharameen/group-run/actions/workflows/ci.yml/badge.svg)](https://github.com/azharameen/group-run/actions/workflows/ci.yml)
[![Deploy – Beta](https://github.com/azharameen/group-run/actions/workflows/release-beta.yml/badge.svg)](https://github.com/azharameen/group-run/actions/workflows/release-beta.yml)
[![Deploy – Production](https://github.com/azharameen/group-run/actions/workflows/release-prod.yml/badge.svg)](https://github.com/azharameen/group-run/actions/workflows/release-prod.yml)
[![Deploy Docs](https://github.com/azharameen/group-run/actions/workflows/docs.yml/badge.svg)](https://github.com/azharameen/group-run/actions/workflows/docs.yml)
[![Heartbeat](https://github.com/azharameen/group-run/actions/workflows/heartbeat.yml/badge.svg)](https://github.com/azharameen/group-run/actions/workflows/heartbeat.yml)
[![CodeQL](https://img.shields.io/badge/CodeQL-enabled-brightgreen?logo=github)](https://github.com/azharameen/group-run/security/code-scanning)
[![License](https://img.shields.io/github/license/azharameen/group-run)](https://github.com/azharameen/group-run/blob/main/LICENSE.md)

---

## What is Group Run?

Group Run is a production-ready AI platform where teams of specialized agents collaborate to solve complex tasks. A **LangGraph supervisor** orchestrates multiple domain agents (Inventor, Validator, Strategist, etc.) that can use MCP-registered tools, maintain persistent memory, and handle human-in-the-loop approval workflows.

## Quick Navigation

Use the tabs above by intent: **Home & Getting Started** for orientation, setup, and deployment; **Product** for requirements and capabilities; **Engineering Hub** for architecture, implementation, quality, operations, and historical material; and **AI & Community** for agent context and contribution resources.

| I want to... | Go to |
|---|---|
| Set up the project locally | [Getting Started](GETTING_STARTED.md) |
| Understand the system architecture | [Architecture Overview](architecture.md) |
| Read the product requirements | [PRD](prd.md) |
| Browse the API endpoints interactively | [Scalar API Reference](api/scalar.md) |
| Check CI/CD pipeline status | [CI/CD Overview](cicd/overview.md) |
| Feed this docs to an AI agent | [For AI Agents](ai-agents/context-guide.md) |
| Read historical/completed planning docs (Phases 0–7) | [Archive](feature-roadmap.md) |

## Live Services

| Service | URL |
|---|---|
| Backend API (Cloud Run) | [https://backend-service-601546984807.asia-south1.run.app/api/health](https://backend-service-601546984807.asia-south1.run.app/api/health) |
| API Docs (Scalar) | [Backend Scalar UI](https://backend-service-601546984807.asia-south1.run.app/scalar) · [MkDocs reference](https://azharameen.github.io/group-run/api/scalar/) |

## Tech Stack

```
Backend:   FastAPI · LangGraph · DeepAgents · PostgreSQL · Python 3.13
Frontend:  React · Vite · TypeScript · Tailwind · shadcn/ui
Infra:     GCP Cloud Run · Firebase Hosting · GitHub Actions · Docker
Agents:    LangGraph Supervisor · MCP Tools · PostgreSQL Checkpointer
```
