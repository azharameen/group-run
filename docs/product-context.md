# Product Context

> **Last updated: 2026-07-29**

## 1. Business Context

### 1.1 Problem Statement

Siemens, as a global technology company with over 170 years of innovation, generates thousands of patentable inventions annually. The current process for identifying, validating, and filing patent ideas is:

- **Manual**: Engineers and researchers must manually document and submit invention disclosures
- **Slow**: The pipeline from idea to filing can take months
- **Inconsistent**: Quality varies based on individual expertise
- **Resource-intensive**: Requires significant IP counsel and manager time

### 1.2 Solution

The Siemens Patent Ideator automates the patent idea pipeline using a multi-agent AI system:

1. **Discover** patentable ideas from knowledge base content or user-provided signals
2. **Validate** through 18 sequential workflow states with gate checklists
3. **Score** across 7 weighted patentability criteria
4. **Review** with human-in-the-loop approval at critical stages
5. **Produce** submission-ready patent disclosure documents

### 1.3 Key Differentiators

| Differentiator | Description |
| ---------------- | ------------- |
| **Multi-Agent Architecture** | 11 specialized AI agents, each with domain-specific expertise |
| **DeepAgents Runtime** | Built on LangChain's production-grade agent framework |
| **Human-in-the-Loop** | Critical review stages require human approval |
| **Full Provenance** | Every decision, score, and artifact has traceable metadata |
| **Siemens-Aligned** | All ideas evaluated against Siemens strategic domains |

## 2. User Personas

### 2.1 Persona: Patent Analyst (Primary)

| Attribute | Description |
| ----------- | ------------- |
| **Role** | Patent analyst or innovation manager |
| **Goal** | Generate and validate patentable ideas efficiently |
| **Pain Points** | Manual research, inconsistent documentation, slow review cycles |
| **Needs** | Automated idea generation, transparent reasoning, real-time progress |
| **Technical Level** | Moderate — comfortable with web applications |

### 2.2 Persona: Manager/Reviewer

| Attribute | Description |
| ----------- | ------------- |
| **Role** | Engineering manager or department head |
| **Goal** | Approve/reject patent ideas for their team |
| **Pain Points** | Too many submissions to review manually, lack of structured data |
| **Needs** | Clear review packets, score summaries, approval workflow |
| **Technical Level** | Low — needs simple approval/reject interface |

### 2.3 Persona: IP Counsel

| Attribute | Description |
| ----------- | ------------- |
| **Role** | Intellectual property attorney |
| **Goal** | Validate patentability and determine filing strategy |
| **Pain Points** | Incomplete disclosures, missing prior art analysis |
| **Needs** | Complete IdeaScope documents, prior art references, novelty assessment |
| **Technical Level** | Low — needs structured legal documents |

### 2.4 Persona: System Administrator

| Attribute | Description |
| ----------- | ------------- |
| **Role** | Platform engineer or IT administrator |
| **Goal** | Maintain and configure the system |
| **Pain Points** | Configuration complexity, monitoring gaps |
| **Needs** | Configurable thresholds, observability, system statistics |
| **Technical Level** | High — comfortable with configuration and monitoring |

## 3. Strategic Alignment

### 3.1 Siemens Technology Domains

The system evaluates ideas against Siemens strategic domains:

| Domain | Sub-Domains |
| -------- | ------------- |
| **Digital Industries** | Industrial Automation, PLM, Industrial Edge, Digital Twin, Industrial AI |
| **Smart Infrastructure** | Building Automation, Smart Grid, EV Charging, Cybersecurity |
| **Mobility** | Rail Automation, Rail Electrification, Intelligent Traffic |
| **Healthineers** | Medical Imaging, Diagnostics, Digital Health |
| **Financial Services** | Equipment Financing, Digital Payments |
| **Cross-Cutting** | AI/ML, Digital Twin, Edge Computing, Additive Manufacturing |

### 3.2 Scoring Alignment

The 7-criterion scoring engine weights Siemens-specific criteria:

| Criterion | Weight | Siemens Relevance |
| ----------- | -------- | ------------------- |
| novelty | 25% | Prior art gap analysis |
| siemens_alignment | 15% | Strategic domain match |
| technical_feasibility | 15% | Implementation viability |
| detectability | 10% | Infringement detection |
| business_value | 15% | Siemens market impact |
| originality | 10% | Non-obviousness |
| completeness | 10% | Documentation quality |

## 4. Success Metrics

| Metric | Target | Measurement |
| -------- | -------- | ------------- |
| Ideas generated per cycle | 3+ | Pipeline output |
| Ideas reaching filing threshold | 50%+ | Score ≥ 70 |
| Average time to submission-ready | < 1 hour | Pipeline duration |
| Human approval rate | 80%+ | Approval/rejection ratio |
| System uptime | 99.9% | Health check |

## 5. Related Documents

- [PRD](./prd.md) — Product requirements and user stories
- [Architecture](./architecture.md) — System architecture
- [Features](./features.md) — Complete feature tree
- [Architecture Decisions](./architecture-decisions.md) — ADR log
- [Tasks](./tasks.md) — Implementation task hierarchy
