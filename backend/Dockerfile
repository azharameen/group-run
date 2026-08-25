# Stage 1: Build dependencies in a virtual environment
FROM python:3.12-slim AS builder

WORKDIR /app

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && find /opt/venv -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true

# Stage 2: Final runtime image
FROM python:3.12-slim AS runtime

WORKDIR /app

ENV PATH="/opt/venv/bin:$PATH"
ENV LANGGRAPH_STRICT_MSGPACK=true
ENV APP_ROOT_DIR=/app
ENV STORAGE_DIR=/tmp/storage
ENV PYTHONUNBUFFERED=1

COPY --from=builder /opt/venv /opt/venv

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY app/ ./app/
COPY config/ ./config/
COPY instructions/ ./instructions/
RUN mkdir -p /tmp/storage /tmp/workspace /tmp/knowledge-base

ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT}/api/health || exit 1

CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
