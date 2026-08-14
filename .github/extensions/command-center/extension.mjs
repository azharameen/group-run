import { createServer } from "node:http";
import { promises as fs, watch } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { joinSession, createCanvas, CanvasError } from "@github/copilot-sdk/extension";
import * as jules from "./jules-client.mjs";
import { normalizeJulesSession } from "./services/jules-service.mjs";
import { buildBoardState, buildNextActionSuggestion, buildJulesTaskPrompt, decorateBoardState, loadThemePreference, saveThemePreference, summarizeState, renderHtml, parseDeferredWork } from "./commander.mjs";

const CANVAS_ID = "command-center";
const CANVAS_NAME = "Command Center";
const DEFAULT_ARTIFACT_ROOT = "_bmad-output";
const THEME_PREFERENCE_FILE = path.join(os.homedir(), ".copilot", "extensions", "command-center", "theme-preference.json");
const instances = new Map();
// SSE clients keyed by instanceId -> Array<ServerResponse>
const sseClients = new Map();
// Map<instanceId, Map<itemId, { sessionName, state, url, prUrl, origin, startedAt, endedAt, lastMessage, lastPolledAt }>>
const julesState = new Map();
const JULES_STATE_FILE = path.join(os.homedir(), ".copilot", "extensions", "command-center", "jules-sessions.json");
const JULES_TERMINAL_STATES = new Set(["COMPLETED", "FAILED", "DELETED"]);

function getInstanceJules(instanceId) {
    if (!julesState.has(instanceId)) julesState.set(instanceId, new Map());
    return julesState.get(instanceId);
}

function sessionTimestamp(session, names) {
    for (const name of names) {
        if (session?.[name]) return session[name];
    }
    return null;
}

async function pollJulesSessions(instanceId, entry, targetItemId = null) {
    const sessions = getInstanceJules(instanceId);
    const results = [];
    let updated = 0;
    for (const [itemId, current] of sessions) {
        if (targetItemId && itemId !== targetItemId) continue;
        if (JULES_TERMINAL_STATES.has(current.state)) {
            results.push({ itemId, state: current.state, skipped: true });
            continue;
        }
        try {
            const summary = await jules.getSessionSummary(current.sessionName);
            const raw = summary.raw || {};
            const next = {
                ...current,
                state: summary.state || current.state,
                url: summary.url || current.url,
                prUrl: summary.prUrl || current.prUrl,
                title: summary.title || current.title,
                lastMessage: summary.lastMessage || current.lastMessage,
                startedAt: current.startedAt || sessionTimestamp(raw, ["startTime", "createTime", "createdAt"]),
                endedAt: sessionTimestamp(raw, ["endTime", "completedAt", "updatedAt"]) || current.endedAt,
                lastPolledAt: new Date().toISOString(),
            };
            sessions.set(itemId, next);
            results.push({ itemId, state: next.state, lastMessage: next.lastMessage });
            updated += 1;
        } catch (error) {
            results.push({ itemId, state: current.state, error: error.message || String(error) });
        }
    }
    entry.state.jules = julesStateSnapshot(instanceId);
    if (updated) await saveJulesState();
    return { updated, results };
}

async function loadJulesState(targetInstanceId = null) {
    try {
        const text = await fs.readFile(JULES_STATE_FILE, "utf8");
        const data = JSON.parse(text);
        if (Array.isArray(data)) {
            for (const { instanceId, itemId, entry } of data) {
                if (!itemId || !entry?.sessionName) continue;
                getInstanceJules(targetInstanceId || instanceId).set(itemId, entry);
            }
        }
    } catch { /* first run, ignore */ }
}

async function saveJulesState() {
    const rows = [];
    for (const [instanceId, itemMap] of julesState) {
        for (const [itemId, entry] of itemMap) {
            rows.push({ instanceId, itemId, entry });
        }
    }
    try {
        await fs.mkdir(path.dirname(JULES_STATE_FILE), { recursive: true });
        await fs.writeFile(JULES_STATE_FILE, JSON.stringify(rows, null, 2), "utf8");
    } catch { /* ignore write errors */ }
}

