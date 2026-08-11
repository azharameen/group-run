/**
 * jules-client.mjs
 * Thin Jules REST API client. Stdlib only (Node 18+ fetch).
 *
 * API key resolution order:
 *   1. JULES_API_KEY environment variable
 *   2. ~/.copilot/extensions/command-center/jules-api-key.txt (single line, trimmed)
 *
 * All functions throw { code, message } on non-2xx responses or network errors.
 */

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE_URL = "https://jules.googleapis.com/v1alpha";
const API_KEY_FILES = [
    path.join(os.homedir(), ".copilot", "extensions", "command-center", "jules-api-key.txt"),
    path.join(os.homedir(), ".copilot", "extensions", "bmad-kanban", "jules-api-key.txt"),
];

// ─── Key resolution ────────────────────────────────────────────────────────

let _cachedKey = null;

function normalizeApiKey(value) {
    const text = String(value || "").trim();
    if (!text) return null;
    const assignment = text.match(/^(?:export\s+)?JULES_API_KEY\s*=\s*(.+)$/m);
    const candidate = assignment ? assignment[1].trim() : text;
    return candidate.replace(/^['"]|['"]$/g, "").trim() || null;
}

export async function resolveApiKey() {
    if (_cachedKey) return _cachedKey;
    const envKey = normalizeApiKey(process.env.JULES_API_KEY);
    if (envKey) {
        _cachedKey = envKey;
        return _cachedKey;
    }
    for (const apiKeyFile of API_KEY_FILES) {
        try {
            const fileKey = normalizeApiKey(await fs.readFile(apiKeyFile, "utf8"));
            if (fileKey) {
                _cachedKey = fileKey;
                return _cachedKey;
            }
        } catch {
            // Try the next supported location.
        }
    }
    return null;
}

export function clearApiKeyCache() {
    _cachedKey = null;
}

// ─── HTTP helper ────────────────────────────────────────────────────────────

async function request(method, urlPath, body, apiKey) {
    const key = apiKey || (await resolveApiKey());
    if (!key) {
        throw { code: "missing_api_key", message: "JULES_API_KEY is not set. Add it to your environment or ~/.copilot/extensions/command-center/jules-api-key.txt" };
    }

    const url = urlPath.startsWith("http") ? urlPath : `${BASE_URL}/${urlPath}`;
    const options = {
        method,
        headers: {
            "x-goog-api-key": key,
            "Content-Type": "application/json",
        },
    };
    if (body !== undefined) {
        options.body = JSON.stringify(body);
    }

    let res;
    try {
        res = await fetch(url, options);
    } catch (err) {
        throw { code: "network_error", message: String(err?.message || err) };
    }

    let data;
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
        try { data = await res.json(); } catch { data = {}; }
    } else {
        data = { _body: await res.text() };
    }

    if (!res.ok) {
        throw {
            code: `jules_${res.status}`,
            message: data?.message || data?.error?.message || `Jules API error ${res.status}`,
            status: res.status,
            data,
        };
    }
    return data;
}

// ─── Sources ────────────────────────────────────────────────────────────────

/**
 * List connected GitHub repositories (sources).
 * Returns array of { name, id, githubRepo: { owner, name, private } }
 */
export async function listSources(pageSize = 50) {
    const data = await request("GET", `sources?pageSize=${pageSize}`);
    return data.sources || [];
}

/**
 * Find the source ID for a given GitHub owner/repo.
 * owner and repo are case-insensitive compared.
 */
export async function findSourceId(owner, repo) {
    const sources = await listSources();
    const needle = `${owner}/${repo}`.toLowerCase();
    const match = sources.find((s) => {
        const gr = s.githubRepo;
        if (!gr) return false;
        return `${gr.owner}/${gr.name}`.toLowerCase() === needle;
    });
    return match ? match.name : null; // name is the full resource name e.g. "sources/github-owner-repo"
}

// ─── Sessions ───────────────────────────────────────────────────────────────

/**
 * Create a new Jules coding session.
 * @param {object} opts
 * @param {string} opts.prompt         The task description.
 * @param {string} [opts.title]        Optional session title.
 * @param {string} [opts.sourceId]     Full resource name: "sources/github-owner-repo"
 * @param {string} [opts.branch]       Branch to work from. Defaults to repo default.
 * @param {boolean} [opts.requirePlanApproval]  Pause at AWAITING_PLAN_APPROVAL (default false)
 * @param {boolean} [opts.autoCreatePr]          Use AUTO_CREATE_PR automation mode (default false)
 * @returns {Promise<Session>}
 */
export async function createSession(opts) {
    const body = {
        prompt: opts.prompt,
    };
    if (opts.title) body.title = opts.title;
    if (opts.requirePlanApproval) body.requirePlanApproval = true;
    if (opts.autoCreatePr) body.automationMode = "AUTO_CREATE_PR";
    if (opts.sourceId) {
        body.source = {
            source: opts.sourceId,
        };
        if (opts.branch) {
            body.source.gitHubRepo = { branch: opts.branch };
        }
    }
    return await request("POST", "sessions", body);
}

/**
 * Get a session by its full resource name or session ID.
 */
export async function getSession(sessionName) {
    const path = sessionName.startsWith("sessions/") ? sessionName : `sessions/${sessionName}`;
    return await request("GET", path);
}

/**
 * List sessions (most recent first).
 */
export async function listSessions(pageSize = 20) {
    const data = await request("GET", `sessions?pageSize=${pageSize}`);
    return data.sessions || [];
}

// ─── Activities ─────────────────────────────────────────────────────────────

/**
 * List activities for a session.
 * @param {string} sessionName  e.g. "sessions/1234567"
 * @param {number} [pageSize]
 * @returns {Promise<Activity[]>}
 */
export async function listActivities(sessionName, pageSize = 20) {
    const path = sessionName.startsWith("sessions/") ? sessionName : `sessions/${sessionName}`;
    const data = await request("GET", `${path}/activities?pageSize=${pageSize}`);
    return data.activities || [];
}

/**
 * Get the latest activity summary for a session.
 * Returns { state, lastMessage, lastProgress, artifacts, prUrl }
 */
export async function getSessionSummary(sessionName) {
    const [session, activities] = await Promise.all([
        getSession(sessionName),
        listActivities(sessionName, 50),
    ]);

    let lastMessage = null;
    let lastProgress = null;
    const artifacts = [];
    let prUrl = null;

    for (const act of activities) {
        if (act.agentMessage) lastMessage = act.agentMessage;
        if (act.progressUpdated) lastProgress = act.progressUpdated.description;
        if (act.artifact) artifacts.push(act.artifact);
    }

    if (session.output?.pullRequest) {
        prUrl = session.output.pullRequest.url;
    }

    return {
        state: session.state,
        url: session.url,
        title: session.title || session.prompt?.slice(0, 80),
        lastMessage,
        lastProgress,
        artifacts,
        prUrl,
        raw: session,
    };
}

// ─── Messages ───────────────────────────────────────────────────────────────

/**
 * Send a follow-up message to an in-progress session.
 */
export async function sendMessage(sessionName, message) {
    const p = sessionName.startsWith("sessions/") ? sessionName : `sessions/${sessionName}`;
    return await request("POST", `${p}:sendMessage`, { message });
}

/**
 * Approve a pending plan.
 */
export async function approvePlan(sessionName, planId) {
    const p = sessionName.startsWith("sessions/") ? sessionName : `sessions/${sessionName}`;
    return await request("POST", `${p}:approvePlan`, { planId });
}

// ─── State helpers ──────────────────────────────────────────────────────────

export const TERMINAL_STATES = new Set(["COMPLETED", "FAILED"]);
export const ACTIVE_STATES = new Set(["QUEUED", "PLANNING", "AWAITING_PLAN_APPROVAL", "AWAITING_USER_FEEDBACK", "IN_PROGRESS"]);

export function isTerminal(state) {
    return TERMINAL_STATES.has(state);
}

export function stateLabel(state) {
    const map = {
        STATE_UNSPECIFIED: "Unknown",
        QUEUED: "Queued",
        PLANNING: "Planning",
        AWAITING_PLAN_APPROVAL: "Awaiting approval",
        AWAITING_USER_FEEDBACK: "Awaiting feedback",
        IN_PROGRESS: "In progress",
        PAUSED: "Paused",
        FAILED: "Failed",
        COMPLETED: "Completed",
    };
    return map[state] || state || "Unknown";
}

export function stateEmoji(state) {
    const map = {
        QUEUED: "🔵",
        PLANNING: "🟡",
        AWAITING_PLAN_APPROVAL: "⏸️",
        AWAITING_USER_FEEDBACK: "💬",
        IN_PROGRESS: "🟠",
        PAUSED: "⏸️",
        FAILED: "❌",
        COMPLETED: "✅",
    };
    return map[state] || "⚪";
}

