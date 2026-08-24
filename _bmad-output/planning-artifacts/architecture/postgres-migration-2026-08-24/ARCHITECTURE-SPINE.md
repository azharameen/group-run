# Architecture Spine: PostgreSQL Database Migration & Provider Abstraction

**Status:** Final  
**Altitude:** Feature / Platform Component  
**Date:** 2026-08-24  

---

## 1. Architectural Paradigms & Invariants

This architecture establishes a **Provider-Agnostic Relational Database Layer** utilizing the **Repository Pattern**, **Abstract Driver Factories**, and **Dual-Mode Connection Management** (Local Postgres vs Supabase Transaction Pooler).

### Invariant Decisions (ADs)

#### [AD-1] Async-Native Database Driver & Query Engine
- **Binds:** `backend/app/db/`, `backend/app/services/`, all repository modules.
- **Prevents:** Synchronous blocking database calls, driver fragmentation, and dialect lock-in.
- **Rule:** All database operations must use **SQLAlchemy 2.0 (`AsyncEngine`, `AsyncSession`)** with `asyncpg` or `psycopg` (v3). Direct database driver imports (`sqlite3`, `psycopg2`) in domain or route layers are strictly forbidden.

#### [AD-2] Dual-Mode Environment & Provider Abstraction
- **Binds:** `backend/app/config.py`, database connection factory.
- **Prevents:** Vendor lock-in to Supabase or Cloud Run / local environment coupling.
- **Rule:** The system MUST connect via a single environment-driven connection interface:
  - **Local:** Direct Postgres instance (`postgresql+asyncpg://postgres:postgres@localhost:5432/app_db`).
  - **Production (Supabase):** Connection pooling via PgBouncer (`postgresql+asyncpg://postgres.xxxx:[PASSWORD]@aws-0-region.pooler.supabase.com:6543/postgres?ssl=require`).
  - **Provider Swappability:** Changing from Supabase to AWS RDS, GCP Cloud SQL, CockroachDB, or Neon requires ONLY updating `DATABASE_URL` / environment variables.

#### [AD-3] Repository Pattern with Strict Interface Segregation
- **Binds:** `backend/app/repositories/` (`IOrganizationRepository`, `IWorkItemRepository`, `IInterruptRepository`, `IThreadMetadataRepository`).
- **Prevents:** Leakage of SQL/ORM details into FastAPI routes or domain services.
- **Rule:** Domain services and API endpoints MUST depend exclusively on Abstract Base Classes (interfaces). Concrete repository implementations execute queries via AsyncSession injected through FastAPI dependency injection (`Depends(get_db_session)`).

#### [AD-4] LangGraph Checkpointer Migration (`AsyncPostgresSaver`)
- **Binds:** `backend/app/services/thread_manager.py`, `backend/app/orchestrator/supervisor.py`.
- **Prevents:** File system dependencies (`storage/*.sqlite`), thread concurrency bottlenecks, and single-instance locks.
- **Rule:** LangGraph agent state persistence is backed by `langgraph-checkpoint-postgres` (`AsyncPostgresSaver`). Initialization occurs during FastAPI lifespan startup (`app.py`), reusing the shared async connection pool.

#### [AD-5] Schema Versioning & DDL Management (Alembic)
- **Binds:** `backend/alembic/`, database schema definitions.
- **Prevents:** Embedded `CREATE TABLE` logic in python repository files and schema drift between local and production.
- **Rule:** Schema migrations are managed strictly through **Alembic**. Raw DDL execution in Python app code is replaced by Alembic migration scripts.

#### [AD-6] PostgreSQL Test Isolation Strategy
- **Binds:** `backend/tests/`, `conftest.py`.
- **Prevents:** Flaky tests, test pollution, or fallback to in-memory SQLite.
- **Rule:** All automated unit/integration tests run against a dedicated Postgres database/schema or isolated nested transactions (`savepoint`).

#### [AD-7] Zero SQLite Policy & Cleanup
- **Binds:** Entire repository (backend code, tests, scripts, `.gitignore`, documentation).
- **Prevents:** Residual SQLite files, dead code, dangling `langgraph-checkpoint-sqlite` packages, and documentation confusion.
- **Rule:** Every instance of SQLite, `SqliteSaver`, `sqlite3`, and `storage/*.sqlite` is replaced or removed. Zero references to SQLite remain in the codebase.

---

## 2. Structural Component Diagram

```mermaid
graph TD
    subgraph FastAPI Application
        API[API Routes / Controllers] --> |Depends| Service[Domain Services]
        Service --> |Depends| IRepo[Abstract Repositories]
        Supervisor[LangGraph Supervisor] --> |State Checkpoint| PGCheckpointer[AsyncPostgresSaver]
    end

    subgraph Persistence Layer
        IRepo --> |Impl| PostgresRepo[Postgres Repositories]
        PostgresRepo --> |AsyncSession| Engine[SQLAlchemy AsyncEngine / Pool]
        PGCheckpointer --> |Pool| Engine
    end

    subgraph Environment Configuration
        Engine --> Config[Pydantic DatabaseConfig]
        Config --> |Local Env| LocalPG[(Local PostgreSQL 5432)]
        Config --> |Prod Env| SupabasePG[(Supabase PgBouncer 6543)]
        Config --> |Future Env| AWS_RDS[(AWS RDS / Neon / GCP Cloud SQL)]
    end
```

---

## 3. Non-Functional Requirements (NFR Matrix)

| Category | Requirement | Implementation Design |
| :--- | :--- | :--- |
| **Scalability** | High concurrent read/write support | PgBouncer transaction pooling in production; async non-blocking IO (`asyncpg`) |
| **Testability** | Fast, isolated test suite | Pytest AsyncSession fixtures with nested transaction savepoints / rollback |
| **Flexibility** | Provider-agnostic architecture | Environment-driven `DATABASE_URL` + SQLAlchemy abstraction + Repository pattern |
| **Maintainability** | Clean schema version control | Alembic migration scripts tracking DDL history |
| **Security** | Encrypted production transport | SSL Mode (`sslmode=require`) enforced for cloud Postgres (Supabase) |

---

## 4. Deferred Invariants

- Database read-replica routing (Deferred until read volume requires replica splitting).
- Multi-region DB failover routing (Deferred until multi-region deployment is scoped).