function julesStateSnapshot(instanceId) {
    const map = getInstanceJules(instanceId);
    return Object.fromEntries(
        [...map.entries()].map(([itemId, entry]) => [itemId, {
            sessionName: entry.sessionName,
            state: entry.state,
            url: entry.url,
            prUrl: entry.prUrl,
            title: entry.title,
            origin: entry.origin || "canvas",
            startedAt: entry.startedAt || null,
            endedAt: entry.endedAt || null,
            lastMessage: entry.lastMessage,
            lastPolledAt: entry.lastPolledAt,
        }])
    );
}

let sessionRef;
let knownWorkspacePath = process.cwd();

async function refreshInstance(instanceId) {
    const entry = instances.get(instanceId);
    if (!entry) {
        throw new CanvasError("instance_not_found", `Unknown canvas instance: ${instanceId}`);
    }
    entry.state = await buildBoardState(entry.context);
    entry.stateRefreshedAt = new Date().toISOString();
    return entry.state;
}

async function startServer(instanceId, state) {
    let entry = instances.get(instanceId);
    if (entry) {
        entry.state = state;
        return entry;
    }

    const server = createServer(async (req, res) => {
        const url = new URL(req.url || "/", "http://127.0.0.1");
        const currentEntry = instances.get(instanceId);

        if (!currentEntry) {
            res.statusCode = 410;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ error: "instance_closed" }));
            return;
        }

        if (url.pathname === "/") {
            res.statusCode = 200;
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.end(renderHtml(instanceId, currentEntry.state));
            return;
        }

        if (url.pathname === "/api/state") {
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify(currentEntry.state));
            return;
        }

        if (url.pathname === "/api/theme" && req.method === "POST") {
            let body = "";
            for await (const chunk of req) {
                body += chunk;
            }
            try {
                const parsed = body ? JSON.parse(body) : {};
                const savedTheme = await saveThemePreference(parsed.theme);
                currentEntry.state.themePreference = savedTheme;
                res.statusCode = 200;
                res.setHeader("Content-Type", "application/json; charset=utf-8");
                res.end(JSON.stringify(currentEntry.state));
            } catch (error) {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json; charset=utf-8");
                res.end(JSON.stringify({ error: error?.message || String(error) }));
            }
            return;
        }

        if (url.pathname === "/api/refresh" && req.method === "POST") {
            try {
                const jules = currentEntry.state.jules || julesStateSnapshot(instanceId);
                currentEntry.state = await buildBoardState(currentEntry.context);
                currentEntry.state.jules = jules;
                currentEntry.stateRefreshedAt = new Date().toISOString();
                res.statusCode = 200;
                res.setHeader("Content-Type", "application/json; charset=utf-8");
                res.end(JSON.stringify(currentEntry.state));
                        // Broadcast classification update to connected SSE clients
                        try {
                            const list = sseClients.get(instanceId) || [];
                            const payload = { nextAction: currentEntry.state.nextAction, classificationCounts: currentEntry.state.classificationCounts || {}, updatedAt: new Date().toISOString() };
                            for (const r of list) {
                                try { r.write(`event: classification\n`); r.write(`data: ${JSON.stringify(payload)}\n\n`); } catch (e) { }
                            }
                        } catch (e) { }
                    } catch (error) {
                res.statusCode = 500;
                res.setHeader("Content-Type", "application/json; charset=utf-8");
                res.end(JSON.stringify({ error: error?.message || String(error) }));
            }
            return;
        }

        // Jules API proxy routes — allow iframe to dispatch/poll without exposing API key
        if (url.pathname === "/api/jules/key-set") {
            const hasKey = !!(await jules.resolveApiKey());
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ hasKey }));
            return;
        }

        if (url.pathname === "/api/jules/sources" && req.method === "GET") {
            try {
                const sources = await jules.listSources();
                res.statusCode = 200;
                res.setHeader("Content-Type", "application/json; charset=utf-8");
                res.end(JSON.stringify({ sources: sources.map((s) => ({ name: s.name, repo: s.githubRepo })) }));
            } catch (err) {
                res.statusCode = 500;
                res.setHeader("Content-Type", "application/json; charset=utf-8");
                res.end(JSON.stringify({ error: err.message || String(err), code: err.code }));
            }
            return;
        }

        if (url.pathname === "/api/jules/sessions" && req.method === "GET") {
            try {
                const sessions = await jules.listSessions(100);
                res.statusCode = 200;
                res.setHeader("Content-Type", "application/json; charset=utf-8");
                res.end(JSON.stringify({
                    sessions: sessions.map((session) => normalizeJulesSession(session)),
                }));
            } catch (err) {
                res.statusCode = 500;
                res.setHeader("Content-Type", "application/json; charset=utf-8");
                res.end(JSON.stringify({ error: err.message || String(err), code: err.code }));
            }
            return;
        }

        if (url.pathname === "/api/jules/dispatch" && req.method === "POST") {
            let body = "";
            for await (const chunk of req) body += chunk;
            try {
                const input = JSON.parse(body || "{}");
                const { itemId, prompt, sourceId, branch, autoCreatePr = true, requirePlanApproval = true } = input;
                const item = currentEntry.state.workLookup?.[itemId]
                    || currentEntry.state.lookup?.[itemId]
                    || currentEntry.state.referenceDocuments?.find((c) => c.id === itemId);
                if (!item) throw { code: "item_not_found", message: `No board item found for id: ${itemId}` };
                if (!["task", "subtask", "deferred"].includes(item.kind)) {
                    throw { code: "unsupported_item", message: "Jules delegation is available only for tasks, subtasks, and deferred items." };
                }

                const taskPrompt = buildJulesTaskPrompt(currentEntry.state, item, prompt);
                const session = await jules.createSession({ prompt: taskPrompt, title: `[BMad] ${item.title}`.slice(0, 100), sourceId, branch, autoCreatePr, requirePlanApproval });
                const julesEntry = {
                    sessionName: session.name,
                    state: session.state,
                    url: session.url,
                    prUrl: null,
                    title: session.title || taskPrompt.slice(0, 80),
                    origin: "canvas",
                    startedAt: session.startTime || session.createTime || new Date().toISOString(),
                    endedAt: null,
                    lastMessage: null,
                    lastPolledAt: new Date().toISOString(),
                };
                getInstanceJules(instanceId).set(itemId, julesEntry);
                currentEntry.state.jules = julesStateSnapshot(instanceId);
                await saveJulesState();
                res.statusCode = 200;
                res.setHeader("Content-Type", "application/json; charset=utf-8");
                res.end(JSON.stringify({ sessionId: session.name, url: session.url, state: session.state, stateLabel: jules.stateLabel(session.state) }));
            } catch (err) {
                res.statusCode = 500;
                res.setHeader("Content-Type", "application/json; charset=utf-8");
                res.end(JSON.stringify({ error: err.message || String(err), code: err.code }));
            }
            return;
        }

        if (url.pathname === "/api/jules/poll" && req.method === "POST") {
            let body = "";
            for await (const chunk of req) body += chunk;
            try {
                const { itemId: targetId } = JSON.parse(body || "{}");
                const { updated, results } = await pollJulesSessions(instanceId, currentEntry, targetId || null);
                res.statusCode = 200;
                res.setHeader("Content-Type", "application/json; charset=utf-8");
                res.end(JSON.stringify({ updated, results, jules: currentEntry.state.jules }));
            } catch (err) {
                res.statusCode = 500;
                res.setHeader("Content-Type", "application/json; charset=utf-8");
                res.end(JSON.stringify({ error: err.message || String(err) }));
            }
            return;
        }

        if (url.pathname === "/events" && req.method === "GET") {
            res.writeHead(200, {
                "Content-Type": "text/event-stream; charset=utf-8",
                "Cache-Control": "no-cache, no-transform",
                Connection: "keep-alive",
            });
            res.write("retry: 10000\n\n");

            // register this response so other parts of the server can broadcast to all listeners
            const clients = sseClients.get(instanceId) || [];
            clients.push(res);
            sseClients.set(instanceId, clients);

            let closed = false;
            let busy = false;

            const send = (eventName, payload) => {
                const list = sseClients.get(instanceId) || [];
                for (const r of list) {
                    try {
                        r.write(`event: ${eventName}\n`);
                        r.write(`data: ${JSON.stringify(payload)}\n\n`);
                    } catch (e) {
                        // ignore client write errors
                    }
                }
            };

            const tick = async () => {
                if (closed || busy) return;
                busy = true;
                try {
                    if ((currentEntry.state.jules && Object.keys(currentEntry.state.jules).length) || getInstanceJules(instanceId).size) {
                        const { results, jules: julesSnapshot } = await pollJulesSessions(instanceId, currentEntry, null);
                        send("jules", { results, jules: julesSnapshot, nextAction: currentEntry.state.nextAction, updatedAt: new Date().toISOString() });
                    } else {
                        send("jules", { jules: currentEntry.state.jules || {}, nextAction: currentEntry.state.nextAction, updatedAt: new Date().toISOString() });
                    }
                } catch (error) {
                    send("error", { error: error?.message || String(error) });
                } finally {
                    busy = false;
                }
            };

            const interval = setInterval(tick, 30000);
            tick();

            req.on("close", () => {
                closed = true;
                clearInterval(interval);
                // remove this response from the clients list
                const list = sseClients.get(instanceId) || [];
                const idx = list.indexOf(res);
                if (idx !== -1) list.splice(idx, 1);
                if (!list.length) sseClients.delete(instanceId);
            });
            return;
        }

        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: "not_found" }));
    });

    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });

    const address = server.address();
    const port = typeof address === "object" && address ? address.port : null;
    if (!port) {
        server.close();
        throw new Error("Failed to allocate a loopback port for the canvas server.");
    }

    entry = {
        server,
        url: `http://127.0.0.1:${port}/`,
        state,
        context: null,
        stateRefreshedAt: new Date().toISOString(),
        watcher: null,
    };
    instances.set(instanceId, entry);

    // Try to install a filesystem watcher on the artifact root so we can refresh classification
    (async () => {
        try {
            const artifactRoot = entry.state?.artifactRootPath || path.resolve(process.cwd(), DEFAULT_ARTIFACT_ROOT);
            await fs.stat(artifactRoot);
            const w = watch(artifactRoot, { recursive: true }, async (eventType, filename) => {
                if (!filename) return;
                try {
                    if (entry._refreshTimer) clearTimeout(entry._refreshTimer);
                    entry._refreshTimer = setTimeout(async () => {
                        try {
                            entry.state = await buildBoardState(entry.context);
                            entry.stateRefreshedAt = new Date().toISOString();
                            const payload = { nextAction: entry.state.nextAction, classificationCounts: entry.state.classificationCounts || {}, updatedAt: new Date().toISOString() };
                            const list = sseClients.get(instanceId) || [];
                            for (const r of list) {
                                try { r.write(`event: classification\n`); r.write(`data: ${JSON.stringify(payload)}\n\n`); } catch (e) { }
                            }
                        } catch (e) { }
                    }, 240);
                } catch (e) { }
            });
            entry.watcher = w;
        } catch (e) {
            // ignore watcher install failures
        }
    })();

    return entry;
}

async function refreshCanvasInstance(instanceId) {
    const entry = instances.get(instanceId);
    if (!entry) {
        throw new CanvasError("instance_not_found", `Unknown canvas instance: ${instanceId}`);
    }
    entry.state = await buildBoardState(entry.context);
    entry.stateRefreshedAt = new Date().toISOString();
    return entry.state;
}

sessionRef = await joinSession({
    canvases: [
        createCanvas({
            id: CANVAS_ID,
            displayName: CANVAS_NAME,
            description: "Command Center for BMad work hierarchy, Jules sessions, and reference documentation.",
            inputSchema: {
                type: "object",
                additionalProperties: false,
                properties: {
                    artifactRoot: {
                        type: "string",
                        description: "Repo-relative path to the BMad artifact root or compatible artifact tree.",
                        default: DEFAULT_ARTIFACT_ROOT,
                    },
                    boardFile: {
                        type: "string",
                        description: "Optional repo-relative JSON or YAML file for a generic board mode.",
                    },
                    mode: {
                        type: "string",
                        enum: ["auto", "bmad", "generic"],
                        default: "auto",
                        description: "Choose automatic BMad detection or a generic fallback board file.",
                    },
                },
            },
            actions: [
                {
                    name: "refresh_board",
                    description: "Reloads the board from disk and returns the latest summary.",
                    handler: async (ctx) => {
                        const entry = instances.get(ctx.instanceId);
                        if (!entry) {
                            throw new CanvasError("instance_not_found", `Unknown canvas instance: ${ctx.instanceId}`);
                        }
                        entry.state = await buildBoardState(entry.context);
                        entry.stateRefreshedAt = new Date().toISOString();
                        return summarizeState(entry.state);
                    },
                },
                {
                    name: "inspect_item",
                    description: "Returns the parsed board item or document for a given id.",
                    inputSchema: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            id: {
                                type: "string",
                                description: "The board item or document id to inspect.",
                            },
                        },
                        required: ["id"],
                    },
                    handler: async (ctx) => {
                        const entry = instances.get(ctx.instanceId);
                        if (!entry) {
                            throw new CanvasError("instance_not_found", `Unknown canvas instance: ${ctx.instanceId}`);
                        }
                        const id = String(ctx.input?.id || "");
                        const item = entry.state.workLookup?.[id]
                            || entry.state.lookup?.[id]
                            || entry.state.referenceDocuments?.find((candidate) => candidate.id === id);
                        if (!item) {
                            throw new CanvasError("item_not_found", `No board item found for id: ${id}`);
                        }
                        return item;
                    },
                },
                {
                    name: "list_jules_sources",
                    description: "Lists GitHub repositories connected to Jules so you can find the sourceId for this repo.",
                    handler: async () => {
                        try {
                            const sources = await jules.listSources();
                            return { sources: sources.map((s) => ({ name: s.name, repo: s.githubRepo })) };
                        } catch (err) {
                            throw new CanvasError(err.code || "jules_error", err.message || String(err));
                        }
                    },
                },
                {
                    name: "dispatch_to_jules",
                    description: "Delegates a task or subtask to Jules for autonomous coding. The prompt includes its BMad hierarchy, child subtasks, and read-only story specification context when available.",
                    inputSchema: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            itemId: { type: "string", description: "The task or subtask id to delegate." },
                            prompt: { type: "string", description: "Optional override prompt. If omitted, the canvas builds a read-only context prompt." },
                            sourceId: { type: "string", description: "Jules source resource name, e.g. 'sources/github-owner-repo'. Required unless the repo is already detected." },
                            branch: { type: "string", description: "Branch for Jules to work from. Defaults to repo default." },
                            autoCreatePr: { type: "boolean", description: "If true, Jules automatically opens a PR when done. Default true." },
                            requirePlanApproval: { type: "boolean", description: "If true, Jules pauses after planning so you can review before it codes. Default true for safety." },
                        },
                        required: ["itemId"],
                    },
                    handler: async (ctx) => {
                        const entry = instances.get(ctx.instanceId);
                        if (!entry) throw new CanvasError("instance_not_found", `Unknown canvas instance: ${ctx.instanceId}`);

                        const { itemId, prompt, sourceId, branch, autoCreatePr = true, requirePlanApproval = true } = ctx.input || {};
                        const item = entry.state.workLookup?.[itemId]
                            || entry.state.lookup?.[itemId]
                            || entry.state.referenceDocuments?.find((c) => c.id === itemId);
                        if (!item) throw new CanvasError("item_not_found", `No board item found for id: ${itemId}`);
                        if (!["task", "subtask", "deferred"].includes(item.kind)) {
                            throw new CanvasError("unsupported_item", "Jules delegation is available only for tasks, subtasks, and deferred items.");
                        }

                        const taskPrompt = buildJulesTaskPrompt(entry.state, item, prompt);

                        const sessionTitle = `[BMad] ${item.title}`.slice(0, 100);

                        let session;
                        try {
                            session = await jules.createSession({
                                prompt: taskPrompt,
                                title: sessionTitle,
                                sourceId: sourceId || undefined,
                                branch: branch || undefined,
                                autoCreatePr,
                                requirePlanApproval,
                            });
                        } catch (err) {
                            throw new CanvasError(err.code || "jules_error", err.message || String(err));
                        }

                        const julesEntry = {
                            sessionName: session.name,
                            state: session.state,
                            url: session.url,
                            prUrl: session.output?.pullRequest?.url || null,
                            title: session.title || sessionTitle,
                            origin: "canvas",
                            startedAt: session.startTime || session.createTime || new Date().toISOString(),
                            endedAt: null,
                            lastMessage: null,
                            lastPolledAt: new Date().toISOString(),
                        };
                        getInstanceJules(ctx.instanceId).set(itemId, julesEntry);
                        entry.state.jules = julesStateSnapshot(ctx.instanceId);
                        await saveJulesState();

                        return {
                            sessionId: session.name,
                            url: session.url,
                            state: session.state,
                            stateLabel: jules.stateLabel(session.state),
                            itemId,
                            message: "Jules session created. Use poll_jules_status to track progress.",
                        };
                    },
                },
                {
                    name: "poll_jules_status",
                    description: "Polls the current state of all active Jules sessions tracked by this board. Returns a status summary per item. Automatically updates the board state so the UI reflects the latest Jules progress.",
                    inputSchema: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            itemId: { type: "string", description: "If provided, only poll this item's Jules session." },
                        },
                    },
                    handler: async (ctx) => {
                        const entry = instances.get(ctx.instanceId);
                        if (!entry) throw new CanvasError("instance_not_found", `Unknown canvas instance: ${ctx.instanceId}`);
                        const { updated, results } = await pollJulesSessions(ctx.instanceId, entry, ctx.input?.itemId || null);
                        return { updated, results };
                    },
                },
                {
                    name: "suggest_next_action",
                    description: "Returns the next best BMad action for the current board state, including whether Jules can handle it.",
                    handler: async (ctx) => {
                        const entry = instances.get(ctx.instanceId);
                        if (!entry) throw new CanvasError("instance_not_found", `Unknown canvas instance: ${ctx.instanceId}`);
                        return entry.state.nextAction || buildNextActionSuggestion(entry.state);
                    },
                },
            ],
            open: async (ctx) => {
                const workspacePath = ctx.session?.workingDirectory || sessionRef?.workspacePath || knownWorkspacePath || process.cwd();
                knownWorkspacePath = workspacePath;
                const input = ctx.input || {};
                const state = await buildBoardState({ workingDirectory: workspacePath, input });
                // Load any persisted Jules sessions and attach to state
                await loadJulesState(ctx.instanceId);
                state.jules = julesStateSnapshot(ctx.instanceId);
                const entry = await startServer(ctx.instanceId, state);
                entry.context = { workingDirectory: workspacePath, input };
                entry.state = state;
                instances.set(ctx.instanceId, entry);
                return {
                    title: state.title || CANVAS_NAME,
                    url: entry.url,
                    status: state.notices?.length ? state.notices[0] : "Ready",
                };
            },
            onClose: async (ctx) => {
                const entry = instances.get(ctx.instanceId);
                if (!entry) {
                    return;
                }
                instances.delete(ctx.instanceId);
                try {
                    if (entry.watcher && typeof entry.watcher.close === 'function') {
                        try { entry.watcher.close(); } catch (e) { }
                    }
                    const list = sseClients.get(ctx.instanceId) || [];
                    for (const r of list) {
                        try { r.end(); } catch (e) { }
                    }
                    sseClients.delete(ctx.instanceId);
                } catch (e) { }
                await new Promise((resolve) => entry.server.close(() => resolve()));
            },
        }),
    ],
    hooks: {
        onSessionStart: async () => {
            const workspacePath = sessionRef?.workspacePath;
            if (workspacePath) {
                knownWorkspacePath = workspacePath;
            }
            if (sessionRef) {
                await sessionRef.log("Command Center extension loaded", { ephemeral: true });
            }
        },
    },
});

if (sessionRef?.workspacePath) {
    knownWorkspacePath = sessionRef.workspacePath;
}
