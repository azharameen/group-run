import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { joinSession, createCanvas, CanvasError } from "@github/copilot-sdk/extension";
import * as jules from "./jules-client.mjs";
import { buildCanonicalWorkModel, classifyReferenceDocuments } from "./services/bmad-model.mjs";
import { normalizeJulesSession } from "./services/jules-service.mjs";

const CANVAS_ID = "command-center";
const CANVAS_NAME = "Command Center";
const DEFAULT_ARTIFACT_ROOT = "_bmad-output";
const THEME_PREFERENCE_FILE = path.join(os.homedir(), ".copilot", "extensions", "command-center", "theme-preference.json");
const instances = new Map();
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

async function loadJulesState() {
    try {
        const text = await fs.readFile(JULES_STATE_FILE, "utf8");
        const data = JSON.parse(text);
        if (Array.isArray(data)) {
            for (const { instanceId, itemId, entry } of data) {
                getInstanceJules(instanceId).set(itemId, entry);
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

function toPosix(value) {
    return String(value || "").replaceAll("\\", "/");
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function slugify(value) {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 120) || "item";
}

function parseScalar(raw) {
    const value = String(raw ?? "").trim();
    if (value === "") {
        return "";
    }
    if (value === "true") {
        return true;
    }
    if (value === "false") {
        return false;
    }
    if (value === "null") {
        return null;
    }
    if (/^-?\d+$/.test(value)) {
        return Number(value);
    }
    if (/^-?\d+\.\d+$/.test(value)) {
        return Number(value);
    }
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        return value.slice(1, -1);
    }
    return value;
}

function parseSimpleYaml(text) {
    const result = {};
    let currentListKey = null;
    let currentObject = null;
    let currentObjectListKey = null;

    const lines = String(text ?? "").split(/\r?\n/);
    for (const line of lines) {
        if (!line.trim() || line.trim().startsWith("#")) {
            continue;
        }

        const objectItemMatch = line.match(/^(\s*)-\s+([^:]+):\s*(.*)$/);
        if (objectItemMatch) {
            const indent = objectItemMatch[1].length;
            const key = objectItemMatch[2].trim();
            const value = parseScalar(objectItemMatch[3]);
            if (indent === 0) {
                currentObject = { [key]: value };
                result.__rootArray ??= [];
                result.__rootArray.push(currentObject);
                currentObjectListKey = null;
            } else if (currentObject) {
                currentObject[key] = value;
                currentObjectListKey = key;
            }
            continue;
        }

        const listItemMatch = line.match(/^(\s*)-\s+(.*)$/);
        if (listItemMatch) {
            const indent = listItemMatch[1].length;
            const value = parseScalar(listItemMatch[2]);
            if (indent === 0) {
                result.__rootArray ??= [];
                result.__rootArray.push(value);
                currentListKey = null;
            } else if (currentObject && currentObjectListKey) {
                currentObject[currentObjectListKey] ??= [];
                currentObject[currentObjectListKey].push(value);
            }
            continue;
        }

        const keyValueMatch = line.match(/^(\s*)([^:]+):\s*(.*)$/);
        if (keyValueMatch) {
            const indent = keyValueMatch[1].length;
            const key = keyValueMatch[2].trim();
            const value = keyValueMatch[3].trim();
            if (indent === 0) {
                if (value === "") {
                    result[key] ??= [];
                    currentListKey = key;
                    currentObject = null;
                    currentObjectListKey = null;
                } else {
                    result[key] = parseScalar(value);
                    currentListKey = null;
                    currentObject = null;
                    currentObjectListKey = null;
                }
            } else if (currentObject) {
                currentObject[key] = parseScalar(value);
            } else if (currentListKey) {
                result[currentListKey] ??= {};
                result[currentListKey][key] = parseScalar(value);
            }
        }
    }

    return result;
}

function parseFrontMatter(text) {
    const source = String(text ?? "");
    if (!source.startsWith("---")) {
        return { frontMatter: {}, body: source };
    }

    const endIndex = source.indexOf("\n---", 3);
    if (endIndex === -1) {
        return { frontMatter: {}, body: source };
    }

    const block = source.slice(3, endIndex).replace(/^\r?\n/, "");
    const body = source.slice(endIndex + 4).replace(/^\r?\n/, "");
    return { frontMatter: parseSimpleYaml(block), body };
}

async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function readTextIfExists(filePath) {
    if (!(await fileExists(filePath))) {
        return null;
    }
    return await fs.readFile(filePath, "utf8");
}

async function loadThemePreference() {
    const raw = await readTextIfExists(THEME_PREFERENCE_FILE);
    if (!raw) {
        return "system";
    }
    try {
        const data = JSON.parse(raw);
        return ["light", "dark", "system"].includes(data?.theme) ? data.theme : "system";
    } catch {
        return "system";
    }
}

async function saveThemePreference(theme) {
    const safeTheme = ["light", "dark", "system"].includes(theme) ? theme : "system";
    await fs.mkdir(path.dirname(THEME_PREFERENCE_FILE), { recursive: true });
    await fs.writeFile(THEME_PREFERENCE_FILE, JSON.stringify({ theme: safeTheme }, null, 2), "utf8");
    return safeTheme;
}

async function walkFiles(rootDir) {
    const files = [];
    async function walk(currentDir) {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                await walk(fullPath);
                continue;
            }
            if (entry.isFile()) {
                files.push(fullPath);
            }
        }
    }
    if (await fileExists(rootDir)) {
        await walk(rootDir);
    }
    return files;
}

function normalizeStatus(status) {
    return String(status ?? "").trim().toLowerCase();
}

function progressBucket(status) {
    const value = normalizeStatus(status);
    if (!value) {
        return "Open";
    }
    if (["done", "complete", "completed", "closed", "resolved"].includes(value)) {
        return "Done";
    }
    if (["in-progress", "in progress", "review", "ready-for-dev", "ready", "active"].includes(value)) {
        return "Active";
    }
    if (["blocked", "blocked-by-dependency"].includes(value)) {
        return "Blocked";
    }
    return "Open";
}

function isBmadStoryFile(filePath) {
    return /(^|[\\/])\d+-\d+-.+\.md$/i.test(filePath);
}

function isBmadDocFile(filePath) {
    return /\.(md|mdx|yaml|yml|json)$/i.test(filePath);
}

function epicPhaseLabel(epicNumber) {
    if (epicNumber === 0) {
        return "Technical prerequisite";
    }
    return `Sprint ${epicNumber}`;
}

function storyIdFromFileName(fileName) {
    const match = fileName.match(/^(\d+)-(\d+)-(.+)\.md$/i);
    if (!match) {
        return null;
    }
    return `ST-${Number(match[1])}.${Number(match[2])}`;
}

function storyKeyFromFileName(fileName) {
    const match = fileName.match(/^(\d+)-(\d+)-(.+)\.md$/i);
    if (!match) {
        return null;
    }
    return `${Number(match[1])}-${Number(match[2])}`;
}

function storyFileStatusKey(storyKey, developmentStatus) {
    const prefix = `${storyKey}-`;
    for (const [key, value] of Object.entries(developmentStatus || {})) {
        if (key.startsWith(prefix)) {
            return normalizeStatus(value);
        }
    }
    return "";
}

function parseSprintStatus(text) {
    const meta = {};
    const developmentStatus = {};
    const actionItems = [];
    const lines = String(text ?? "").split(/\r?\n/);
    let section = "meta";
    let currentAction = null;

    for (const rawLine of lines) {
        const line = rawLine.replace(/\s+$/, "");
        if (!line || line.trim().startsWith("#")) {
            continue;
        }

        if (/^development_status:\s*$/.test(line)) {
            section = "development";
            currentAction = null;
            continue;
        }
        if (/^action_items:\s*$/.test(line)) {
            section = "actions";
            currentAction = null;
            continue;
        }

        if (section === "meta") {
            const match = line.match(/^([^:]+):\s*(.*)$/);
            if (match) {
                meta[match[1].trim()] = parseScalar(match[2]);
            }
            continue;
        }

        if (section === "development") {
            const match = line.match(/^\s{2}([^:]+):\s*(.*)$/);
            if (match) {
                developmentStatus[match[1].trim()] = parseScalar(match[2]);
            }
            continue;
        }

        if (section === "actions") {
            const startMatch = line.match(/^\s{2}-\s+epic:\s*(.*)$/);
            if (startMatch) {
                currentAction = { epic: parseScalar(startMatch[1]) };
                actionItems.push(currentAction);
                continue;
            }
            const fieldMatch = line.match(/^\s{4}([^:]+):\s*(.*)$/);
            if (fieldMatch && currentAction) {
                currentAction[fieldMatch[1].trim()] = parseScalar(fieldMatch[2]);
            }
        }
    }

    return { meta, developmentStatus, actionItems };
}

function parseMarkdownTableRows(text, predicate) {
    const rows = [];
    const lines = String(text ?? "").split(/\r?\n/);
    for (const line of lines) {
        if (!line.startsWith("|")) {
            continue;
        }
        if (line.includes("---")) {
            continue;
        }
        if (predicate && !predicate(line)) {
            continue;
        }
        const cells = line
            .split("|")
            .slice(1, -1)
            .map((cell) => cell.trim());
        rows.push(cells);
    }
    return rows;
}

function parseEpicsMarkdown(text, sourcePath) {
    const source = String(text ?? "");
    const epicRegex = /^###\s+EP-(\d+):\s+(.+)$/gm;
    const epicMatches = [...source.matchAll(epicRegex)];
    const epics = [];

    for (let index = 0; index < epicMatches.length; index += 1) {
        const match = epicMatches[index];
        const startIndex = match.index ?? 0;
        const endIndex = epicMatches[index + 1]?.index ?? source.length;
        const section = source.slice(startIndex, endIndex);
        const epicNumber = Number(match[1]);
        const epicName = match[2].trim();
        const sectionLines = section.split(/\r?\n/);

        let summary = "";
        let userValue = "";
        let dependencies = "";
        let acceptance = "";
        let inTable = false;
        const stories = [];

        for (const line of sectionLines) {
            if (/^\s*\*\*User value:\*\*/.test(line)) {
                userValue = line.replace(/^\s*\*\*User value:\*\*\s*/, "").trim();
                continue;
            }
            if (/^\s*\*\*Dependencies:\*\*/.test(line)) {
                dependencies = line.replace(/^\s*\*\*Dependencies:\*\*\s*/, "").trim();
                continue;
            }
            if (/^\s*\*\*Acceptance:\*\*/.test(line)) {
                acceptance = line.replace(/^\s*\*\*Acceptance:\*\*\s*/, "").trim();
                continue;
            }
            if (!summary && line.trim() && !line.startsWith("|") && !/^###\s+/.test(line) && !/^\*\*/.test(line)) {
                summary = line.trim();
            }
            if (line.startsWith("| Story |")) {
                inTable = true;
                continue;
            }
            if (inTable) {
                if (!line.startsWith("|")) {
                    inTable = false;
                    continue;
                }
                if (line.includes("---")) {
                    continue;
                }
                const cells = line
                    .split("|")
                    .slice(1, -1)
                    .map((cell) => cell.trim());
                if (cells.length >= 4 && /^ST-\d+\.\d+$/.test(cells[0])) {
                    stories.push({
                        id: cells[0],
                        layer: cells[1],
                        title: cells[2],
                        files: cells[3],
                    });
                }
            }
        }

        epics.push({
            id: `epic-${epicNumber}`,
            epicNumber,
            name: epicName,
            title: `EP-${epicNumber}: ${epicName}`,
            status: null,
            phase: epicPhaseLabel(epicNumber),
            summary,
            userValue,
            dependencies,
            acceptance,
            sourcePath,
            stories,
        });
    }

    return epics;
}

function extractHeadingSnippet(text, heading) {
    const source = String(text ?? "");
    const start = source.indexOf(heading);
    if (start === -1) {
        return "";
    }
    const afterHeading = source.slice(start + heading.length);
    const nextHeadingMatch = afterHeading.match(/\n##\s+/);
    const snippet = nextHeadingMatch ? afterHeading.slice(0, nextHeadingMatch.index) : afterHeading;
    return snippet.trim();
}

function parseStoryTasks(body) {
    const lines = String(body ?? "").split(/\r?\n/);
    const tasks = [];
    let inTaskSection = false;
    for (const line of lines) {
        if (/^##\s+Tasks & Acceptance/.test(line)) {
            inTaskSection = true;
            continue;
        }
        if (inTaskSection && /^##\s+/.test(line)) {
            break;
        }
        if (inTaskSection) {
            const match = line.match(/^\s*-\s+\[(x| )\]\s+(.+)$/i);
            if (match) {
                tasks.push({
                    title: match[2].trim(),
                    status: match[1].toLowerCase() === "x" ? "done" : "open",
                });
            }
        }
    }
    return tasks;
}

async function parseBmadBoard(workspacePath, artifactRootPath, themePreference) {
    const implementationRoot = path.join(artifactRootPath, "implementation-artifacts");
    const planningRoot = path.join(artifactRootPath, "planning-artifacts");
    const specsRoot = path.join(artifactRootPath, "specs");
    const sprintStatusPath = path.join(implementationRoot, "sprint-status.yaml");
    const epicsPath = path.join(planningRoot, "epics.md");

    const [sprintText, epicsText] = await Promise.all([
        readTextIfExists(sprintStatusPath),
        readTextIfExists(epicsPath),
    ]);

    if (!sprintText) {
        throw new CanvasError(
            "missing_artifact",
            `Could not find ${toPosix(path.relative(workspacePath, sprintStatusPath)) || sprintStatusPath}.`
        );
    }

    const sprint = parseSprintStatus(sprintText);
    const epicDocs = epicsText ? parseEpicsMarkdown(epicsText, path.relative(workspacePath, epicsPath)) : [];

    const docFiles = (await walkFiles(artifactRootPath)).filter((filePath) => isBmadDocFile(filePath));
    const docItems = [];
    const rawDocs = [];
    const storyDocIndex = new Map();

    for (const filePath of docFiles) {
        const relativePath = path.relative(workspacePath, filePath);
        const fileName = path.basename(filePath);
        const text = await readTextIfExists(filePath);
        if (text == null) {
            continue;
        }

        const { frontMatter, body } = parseFrontMatter(text);
        const kind = fileName.endsWith(".yaml") || fileName.endsWith(".yml") ? "yaml" : fileName.endsWith(".json") ? "json" : "markdown";
        const hasStoryShape = isBmadStoryFile(filePath);

        const storyMeta = hasStoryShape ? frontMatter : {};
        const storyFileKey = hasStoryShape ? storyKeyFromFileName(fileName) : null;
        const storyTasks = hasStoryShape ? parseStoryTasks(body) : [];
        const title = String(storyMeta.title || storyMeta.name || frontMatter.title || fileName.replace(/\.(md|mdx|yaml|yml|json)$/i, ""));
        const status = normalizeStatus(
            storyMeta.status ||
                frontMatter.status ||
                (storyFileKey ? storyFileStatusKey(storyFileKey, sprint.developmentStatus) : "")
        );

        rawDocs.push({
            path: relativePath,
            kind,
            title,
            frontMatter,
            excerpt: body.slice(0, 700).trim(),
        });

        docItems.push({
            id: `doc-${slugify(relativePath)}`,
            kind: hasStoryShape ? "story-file" : "doc",
            title,
            status,
            phase: hasStoryShape && storyFileKey ? `Sprint ${Number(storyFileKey.split("-")[0])}` : "Reference",
            sourcePath: relativePath,
            metadata: {
                ...frontMatter,
                fileName,
                kind,
            },
            tasks: storyTasks,
            body,
        });

        if (hasStoryShape && storyFileKey) {
            storyDocIndex.set(storyFileKey, {
                id: `doc-${slugify(relativePath)}`,
                path: relativePath,
                title,
                status,
                frontMatter,
                body,
                tasks: storyTasks,
            });
        }
    }

    const items = [];
    const lookup = new Map();
    const documentGroups = [];

    for (const epicDoc of epicDocs) {
        const status = normalizeStatus(sprint.developmentStatus[epicDoc.id]);
        const item = {
            id: epicDoc.id,
            kind: "epic",
            title: epicDoc.title,
            status,
            phase: epicDoc.phase,
            sourcePath: epicsPath,
            summary: epicDoc.userValue || epicDoc.summary,
            metadata: {
                epicNumber: epicDoc.epicNumber,
                userValue: epicDoc.userValue,
                dependencies: epicDoc.dependencies,
                acceptance: epicDoc.acceptance,
                storyCount: epicDoc.stories.length,
            },
            raw: epicDoc,
        };
        items.push(item);
        lookup.set(item.id, item);
        for (const story of epicDoc.stories) {
            const storyFileKey = story.id.replace(/^ST-/i, "").replace(".", "-");
            const storyDoc = storyDocIndex.get(storyFileKey);
            const storyStatus = storyDoc?.status || storyFileStatusKey(storyFileKey, sprint.developmentStatus);
            const storyItem = {
                id: `story-${storyFileKey}`,
                kind: "story",
                title: `${story.id} ${story.title}`,
                status: storyStatus,
                phase: epicDoc.phase,
                sourcePath: storyDoc?.path || epicsPath,
                parentId: epicDoc.id,
                summary: story.title,
                metadata: {
                    layer: story.layer,
                    files: story.files,
                    storyFile: storyDoc?.path || null,
                },
                raw: {
                    ...story,
                    status: storyStatus || null,
                    storyFile: storyDoc || null,
                },
            };
            items.push(storyItem);
            lookup.set(storyItem.id, storyItem);
        }
        const retroKey = `epic-${epicDoc.epicNumber}-retrospective`;
        if (sprint.developmentStatus[retroKey] !== undefined) {
            const retroItem = {
                id: retroKey,
                kind: "milestone",
                title: `Epic ${epicDoc.epicNumber} retrospective`,
                status: normalizeStatus(sprint.developmentStatus[retroKey]),
                phase: `${epicDoc.phase} retrospective`,
                sourcePath: sprintStatusPath,
                parentId: epicDoc.id,
                summary: "Retrospective checkpoint",
                metadata: {
                    stage: "retrospective",
                },
            };
            items.push(retroItem);
            lookup.set(retroItem.id, retroItem);
        }
    }

    for (const actionItem of sprint.actionItems) {
        const epicId = `epic-${Number(actionItem.epic)}`;
        const item = {
            id: `action-${slugify(`${actionItem.epic}-${actionItem.action}`)}`,
            kind: "action-item",
            title: actionItem.action,
            status: normalizeStatus(actionItem.status),
            phase: epicId,
            sourcePath: sprintStatusPath,
            parentId: epicId,
            summary: actionItem.action,
            metadata: {
                epic: actionItem.epic,
                owner: actionItem.owner,
            },
        };
        items.push(item);
        lookup.set(item.id, item);
    }

    for (const doc of docItems) {
        items.push(doc);
        lookup.set(doc.id, doc);
        documentGroups.push(doc);
    }

    const counts = {
        epics: items.filter((item) => item.kind === "epic").length,
        stories: items.filter((item) => item.kind === "story").length,
        milestones: items.filter((item) => item.kind === "milestone").length,
        actions: items.filter((item) => item.kind === "action-item").length,
        documents: documentGroups.length,
        tasks: docItems.reduce((sum, doc) => sum + (doc.tasks?.length || 0), 0),
    };

    const statusCounts = items.reduce((acc, item) => {
        const bucket = progressBucket(item.status);
        acc[bucket] = (acc[bucket] || 0) + 1;
        return acc;
    }, {});

    const board = {
        title: sprint.meta.project ? `${sprint.meta.project} Command Center` : CANVAS_NAME,
        mode: "bmad",
        themePreference,
        workspacePath,
        artifactRootPath,
        sourceFiles: {
            sprintStatusPath: path.relative(workspacePath, sprintStatusPath),
            epicsPath: path.relative(workspacePath, epicsPath),
        },
        meta: sprint.meta,
        counts,
        statusCounts,
        items,
        documents: documentGroups,
        rawDocuments: rawDocs,
        lookup: Object.fromEntries(lookup),
        notices: [],
    };

    if (epicsText == null) {
        board.notices.push("planning-artifacts/epics.md not found; showing status ledger and documents only.");
    }

    return board;
}

async function parseGenericBoard(workspacePath, boardFilePath, themePreference) {
    const text = await readTextIfExists(boardFilePath);
    if (!text) {
        throw new CanvasError("missing_artifact", `Could not read ${toPosix(path.relative(workspacePath, boardFilePath))}.`);
    }

    let data;
    if (/\.json$/i.test(boardFilePath)) {
        data = JSON.parse(text);
    } else {
        data = parseSimpleYaml(text);
    }

    return {
        title: data.title || "Kanban Board",
        mode: "generic",
        themePreference,
        workspacePath,
        artifactRootPath: path.dirname(boardFilePath),
        sourceFiles: { boardFilePath: path.relative(workspacePath, boardFilePath) },
        meta: data.meta || {},
        counts: {
            epics: Array.isArray(data.epics) ? data.epics.length : 0,
            stories: Array.isArray(data.stories) ? data.stories.length : 0,
            milestones: Array.isArray(data.milestones) ? data.milestones.length : 0,
            actions: Array.isArray(data.actions) ? data.actions.length : 0,
            documents: Array.isArray(data.documents) ? data.documents.length : 0,
            tasks: Array.isArray(data.tasks) ? data.tasks.length : 0,
        },
        statusCounts: {},
        items: Array.isArray(data.items) ? data.items : [],
        documents: Array.isArray(data.documents) ? data.documents : [],
        rawDocuments: [],
        lookup: {},
        notices: [
            "Generic mode is active. Provide a compatible board JSON/YAML file or switch to a BMad artifact root.",
        ],
    };
}

async function buildBoardState(context) {
    const workspacePath = context.workingDirectory || context.workspacePath || process.cwd();
    const input = context.input || {};
    const mode = String(input.mode || "auto").toLowerCase();
    const artifactRootInput = input.artifactRoot || DEFAULT_ARTIFACT_ROOT;
    const artifactRootPath = path.resolve(workspacePath, artifactRootInput);
    const boardFileInput = input.boardFile ? path.resolve(workspacePath, input.boardFile) : null;
    const themePreference = await loadThemePreference();

    if (boardFileInput && (await fileExists(boardFileInput))) {
        return decorateBoardState(await parseGenericBoard(workspacePath, boardFileInput, themePreference));
    }

    if (mode === "generic") {
        return decorateBoardState({
            title: CANVAS_NAME,
            mode: "generic",
            themePreference,
            workspacePath,
            artifactRootPath,
            sourceFiles: {},
            meta: {},
            counts: { epics: 0, stories: 0, milestones: 0, actions: 0, documents: 0, tasks: 0 },
            statusCounts: {},
            items: [],
            documents: [],
            rawDocuments: [],
            lookup: {},
            notices: [
                "Generic mode is active but no board file was provided.",
                "Point this canvas at a board JSON/YAML file or switch to a BMad artifact root.",
            ],
        });
    }

    const sprintStatusPath = path.join(artifactRootPath, "implementation-artifacts", "sprint-status.yaml");
    if (await fileExists(sprintStatusPath)) {
        return decorateBoardState(await parseBmadBoard(workspacePath, artifactRootPath, themePreference));
    }

    return decorateBoardState({
        title: CANVAS_NAME,
        mode: "generic",
        themePreference,
        workspacePath,
        artifactRootPath,
        sourceFiles: {},
        meta: {},
        counts: { epics: 0, stories: 0, milestones: 0, actions: 0, documents: 0, tasks: 0 },
        statusCounts: {},
        items: [],
        documents: [],
        rawDocuments: [],
        lookup: {},
        notices: [
            `No BMad artifacts found under ${toPosix(path.relative(workspacePath, artifactRootPath) || artifactRootInput)}.`,
            "The canvas still opens, but you need to point it at a compatible artifact root or board file.",
        ],
    });
}

function summarizeState(state) {
    const items = Array.isArray(state.items) ? state.items : [];
    const counts = items.reduce(
        (acc, item) => {
            acc.total += 1;
            acc.byKind[item.kind] = (acc.byKind[item.kind] || 0) + 1;
            acc.byStatus[item.status || "unassigned"] = (acc.byStatus[item.status || "unassigned"] || 0) + 1;
            return acc;
        },
        { total: 0, byKind: {}, byStatus: {} }
    );
    return {
        total: counts.total,
        byKind: counts.byKind,
        byStatus: counts.byStatus,
        workCounts: state.workCounts || {},
        referenceDocuments: state.referenceDocuments?.length || 0,
        notices: state.notices || [],
        title: state.title,
        mode: state.mode,
    };
}

function buildNextActionSuggestion(state) {
    const items = Array.isArray(state.workItems) ? state.workItems : (Array.isArray(state.items) ? state.items : []);
    const openStories = items.filter((item) => item.kind === "story" && ["open", "Open", "ready-for-dev", "backlog"].includes(item.status));
    const reviewStories = items.filter((item) => item.kind === "story" && ["review", "in-review"].includes(item.status));
    const openActions = items.filter((item) => item.kind === "action-item" && ["open", "Open", "in-progress"].includes(item.status));
    const allEpics = items.filter((item) => item.kind === "epic");
    const allDone = allEpics.length > 0 && allEpics.every((epic) => ["done", "Done"].includes(epic.status));

    let skill = null;
    let agent = null;
    let reason = null;
    let sessionReuse = true;
    let julesCanHandle = false;
    let julesPrompt = null;
    let targetItemId = null;

    if (reviewStories.length > 0) {
        skill = "bmad-code-review";
        reason = `${reviewStories.length} story(ies) are in review. Run code review before moving on.`;
    } else if (openActions.length > 0) {
        const item = openActions[0];
        targetItemId = item.id;
        skill = "bmad-quick-dev";
        agent = "bmad-agent-dev";
        reason = `${openActions.length} open action item(s). Address retro debt before starting a fresh epic.`;
        julesCanHandle = true;
        julesPrompt = `Fix this action item first: ${item.title}${item.summary ? `\n\nContext: ${item.summary}` : ""}${item.sourcePath ? `\n\nSource file: ${item.sourcePath}` : ""}`;
    } else if (openStories.length > 0) {
        const item = openStories[0];
        targetItemId = item.id;
        skill = "bmad-dev-story";
        agent = "bmad-agent-dev";
        reason = `${openStories.length} open story(ies) ready for development. Pick the next one and implement it.`;
        sessionReuse = false;
        julesCanHandle = !!item.metadata?.storyFile;
        julesPrompt = julesCanHandle
            ? `Implement the story ${item.title}${item.metadata?.storyFile ? ` using ${item.metadata.storyFile}` : ""}${item.summary ? `.\n\nContext: ${item.summary}` : ""}`
            : null;
    } else if (allDone) {
        skill = "bmad-retrospective";
        agent = "bmad-agent-pm";
        reason = "All epics are done. Run a final retrospective, then plan the next product slice.";
        sessionReuse = false;
    } else {
        skill = "bmad-sprint-status";
        reason = "Board looks healthy. Check sprint status to identify what's next.";
    }

    return { skill, agent, reason, sessionReuse, julesCanHandle, julesPrompt, targetItemId };
}

function buildJulesTaskPrompt(state, item, prompt) {
    if (prompt) return prompt;

    const lookup = state?.workLookup || {};
    const ancestors = [];
    let current = item;
    while (current?.parentId && lookup[current.parentId]) {
        current = lookup[current.parentId];
        ancestors.unshift(current);
    }

    const children = Array.isArray(item?.children) ? item.children : [];
    const story = [item, ...ancestors].find((candidate) => candidate?.kind === "story");
    const storyDocument = story?.metadata?.storyFile
        ? (state.documents || []).find((document) => document.kind === "story-file" && document.sourcePath === story.metadata.storyFile)
        : (item?.sourcePath ? (state.documents || []).find((document) => document.kind === "story-file" && document.sourcePath === item.sourcePath) : null);
    const sections = [
        `Implement this ${item.kind}: ${item.title}`,
        item.summary ? `\n\nTask context:\n${item.summary}` : "",
        ancestors.length ? `\n\nBMad hierarchy:\n${ancestors.map((ancestor) => `${ancestor.kind}: ${ancestor.title}`).join("\n")}` : "",
        children.length ? `\n\nChild subtasks:\n${children.map((child) => `- [${child.status === "done" ? "x" : " "}] ${child.title}`).join("\n")}` : "",
        item.sourcePath ? `\n\nRead-only source reference: ${item.sourcePath}` : "",
        storyDocument?.body ? `\n\nStory specification (read-only context):\n${storyDocument.body.slice(0, 12000)}` : "",
        "\n\nDo not modify BMad artifact files. Implement only the requested code change and report any missing requirements.",
    ];
    return sections.join("").trim();
}

function decorateBoardState(state) {
    const canonical = buildCanonicalWorkModel(state);
    state.workItems = canonical.workItems;
    state.workRoots = canonical.workRoots;
    state.workLookup = canonical.workLookup;
    state.workCounts = canonical.workCounts;
    state.statusCounts = canonical.workStatusCounts;
    state.referenceDocuments = classifyReferenceDocuments(state);
    state.nextAction = buildNextActionSuggestion(state);
    return state;
}

async function refreshInstance(instanceId) {
    const entry = instances.get(instanceId);
    if (!entry) {
        throw new CanvasError("instance_not_found", `Unknown canvas instance: ${instanceId}`);
    }
    entry.state = await buildBoardState(entry.context);
    entry.stateRefreshedAt = new Date().toISOString();
    return entry.state;
}

function renderHtml(instanceId, initialState) {
    const initialJson = JSON.stringify(initialState ?? {}).replaceAll("<", "\\u003c");
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(initialState?.title || CANVAS_NAME)}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f8fafc;
        --bg-soft: #ffffff;
        --bg-subtle: #f1f5f9;
        --surface: #ffffff;
        --surface-subtle: #f8fafc;
        --surface-inset: #eef2f7;
        --border: #dbe3ea;
        --border-soft: #e5ebf1;
        --text: #0f172a;
        --muted: #475569;
        --accent: #2563eb;
        --accent-soft: #dbeafe;
        --good: #15803d;
        --good-soft: #dcfce7;
        --warn: #b45309;
        --warn-soft: #fef3c7;
        --bad: #b91c1c;
        --bad-soft: #fee2e2;
        --button-fg: #ffffff;
        --shadow: 0 1px 2px rgba(15, 23, 42, .05), 0 10px 30px rgba(15, 23, 42, .04);
        --shadow-hover: 0 8px 22px rgba(15, 23, 42, .08);
      }
      :root[data-theme="dark"] {
        color-scheme: dark;
        --bg: #0f172a;
        --bg-soft: #111827;
        --bg-subtle: #1e293b;
        --surface: #111827;
        --surface-subtle: #1e293b;
        --surface-inset: #0b1220;
        --border: #334155;
        --border-soft: #475569;
        --text: #e5eefb;
        --muted: #94a3b8;
        --accent: #60a5fa;
        --accent-soft: #1e3a8a;
        --good: #4ade80;
        --good-soft: #052e16;
        --warn: #f59e0b;
        --warn-soft: #2f2206;
        --bad: #f87171;
        --bad-soft: #3f1d1d;
        --button-fg: #ffffff;
        --shadow: 0 1px 2px rgba(0,0,0,.28), 0 12px 32px rgba(0,0,0,.22);
        --shadow-hover: 0 10px 24px rgba(0,0,0,.28);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background:
          radial-gradient(circle at top right, rgba(37, 99, 235, .05), transparent 30%),
          linear-gradient(180deg, var(--surface) 0%, var(--bg) 38%, var(--surface-inset) 100%);
        color: var(--text);
        font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
        font-size: var(--text-body-medium, 14px);
        line-height: var(--leading-body-medium, 20px);
      }
      header {
        padding: 16px 18px 12px;
        border-bottom: 1px solid var(--border);
        background: var(--surface);
        backdrop-filter: blur(10px);
        position: sticky;
        top: 0;
        z-index: 10;
      }
      .topbar {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(220px, 320px);
        gap: 12px;
        align-items: start;
      }
      h1 {
        margin: 0;
        font-size: 20px;
        line-height: 1.2;
        color: var(--text);
      }
      .subtitle {
        color: var(--muted);
        margin-top: 4px;
        font-size: 12px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border: 1px solid var(--border);
        border-radius: 999px;
        padding: 4px 10px;
        background: var(--surface);
        font-size: 12px;
        white-space: nowrap;
        color: var(--text);
      }
      .stack { display: grid; gap: 8px; }
      .stack[style*="align-items:flex-end"] .pill {
        width: 100%;
        justify-content: flex-start;
      }
      .toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 12px; }
      .toolbar input, .toolbar select, .toolbar button {
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--surface);
        color: var(--text);
        padding: 8px 10px;
        font: inherit;
      }
      .toolbar button {
        cursor: pointer;
        background: linear-gradient(180deg, #3b82f6, #2563eb);
        color: var(--button-fg);
        border-color: #1d4ed8;
        box-shadow: 0 1px 2px rgba(37, 99, 235, .18);
      }
      .theme-toggle {
        cursor: pointer;
        appearance: none;
        font: inherit;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        min-height: 32px;
      }
      .toolbar input { min-width: 220px; }
      .toolbar select { min-width: 140px; }
      .tab-list {
        display: flex;
        gap: 4px;
        margin-top: 14px;
        border-bottom: 1px solid var(--border);
      }
      .tab-button {
        appearance: none;
        border: 0;
        border-bottom: 2px solid transparent;
        background: transparent;
        color: var(--muted);
        padding: 8px 12px;
        cursor: pointer;
        font: inherit;
        font-weight: 600;
      }
      .tab-button:hover, .tab-button.active {
        color: var(--accent);
        border-bottom-color: var(--accent);
      }
      .tab-view { display: none; }
      .tab-view.active { display: grid; gap: 14px; }
      .status-filters {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 10px;
      }
      .filter-chip {
        appearance: none;
        border: 1px solid var(--border);
        border-radius: 999px;
        background: var(--surface);
        color: var(--text);
        font: inherit;
        padding: 6px 12px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      .filter-chip.active {
        border-color: #93c5fd;
        background: var(--accent-soft);
        color: #1d4ed8;
      }
      .filter-chip small {
        color: var(--muted);
        font-weight: 600;
      }
      main { display: grid; gap: 14px; padding: 14px; }
      .summary {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
        gap: 10px;
      }
      .stat {
        border: 1px solid var(--border);
        border-radius: 14px;
        padding: 12px;
        background: var(--surface);
        box-shadow: var(--shadow);
      }
      .stat .label { color: var(--muted); font-size: 12px; }
      .stat .value { font-size: 22px; font-weight: 700; margin-top: 6px; color: var(--text); }
      .columns {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
      }
      .hierarchy-node { display: grid; gap: 6px; }
      .hierarchy-children {
        display: grid;
        gap: 6px;
        margin-left: 14px;
        padding-left: 10px;
        border-left: 2px solid var(--border-soft);
      }
      .column {
        border: 1px solid var(--border);
        border-radius: 14px;
        overflow: hidden;
        background: var(--surface);
        box-shadow: var(--shadow);
      }
      .column h2 {
        margin: 0;
        padding: 12px 14px;
        font-size: 14px;
        border-bottom: 1px solid var(--border);
        background: linear-gradient(180deg, var(--surface), var(--surface-subtle));
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .column .count { color: var(--muted); font-weight: 600; }
      .cards { padding: 10px; display: grid; gap: 10px; }
      .card {
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 10px;
        background: var(--surface);
        cursor: pointer;
      }
      .card:hover { border-color: #93c5fd; box-shadow: var(--shadow-hover); }
      .card.selected { outline: 2px solid rgba(37, 99, 235, .45); }
      .card-head { display: flex; justify-content: space-between; gap: 8px; align-items: start; }
      .card-title { font-weight: 700; font-size: 13px; line-height: 1.35; color: var(--text); }
      .card-meta { margin-top: 6px; color: var(--muted); font-size: 12px; }
      .badges { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
      .badge {
        font-size: 11px;
        padding: 2px 8px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: var(--surface-subtle);
        color: var(--text);
      }
      .badge.good { color: var(--good); background: var(--good-soft); border-color: #bbf7d0; }
      .badge.warn { color: var(--warn); background: var(--warn-soft); border-color: #fde68a; }
      .badge.bad { color: var(--bad); background: var(--bad-soft); border-color: #fecaca; }
      .layout {
        display: grid;
        grid-template-columns: minmax(0, 1.7fr) minmax(280px, 0.9fr);
        gap: 14px;
      }
      .panel {
        border: 1px solid var(--border);
        border-radius: 14px;
        background: var(--surface);
        box-shadow: var(--shadow);
        overflow: hidden;
      }
      .panel h2 {
        margin: 0;
        padding: 12px 14px;
        border-bottom: 1px solid var(--border);
        background: linear-gradient(180deg, var(--surface), var(--surface-subtle));
        font-size: 14px;
      }
      .panel-body { padding: 12px 14px; }
      .details-panel {
        position: sticky;
        top: 118px;
        max-height: calc(100vh - 138px);
        overflow: auto;
        padding-right: 10px;
      }
      .details-header {
        display: grid;
        gap: 8px;
        margin-bottom: 12px;
        padding-bottom: 12px;
        border-bottom: 1px solid var(--border);
      }
      .details-header h3 {
        margin: 0;
        font-size: 16px;
        line-height: 1.35;
        color: var(--text);
      }
      .details-header .subtitle-line {
        color: color-mix(in srgb, var(--text) 72%, var(--muted));
        font-size: 12px;
      }
      .details-header .badges {
        margin-top: 0;
      }
      .details-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 10px;
      }
      .kv {
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 10px;
        background: var(--surface-subtle);
      }
      .kv .k {
        color: var(--muted);
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: .04em;
      }
      .kv .v {
        margin-top: 4px;
        font-weight: 600;
        color: var(--text);
        word-break: break-word;
      }
      .list {
        display: grid;
        gap: 8px;
        margin-top: 10px;
      }
      .list-item {
        display: block;
        width: 100%;
        text-align: left;
        appearance: none;
        font: inherit;
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 8px 10px;
        cursor: pointer;
        background: var(--surface);
      }
      .list-item:hover { border-color: #93c5fd; }
      .list-item small { color: var(--muted); display: block; margin-top: 4px; }
      pre {
        margin: 0;
        padding: 12px;
        border-radius: 12px;
        background: var(--surface-subtle);
        color: var(--text);
        overflow: auto;
        font-size: 12px;
        line-height: 1.5;
        border: 1px solid var(--border);
      }
      .notice {
        border: 1px dashed var(--border);
        border-radius: 12px;
        padding: 10px 12px;
        color: var(--muted);
        background: var(--surface-subtle);
      }
      .footer-note { color: var(--muted); font-size: 12px; margin-top: 8px; }
      .section-title { display:flex; align-items:center; justify-content:space-between; gap: 8px; }
      .section-subtle { color: var(--muted); font-size: 12px; font-weight: 500; }
      .roadmap {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 10px;
      }
      .roadmap-card {
        border: 1px solid var(--border);
        border-radius: 12px;
        background: var(--surface);
        padding: 12px;
        box-shadow: var(--shadow);
      }
      .roadmap-card h3 {
        margin: 0 0 8px 0;
        font-size: 14px;
        line-height: 1.3;
      }
      .roadmap-card ul {
        margin: 0;
        padding-left: 18px;
        color: var(--muted);
      }
      .toasts {
        position: fixed;
        right: 16px;
        bottom: 16px;
        display: grid;
        gap: 8px;
        z-index: 30;
        pointer-events: none;
      }
      .toast {
        min-width: 220px;
        max-width: 340px;
        padding: 10px 12px;
        border-radius: 12px;
        background: var(--surface);
        border: 1px solid var(--border);
        box-shadow: var(--shadow);
        color: var(--text);
      }
      .toast.success { border-color: #bbf7d0; }
      .toast.info { border-color: #bfdbfe; }
      .toast.warn { border-color: #fde68a; }
      .toast.error { border-color: #fecaca; }
      dialog {
        border: 1px solid var(--border);
        border-radius: 18px;
        box-shadow: 0 24px 80px rgba(15, 23, 42, .28);
        padding: 0;
        max-width: min(920px, calc(100vw - 24px));
        width: 920px;
        background: var(--surface);
        color: var(--text);
      }
      dialog::backdrop {
        background: rgba(15, 23, 42, .42);
        backdrop-filter: blur(2px);
      }
      .dialog-shell { padding: 18px; }
      .dialog-head {
        display: flex;
        align-items: start;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
        padding-bottom: 12px;
        border-bottom: 1px solid var(--border);
      }
      .dialog-head h3 {
        margin: 0;
        font-size: 18px;
        line-height: 1.3;
      }
      .dialog-actions { display:flex; gap: 8px; align-items:center; }
      .dialog-close {
        appearance: none;
        border: 1px solid var(--border);
        background: var(--surface);
        color: var(--text);
        border-radius: 10px;
        padding: 8px 10px;
        cursor: pointer;
      }
      @media (max-width: 1100px) {
        .layout { grid-template-columns: 1fr; }
        .details-panel {
          position: static;
          max-height: none;
          overflow: visible;
          padding-right: 0;
        }
      }
      /* ── Jules styles ───────────────────────────────────────────── */
      .jules-badge {
        font-size: 11px;
        padding: 2px 7px;
        border-radius: 999px;
        border: 1px solid #7c3aed44;
        background: #ede9fe;
        color: #5b21b6;
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      :root[data-theme="dark"] .jules-badge {
        background: #2e1065;
        color: #c4b5fd;
        border-color: #7c3aed55;
      }
      .jules-session-card {
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 10px 12px;
        background: var(--surface-subtle);
        display: grid;
        gap: 6px;
        margin-bottom: 8px;
      }
      .jules-session-card .jsc-title { font-weight: 600; font-size: 13px; }
      .jules-session-card .jsc-meta { font-size: 12px; color: var(--muted); }
      .jules-session-card .jsc-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
      .jules-session-card .jsc-actions a,
      .jules-session-card .jsc-actions button {
        font-size: 12px;
        padding: 4px 10px;
        border-radius: 8px;
        border: 1px solid var(--border);
        background: var(--surface);
        color: var(--text);
        cursor: pointer;
        text-decoration: none;
        font: inherit;
      }
      .jules-session-card .jsc-actions a { color: var(--accent); }
      .jules-empty {
        border: 1px dashed var(--border);
        border-radius: 12px;
        padding: 12px;
        color: var(--muted);
        background: var(--surface-subtle);
      }
      .jules-toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;
      }
      .jules-toolbar button {
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 5px 9px;
        background: var(--surface);
        color: var(--text);
        cursor: pointer;
        font: inherit;
        font-size: 12px;
      }
      .jules-icon-button {
        width: 36px;
        height: 36px;
        padding: 0;
        display: inline-grid;
        place-items: center;
        font-size: 18px;
        line-height: 1;
      }
      .jules-no-key {
        padding: 12px;
        border: 1px dashed var(--border);
        border-radius: 12px;
        font-size: 13px;
        color: var(--muted);
        background: var(--surface-subtle);
      }
      .tab-controls {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        align-items: center;
        margin-bottom: 12px;
      }
      .tab-controls input, .tab-controls select, .tab-controls button {
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--surface);
        color: var(--text);
        padding: 8px 10px;
        font: inherit;
      }
      .tab-controls input { flex: 1 1 220px; min-width: 180px; }
      .tab-controls button { cursor: pointer; }
      .relation-group {
        margin-top: 14px;
        display: grid;
        gap: 8px;
      }
      .relation-group h4 {
        margin: 0;
        color: var(--muted);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: .04em;
      }
      .relation-link {
        width: 100%;
        text-align: left;
      }
    </style>
  </head>
  <body>
    <header>
      <div class="topbar">
        <h1 id="board-title">Command Center</h1>
        <button class="pill theme-toggle jules-icon-button" id="themeToggle" type="button" title="Cycle system, light, and dark themes" aria-label="Cycle system, light, and dark themes">◐</button>
      </div>
      <nav class="tab-list" aria-label="Command Center sections" role="tablist">
        <button class="tab-button active" id="tabKanban" type="button" role="tab" aria-selected="true" aria-controls="viewKanban">Kanban</button>
        <button class="tab-button" id="tabJules" type="button" role="tab" aria-selected="false" aria-controls="viewJules">Jules</button>
        <button class="tab-button" id="tabDocs" type="button" role="tab" aria-selected="false" aria-controls="viewDocs">Docs</button>
      </nav>
    </header>
    <main>
     <section class="tab-view active" id="viewKanban" role="tabpanel" aria-labelledby="tabKanban">
       <div class="tab-controls" aria-label="Kanban filters">
         <input id="kanbanSearch" type="search" placeholder="Search epics, stories, tasks, subtasks..." />
         <select id="kanbanKindFilter">
           <option value="">All types</option>
           <option value="epic">Epic</option>
           <option value="story">Story</option>
           <option value="task">Task</option>
           <option value="subtask">Subtask</option>
         </select>
         <button id="refreshBtn" type="button">Refresh</button>
       </div>
       <div class="status-filters" id="kanbanStatusFilters"></div>
       <section class="summary" id="summary"></section>
       <section class="layout">
         <div class="panel">
           <h2>Work hierarchy</h2>
           <div class="panel-body">
             <div id="notices"></div>
             <div class="columns" id="columns"></div>
           </div>
         </div>
       </section>
       <section class="panel">
         <h2>Automation roadmap</h2>
         <div class="panel-body" id="roadmap"></div>
       </section>
      </section>

     <section class="tab-view" id="viewJules" role="tabpanel" aria-labelledby="tabJules">
       <section class="panel" id="automationsPanel">
         <h2>Jules sessions</h2>
         <div class="panel-body">
           <div class="tab-controls" aria-label="Jules filters">
             <input id="julesSearch" type="search" placeholder="Search Jules sessions..." />
             <select id="julesLifecycleFilter">
               <option value="">All lifecycle states</option>
               <option value="active">Active</option>
               <option value="paused">Paused</option>
               <option value="archived">Archived</option>
               <option value="deleted">Deleted</option>
             </select>
           </div>
           <div id="automations"></div>
         </div>
       </section>
     </section>

     <section class="tab-view" id="viewDocs" role="tabpanel" aria-labelledby="tabDocs">
       <section class="panel">
         <h2>Reference documentation</h2>
         <div class="panel-body">
           <div class="tab-controls" aria-label="Documentation filters">
             <input id="docsSearch" type="search" placeholder="Search reference docs..." />
             <select id="docsTypeFilter">
               <option value="">All document types</option>
               <option value="markdown">Markdown</option>
               <option value="yaml">YAML</option>
               <option value="json">JSON</option>
             </select>
           </div>
           <div class="list" id="artifacts"></div>
           <div class="footer-note">Epic, story, task, and subtask source files stay in Kanban and are not repeated here.</div>
         </div>
       </section>
     </section>
    </main>
    <div class="toasts" id="toasts"></div>
    <dialog id="itemDialog">
      <div class="dialog-shell">
        <div class="dialog-head">
          <div>
            <h3 id="dialogTitle"></h3>
            <div class="section-subtle" id="dialogSubtitle"></div>
          </div>
          <div class="dialog-actions">
            <button class="dialog-close jules-icon-button" id="dialogDelegateJules" type="button" title="Delegate this task to Jules" aria-label="Delegate this task to Jules" hidden>🤖</button>
            <button class="dialog-close" id="dialogClose" type="button">Close</button>
          </div>
        </div>
        <div id="dialogBody"></div>
      </div>
    </dialog>
    <script>
      const instanceId = ${JSON.stringify(instanceId)};
      let state = ${initialJson};
      let selectedId = null;
      let themePreference = null;
      let selectedStatuses = new Set(["Blocked", "Active", "Open", "Done"]);
      let themeMediaQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
      const availableStatuses = ["Blocked", "Active", "Open", "Done"];
      let _julesDialogItemId = null;
      let _julesPolling = false;
      let julesStream = null;
      let activeTab = "kanban";

      const JULES_STATE_LABELS = {
        STATE_UNSPECIFIED: "Unknown", QUEUED: "Queued", PLANNING: "Planning",
        AWAITING_PLAN_APPROVAL: "Awaiting approval", AWAITING_USER_FEEDBACK: "Awaiting feedback",
        IN_PROGRESS: "In progress", PAUSED: "Paused", FAILED: "Failed", COMPLETED: "Completed", DELETED: "Deleted",
      };
      const JULES_STATE_EMOJI = {
        QUEUED: "🔵", PLANNING: "🟡", AWAITING_PLAN_APPROVAL: "⏸️", AWAITING_USER_FEEDBACK: "💬",
        IN_PROGRESS: "🟠", PAUSED: "⏸️", FAILED: "❌", COMPLETED: "✅",
      };
      const JULES_TERMINAL = new Set(["COMPLETED", "FAILED", "DELETED"]);

      function julesLabel(s) { return JULES_STATE_LABELS[s] || s || "Unknown"; }
      function julesEmoji(s) { return JULES_STATE_EMOJI[s] || "⚪"; }
      function julesLifecycle(s) {
        if (s === "DELETED") return "deleted";
        if (["COMPLETED", "FAILED"].includes(s)) return "archived";
        if (["PAUSED", "AWAITING_PLAN_APPROVAL", "AWAITING_USER_FEEDBACK"].includes(s)) return "paused";
        return "active";
      }

      const columnOrder = availableStatuses;
      const kindLabels = {
        epic: "Epic",
        story: "Story",
        task: "Task",
        subtask: "Subtask",
      };

      function byId(id) {
        return document.getElementById(id);
      }

      function normalize(text) {
        return String(text || "").toLowerCase();
      }

      function themeLabel(value) {
        const normalized = String(value || "system").toLowerCase();
        return normalized === "dark" ? "Dark" : normalized === "light" ? "Light" : "System";
      }

      function resolveTheme(pref) {
        const normalized = String(pref || "system").toLowerCase();
        if (normalized === "dark" || normalized === "light") {
          return normalized;
        }
        if (themeMediaQuery && themeMediaQuery.matches) {
          return "dark";
        }
        return "light";
      }

      function applyTheme(pref) {
        const resolved = resolveTheme(pref);
        document.documentElement.dataset.theme = resolved;
        document.body.dataset.theme = resolved;
        document.documentElement.style.colorScheme = resolved;
        const themeToggle = byId("themeToggle");
        if (themeToggle) themeToggle.title = "Theme: " + themeLabel(pref) + ". Click to cycle.";
        return resolved;
      }

      function toast(message, tone = "info") {
        const container = byId("toasts");
        if (!container) return;
        const toastNode = document.createElement("div");
        toastNode.className = "toast " + tone;
        toastNode.textContent = message;
        container.appendChild(toastNode);
        window.setTimeout(() => {
          toastNode.style.opacity = "0";
          toastNode.style.transform = "translateY(4px)";
          toastNode.style.transition = "opacity .2s ease, transform .2s ease";
        }, 2400);
        window.setTimeout(() => {
          toastNode.remove();
        }, 2700);
      }

      function compactPath(value, depth = 3) {
        const parts = String(value || "").split(/[\\/]+/).filter(Boolean);
        if (parts.length <= depth) {
          return parts.join("/");
        }
        return parts.slice(-depth).join("/");
      }

      function bucket(status) {
        const value = normalize(status);
        if (["done", "complete", "completed", "closed", "resolved"].includes(value)) return "Done";
        if (["in-progress", "in progress", "review", "ready-for-dev", "ready", "active"].includes(value)) return "Active";
        if (["blocked"].includes(value)) return "Blocked";
        return "Open";
      }

      function statusClass(status) {
        const value = normalize(status);
        if (["done", "complete", "completed", "closed", "resolved"].includes(value)) return "good";
        if (["blocked"].includes(value)) return "bad";
        if (["in-progress", "review", "ready-for-dev"].includes(value)) return "warn";
        return "";
      }

      function esc(value) {
        return String(value ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");
      }

      function matchesFilters(item) {
        const query = normalize(byId("kanbanSearch")?.value.trim());
        const kind = byId("kanbanKindFilter")?.value;
        if (kind && item.kind !== kind) return false;
        if (selectedStatuses.size && !selectedStatuses.has(bucket(item.status))) return false;
        if (!query) return true;
        const haystack = [
          item.title,
          item.summary,
          item.phase,
          item.sourcePath,
          item.kind,
          JSON.stringify(item.metadata || {}),
        ].join(" ").toLowerCase();
        return haystack.includes(query);
      }

      function renderSummary() {
        const counts = state.workCounts || {};
        const container = byId("summary");
        const cards = [
          ["Epics", counts.epic || 0],
          ["Stories", counts.story || 0],
          ["Tasks", counts.task || 0],
          ["Subtasks", counts.subtask || 0],
        ];
        container.innerHTML = cards.map(([label, value]) => {
          return '<div class="stat">' +
            '<div class="label">' + esc(label) + '</div>' +
            '<div class="value">' + esc(value) + '</div>' +
            '</div>';
        }).join("");
      }

      function renderColumns() {
        const container = byId("columns");
        const items = (state.workItems || []).filter(matchesFilters);
        const boardColumns = columnOrder;
        const grouped = new Map(boardColumns.map((name) => [name, []]));
        for (const item of items) {
          const group = bucket(item.status);
          if (!grouped.has(group)) grouped.set(group, []);
          grouped.get(group).push(item);
        }
        container.innerHTML = boardColumns.map((group) => {
          const itemsForGroup = grouped.get(group) || [];
          const cards = itemsForGroup.map(renderCard).join("");
          const title = group;
          return '<div class="column">' +
            '<h2><span>' + esc(title) + '</span><span class="count">' + esc(itemsForGroup.length) + '</span></h2>' +
            '<div class="cards">' + (cards || '<div class="notice">No items.</div>') + '</div>' +
            '</div>';
        }).join("");

        container.querySelectorAll("[data-item-id]").forEach((node) => {
          node.addEventListener("click", () => selectItem(node.getAttribute("data-item-id")));
        });
      }

      function renderCard(item) {
        const selected = selectedId === item.id ? "selected" : "";
        const julesEntry = state.jules && state.jules[item.id];
        const parent = item.parentId ? state.workLookup?.[item.parentId] : null;
        const jules_badge = julesEntry ? '<span class="jules-badge">' + julesEmoji(julesEntry.state) + " " + esc(julesLabel(julesEntry.state)) + '</span>' : "";
        const badges = [
          '<span class="badge">' + esc(kindLabels[item.kind] || item.kind) + '</span>',
          item.status ? '<span class="badge ' + statusClass(item.status) + '">' + esc(item.status) + '</span>' : "",
          item.phase ? '<span class="badge">' + esc(item.phase) + '</span>' : "",
          jules_badge,
        ].filter(Boolean).join("");
        const subtitle = item.summary || "";
        const relation = parent
          ? "Parent: " + parent.title
          : ((state.workLookup?.[item.id]?.children || []).length ? "Root · " + state.workLookup[item.id].children.length + " children" : "Root work item");
        return '<div class="card ' + selected + '" data-item-id="' + esc(item.id) + '">' +
          '<div class="card-head">' +
            '<div class="card-title">' + esc(item.title) + '</div>' +
          '</div>' +
          '<div class="card-meta">' + esc(subtitle) + '</div>' +
          '<div class="card-meta">' + esc(relation) + '</div>' +
          '<div class="badges">' + badges + '</div>' +
        '</div>';
      }

      function renderArtifacts() {
        const container = byId("artifacts");
        const query = normalize(byId("docsSearch")?.value.trim());
        const type = byId("docsTypeFilter")?.value;
        const docs = (state.referenceDocuments || []).filter((doc) => {
          if (type && doc.metadata?.kind !== type) return false;
          if (!query) return true;
          return [doc.title, doc.sourcePath, doc.body, JSON.stringify(doc.metadata || {})]
            .join(" ").toLowerCase().includes(query);
        });
        if (!docs.length) {
          container.innerHTML = '<div class="notice">No documents match the current filters.</div>';
          return;
        }
        container.innerHTML = docs.map((doc) => {
          return '<div class="list-item" data-doc-id="' + esc(doc.id) + '">' +
            '<strong>' + esc(doc.title) + '</strong>' +
            '<small>' + esc(doc.sourcePath || "") + '</small>' +
            '</div>';
        }).join("");
        container.querySelectorAll("[data-doc-id]").forEach((node) => {
          node.addEventListener("click", () => selectItem(node.getAttribute("data-doc-id")));
        });
      }

      function renderNotices() {
        const notices = state.notices || [];
        const container = byId("notices");
        if (!notices.length) {
          container.innerHTML = "";
          return;
        }
        container.innerHTML = notices.map((notice) => {
          return '<div class="notice" style="margin-bottom:8px;">' + esc(notice) + '</div>';
        }).join("");
      }

      function buildSkillRouting() {
        const nextAction = state.nextAction || {};
        return {
          skill: nextAction.skill || null,
          agent: nextAction.agent || null,
          reason: nextAction.reason || "Board looks healthy. Check sprint status to identify what's next.",
          julesOk: !!nextAction.julesCanHandle,
          julesHint: nextAction.julesCanHandle ? "This task is a good Jules candidate — use the delegate action or workflow." : null,
          sessionReuse: nextAction.sessionReuse !== false,
        };
      }

      function buildRoadmapItems() {
        const counts = state.statusCounts || {};
        const openCount = counts.Open || 0;
        const activeCount = counts.Active || 0;
        const doneCount = counts.Done || 0;
        const reviewCount = (state.byStatus && (state.byStatus.review || state.byStatus["in-review"] || 0)) || 0;
        const actionCount = state.counts?.actions || 0;
        const storyCount = state.counts?.stories || 0;
        const routing = buildSkillRouting();

        const skillCard = {
          title: "▶ Next recommended action",
          items: [
            "Reason: " + routing.reason,
            routing.skill ? "Skill: " + routing.skill : "",
            routing.agent ? "Agent: " + routing.agent : "",
            routing.sessionReuse ? "Session: reuse current session" : "Session: open a new session for this epic slice",
            routing.julesOk ? "Jules: ✅ safe to delegate — " + (routing.julesHint || "use dispatch_to_jules action") : "Jules: ⛔ not suitable for this task type",
          ].filter(Boolean),
        };

        return [
          skillCard,
          {
            title: "Session reuse heuristics",
            items: [
              "Reuse: same epic, continue a story, run review, quick fix, UI polish, address action items.",
              "New session: switch epic, fresh story implementation (>3 files), architecture spike.",
              "Jules delegate: isolated tasks — add tests, fix lint, upgrade deps, fix CI.",
            ],
          },
          {
            title: "Recommended agents / skills",
            items: [
              "Architecture / design: bmad-agent-architect",
              "Story implementation: bmad-dev-story + bmad-agent-dev",
              "Code review: bmad-code-review",
              "Plan / scope: bmad-agent-pm or bmad-agent-analyst",
              "Docs: bmad-agent-tech-writer",
              "Quality: bmad-tea",
              "Retro / action items: bmad-retrospective",
            ],
          },
          {
            title: "Jules automation (what to delegate)",
            items: [
              "✅ Good: add unit tests, fix lint, upgrade dependency, fix CI failure, write docs.",
              "⚠️ Review plan: implement a story (set requirePlanApproval: true).",
              "❌ Keep in Copilot: architecture, PRD, complex multi-file refactor, retro.",
              "Trigger: click 🤖 Delegate to Jules in any card dialog.",
              "Or run: gh workflow run jules-dispatch.yml -f story_id=<id> -f prompt='...'",
            ],
          },
          {
            title: "Board snapshot",
            items: [
              doneCount + " done · " + activeCount + " active · " + openCount + " open",
              storyCount + " stories · " + actionCount + " action items",
            ],
          },
        ];
      }

      function renderRoadmap() {
        const container = byId("roadmap");
        if (!container) return;
        const items = buildRoadmapItems();
        container.innerHTML = '<div class="roadmap">' + items.map((card) => {
          return '<div class="roadmap-card">' +
            '<h3>' + esc(card.title) + '</h3>' +
            '<ul>' + card.items.map((item) => '<li>' + esc(item) + '</li>').join("") + '</ul>' +
            '</div>';
        }).join("") + '</div>';
      }

      function renderStatusFilters() {
        const counts = state.statusCounts || {};
        const container = byId("kanbanStatusFilters");
        if (!container) return;
        container.innerHTML = availableStatuses.map((status) => {
          const active = selectedStatuses.has(status);
          const count = counts[status] || 0;
          return '<button class="filter-chip' + (active ? " active" : "") + '" type="button" data-status-filter="' + esc(status) + '">' +
            '<span>' + esc(status) + '</span>' +
            '<small>' + esc(count) + '</small>' +
          '</button>';
        }).join("") +
        '<button class="filter-chip" type="button" data-hide-done="true">' +
          '<span>Hide done</span>' +
          '<small>quick</small>' +
        '</button>' +
        '<button class="filter-chip" type="button" data-show-all="true">' +
          '<span>Show all</span>' +
          '<small>reset</small>' +
        '</button>';

        container.querySelectorAll("[data-status-filter]").forEach((node) => {
          node.addEventListener("click", () => {
            const status = node.getAttribute("data-status-filter");
            toggleStatus(status);
          });
        });
        container.querySelectorAll("[data-hide-done]").forEach((node) => {
          node.addEventListener("click", () => {
            selectedStatuses.delete("Done");
            if (!selectedStatuses.size) {
              selectedStatuses = new Set(["Blocked", "Active", "Open"]);
            }
            renderAll();
            toast("Done items hidden", "info");
          });
        });
        container.querySelectorAll("[data-show-all]").forEach((node) => {
          node.addEventListener("click", () => {
            selectedStatuses = new Set(availableStatuses);
            renderAll();
            toast("All statuses visible", "info");
          });
        });
      }

      function toggleStatus(status) {
        const next = new Set(selectedStatuses);
        if (next.has(status)) {
          next.delete(status);
        } else {
          next.add(status);
        }
        if (!next.size) {
          selectedStatuses = new Set(availableStatuses);
          toast("At least one status must remain visible", "warn");
        } else {
          selectedStatuses = next;
        }
        renderAll();
      }

      function buildItemDetailsMarkup(item, includeHeader = true) {
        if (!item) {
          return '<div class="notice">Select a card or document to inspect the source metadata.</div>';
        }
        const meta = item.metadata || {};
        const kv = [
          ["Kind", kindLabels[item.kind] || item.kind || ""],
          ["Status", item.status || ""],
          ["Phase", item.phase || ""],
          ["Source", item.sourcePath || ""],
          ["Parent", item.parentId || ""],
        ];
        const extra = Object.entries(meta).filter(([, value]) => value !== undefined && value !== null && value !== "");
        const headerBadges = [
          '<span class="badge">' + esc(kindLabels[item.kind] || item.kind) + '</span>',
          item.status ? '<span class="badge ' + statusClass(item.status) + '">' + esc(item.status) + '</span>' : "",
          item.phase ? '<span class="badge">' + esc(item.phase) + '</span>' : "",
        ].filter(Boolean).join("");
        const propertiesHtml = extra.length ? (
          '<div style="margin-top:12px;">' +
            '<div class="notice" style="margin-bottom:8px;">Properties</div>' +
            '<pre>' + esc(JSON.stringify(Object.fromEntries(extra), null, 2)) + '</pre>' +
          '</div>'
        ) : "";
        const tasksHtml = item.tasks && item.tasks.length ? (
          '<div style="margin-top:12px;">' +
            '<div class="notice" style="margin-bottom:8px;">Tasks</div>' +
            '<div class="list">' +
              item.tasks.map((task) => {
                return '<button class="list-item" type="button" data-task-title="' + esc(task.title) + '">' +
                  '<strong>' + esc(task.title) + '</strong><small>' + esc(task.status) + '</small>' +
                '</button>';
              }).join("") +
            '</div>' +
          '</div>'
        ) : "";
        const bodyHtml = item.body ? (
          '<details style="margin-top:12px;">' +
            '<summary class="notice" style="cursor:pointer;">Raw body</summary>' +
            '<pre style="margin-top:8px;">' + esc(item.body.slice(0, 6000)) + '</pre>' +
          '</details>'
        ) : "";
        const rawHtml = item.raw ? (
          '<details style="margin-top:12px;">' +
            '<summary class="notice" style="cursor:pointer;">Raw data</summary>' +
            '<pre style="margin-top:8px;">' + esc(JSON.stringify(item.raw, null, 2)) + '</pre>' +
          '</details>'
        ) : "";
        const parent = item.parentId ? (state.workLookup?.[item.parentId] || state.lookup?.[item.parentId]) : null;
        const siblings = parent
          ? (parent.children || []).filter((candidate) => candidate.id !== item.id)
          : (state.workRoots || []).filter((candidate) => candidate.id !== item.id);
        const relationButton = (relation, candidate) =>
          '<button class="list-item relation-link" type="button" data-relation-id="' + esc(candidate.id) + '">' +
            '<strong>' + esc(candidate.title) + '</strong><small>' + esc(relation + " · " + (kindLabels[candidate.kind] || candidate.kind)) + '</small>' +
          '</button>';
        const relationsHtml = '<div class="relation-group">' +
          '<h4>Relationships</h4>' +
          (parent ? '<div class="list">' + relationButton("Parent", parent) + '</div>' : '<div class="notice">No parent relationship.</div>') +
          ((item.children || []).length ? '<div class="list">' + item.children.map((child) => relationButton("Child", child)).join("") + '</div>' : '<div class="notice">No children.</div>') +
          (siblings.length ? '<div class="list">' + siblings.map((sibling) => relationButton("Sibling", sibling)).join("") + '</div>' : '<div class="notice">No siblings.</div>') +
        '</div>';
        return '<div class="details-grid">' +
          kv.map(([k, v]) => {
            return '<div class="kv">' +
              '<div class="k">' + esc(k) + '</div>' +
              '<div class="v">' + esc(v || "—") + '</div>' +
            '</div>';
          }).join("") +
        '</div>' +
        (includeHeader ? '<div class="details-header" style="margin-top:12px;">' +
          '<h3>' + esc(item.title) + '</h3>' +
          (item.summary ? '<div class="subtitle-line">' + esc(item.summary) + '</div>' : "") +
          '<div class="badges">' + headerBadges + '</div>' +
        '</div>' : "") +
        propertiesHtml +
        relationsHtml +
        tasksHtml +
        bodyHtml +
        rawHtml;
      }

      function renderDetails(item) {
        const container = byId("details");
        container.innerHTML = buildItemDetailsMarkup(item, true);
      }

      function openItemDialog(item) {
        const dialog = byId("itemDialog");
        if (!dialog || !item) return;
        _julesDialogItemId = item.id;
        const delegateButton = byId("dialogDelegateJules");
        const canDelegate = ["task", "subtask"].includes(item.kind);
        if (delegateButton) {
          delegateButton.hidden = !canDelegate;
          delegateButton.setAttribute("aria-hidden", String(!canDelegate));
        }
        byId("dialogTitle").textContent = item.title || CANVAS_NAME;
        byId("dialogSubtitle").textContent = item.summary || "";
        byId("dialogBody").innerHTML = buildItemDetailsMarkup(item, false);
        if (!dialog.open) {
          dialog.showModal();
        }
        const taskButtons = dialog.querySelectorAll("[data-task-title]");
        taskButtons.forEach((node) => {
          node.addEventListener("click", () => {
            toast("Select the related task card to inspect its details.", "info");
          });
        });
        dialog.querySelectorAll("[data-relation-id]").forEach((node) => {
          node.addEventListener("click", () => selectItem(node.getAttribute("data-relation-id")));
        });
      }

      function selectItem(id) {
        selectedId = id;
        const item = (state.workLookup && state.workLookup[id]) ||
          (state.referenceDocuments || []).find((candidate) => candidate.id === id);
        renderColumns();
        renderArtifacts();
        if (item) {
          openItemDialog(item);
        }
      }

      async function refreshFromServer() {
        const response = await fetch("/api/refresh", { method: "POST" });
        if (!response.ok) {
          throw new Error("Refresh failed: " + response.status);
        }
        state = await response.json();
        renderAll();
      }

      function renderAll() {
        if (themePreference === null) {
          themePreference = state.themePreference || "system";
        }
        applyTheme(themePreference);
        byId("board-title").textContent = "Command Center";
        ["kanban", "jules", "docs"].forEach((tab) => {
          const button = byId("tab" + tab[0].toUpperCase() + tab.slice(1));
          const view = byId("view" + tab[0].toUpperCase() + tab.slice(1));
          const selected = activeTab === tab;
          if (button) {
            button.classList.toggle("active", selected);
            button.setAttribute("aria-selected", String(selected));
          }
          if (view) view.classList.toggle("active", selected);
        });
        renderSummary();
        renderStatusFilters();
        renderNotices();
        renderColumns();
        renderArtifacts();
        renderRoadmap();
        renderAutomations();
      }

      function renderAutomations() {
        const jules_map = state.jules || {};
        const catalog = Array.isArray(state.julesCatalog) ? state.julesCatalog : [];
        const panel = byId("automationsPanel");
        const container = byId("automations");
        if (!panel || !container) return;

        panel.style.display = "";
        const tracked = Object.entries(jules_map).map(([itemId, session]) => {
          const item = state.workLookup?.[itemId] || state.lookup?.[itemId] || state.referenceDocuments?.find((c) => c.id === itemId);
          return { ...session, itemId, title: item?.title || session.title || itemId, tracked: true };
        });
        const trackedNames = new Set(tracked.map((session) => session.sessionName));
        const remote = catalog
          .filter((session) => !trackedNames.has(session.name))
          .map((session) => ({
            ...session,
            sessionName: session.name,
            title: session.title || session.prompt || session.name,
            tracked: false,
          }));
        const query = normalize(byId("julesSearch")?.value.trim());
        const lifecycleFilter = byId("julesLifecycleFilter")?.value;
        const sessions = [...tracked, ...remote].filter((session) => {
          if (lifecycleFilter && julesLifecycle(session.state) !== lifecycleFilter) return false;
          if (!query) return true;
          return [session.title, session.name, session.sessionName, session.state, session.origin, session.lastMessage]
            .join(" ").toLowerCase().includes(query);
        });
        const activeCount = sessions.filter((session) => !JULES_TERMINAL.has(session.state)).length;
        const archivedCount = sessions.length - activeCount;
        const cards = sessions.map((session) => {
          const isTerminal = JULES_TERMINAL.has(session.state);
          const itemId = session.itemId || "";
          const pollBtn = session.tracked && !isTerminal ? '<button type="button" data-jules-poll="' + esc(itemId) + '">↻ Poll</button>' : "";
          const julesLink = session.url ? '<a href="' + esc(session.url) + '" target="_blank" rel="noopener">View session ↗</a>' : "";
          const prLink = session.prUrl ? '<a href="' + esc(session.prUrl) + '" target="_blank" rel="noopener">View PR ↗</a>' : "";
          const archiveLabel = julesLifecycle(session.state)[0].toUpperCase() + julesLifecycle(session.state).slice(1);
          const timestamps = [
            session.startedAt ? "Started " + compactPath(session.startedAt, 4) : "Start unavailable",
            session.endedAt ? "Ended " + compactPath(session.endedAt, 4) : "",
          ].filter(Boolean).join(" · ");
          return '<div class="jules-session-card">' +
            '<div class="jsc-title">' + julesEmoji(session.state) + ' ' + esc(session.title) + '</div>' +
            '<div class="jsc-meta">' + esc(archiveLabel + " · " + julesLabel(session.state)) + ' · ' + esc(session.origin || "external") + '</div>' +
            '<div class="jsc-meta">' + esc(timestamps) + (session.lastMessage ? ' · ' + esc(session.lastMessage.slice(0, 120)) : "") + '</div>' +
            '<div class="jsc-actions">' + [julesLink, prLink, pollBtn].filter(Boolean).join("") + '</div>' +
          '</div>';
        }).join("");
        container.innerHTML = '<div class="jules-toolbar"><span class="section-subtle">' +
          esc(activeCount + " active · " + archivedCount + " archived") +
          '</span><button type="button" id="refreshJulesSessions">Refresh sessions</button></div>' +
          (cards || '<div class="jules-empty">No Jules sessions found yet. Delegate a suitable task or refresh after starting one from GitHub Actions.</div>');

        const refreshSessions = byId("refreshJulesSessions");
        if (refreshSessions) {
          refreshSessions.addEventListener("click", loadJulesCatalog);
        }

        container.querySelectorAll("[data-jules-poll]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const itemId = btn.getAttribute("data-jules-poll");
            btn.disabled = true; btn.textContent = "Polling…";
            try {
              const res = await fetch("/api/jules/poll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId }) });
              if (!res.ok) throw new Error("Poll failed");
              const data = await res.json();
              if (data.jules) { state.jules = data.jules; renderAll(); toast("Jules status updated", "success"); }
            } catch { toast("Poll failed", "error"); } finally { btn.disabled = false; btn.textContent = "↻ Poll"; }
          });
        });
      }

      async function loadJulesCatalog() {
        const response = await fetch("/api/jules/sessions");
        if (!response.ok) {
          toast("Could not load Jules sessions", "warn");
          return;
        }
        const data = await response.json();
        state.julesCatalog = Array.isArray(data.sessions) ? data.sessions : [];
        renderAutomations();
      }

      function connectJulesStream() {
        if (typeof EventSource === "undefined" || julesStream) {
          return;
        }
        try {
          julesStream = new EventSource("/events");
          julesStream.addEventListener("jules", (event) => {
            try {
              const data = JSON.parse(event.data || "{}");
              if (data.jules) {
                state.jules = data.jules;
              }
              if (data.nextAction) {
                state.nextAction = data.nextAction;
              }
              renderAll();
            } catch {
              // ignore malformed payloads
            }
          });
          julesStream.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data || "{}");
              if (data.jules) {
                state.jules = data.jules;
                renderAll();
              }
            } catch {
              // ignore malformed payloads
            }
          };
          julesStream.onerror = () => {};
        } catch {
          julesStream = null;
        }
      }

      async function dispatchToJules(itemId) {
        const item = state.workLookup?.[itemId] || (state.referenceDocuments || []).find((c) => c.id === itemId);
        if (!item) { toast("Item not found", "error"); return; }
        if (!["task", "subtask"].includes(item.kind)) {
          toast("Jules delegation is available only for tasks and subtasks.", "warn");
          return;
        }

        // Check if key is configured
        const keyRes = await fetch("/api/jules/key-set");
        const keyData = keyRes.ok ? await keyRes.json() : {};
        if (!keyData.hasKey) {
          toast("JULES_API_KEY is not set. Add it to your environment or ~/.copilot/extensions/command-center/jules-api-key.txt", "error");
          return;
        }

        const confirmed = confirm(
          "Delegate to Jules AI?\\n\\n" +
          "Task: " + item.title + "\\n\\n" +
          "Jules will create a coding plan and await your approval before implementing. A PR will be opened when done.\\n\\n" +
          "Click OK to proceed."
        );
        if (!confirmed) return;

        toast("Dispatching to Jules…", "info");
        try {
          const res = await fetch("/api/jules/dispatch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemId, autoCreatePr: true, requirePlanApproval: true }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Dispatch failed");
          if (data.jules) state.jules = data.jules;
          renderAll();
          toast("Jules session created! " + (data.url ? "View at: " + data.url : ""), "success");
        } catch (err) { toast("Jules dispatch failed: " + err.message, "error"); }
      }

      byId("kanbanSearch").addEventListener("input", renderAll);
      byId("kanbanKindFilter").addEventListener("change", renderAll);
      byId("julesSearch").addEventListener("input", renderAll);
      byId("julesLifecycleFilter").addEventListener("change", renderAll);
      byId("docsSearch").addEventListener("input", renderAll);
      byId("docsTypeFilter").addEventListener("change", renderAll);
      function selectTab(tab) {
        activeTab = tab;
        renderAll();
      }
      byId("tabKanban").addEventListener("click", () => selectTab("kanban"));
      byId("tabJules").addEventListener("click", () => selectTab("jules"));
      byId("tabDocs").addEventListener("click", () => selectTab("docs"));
      byId("refreshBtn").addEventListener("click", async () => {
        byId("refreshBtn").disabled = true;
        byId("refreshBtn").textContent = "Refreshing...";
        try {
          await refreshFromServer();
          toast("Board refreshed", "success");
        } finally {
          byId("refreshBtn").disabled = false;
          byId("refreshBtn").textContent = "Refresh";
        }
      });
      byId("themeToggle").addEventListener("click", async () => {
        const options = ["system", "light", "dark"];
        const currentIndex = options.indexOf(String(themePreference || "system"));
        const nextPreference = options[(currentIndex + 1) % options.length];
        const response = await fetch("/api/theme", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ theme: nextPreference }),
        });
        if (!response.ok) {
          toast("Theme update failed", "error");
          return;
        }
        const fresh = await response.json();
        state = fresh;
        themePreference = fresh.themePreference || nextPreference;
        renderAll();
        toast("Theme: " + themeLabel(themePreference), "success");
      });

      byId("dialogClose").addEventListener("click", () => {
        const dialog = byId("itemDialog");
        if (dialog?.open) dialog.close();
      });
      byId("dialogDelegateJules").addEventListener("click", async () => {
        const itemId = _julesDialogItemId;
        if (!itemId) { toast("No item selected", "warn"); return; }
        const dialog = byId("itemDialog");
        if (dialog?.open) dialog.close();
        await dispatchToJules(itemId);
      });
      byId("itemDialog").addEventListener("close", () => {
        selectedId = selectedId;
        const delegateButton = byId("dialogDelegateJules");
        if (delegateButton) {
          delegateButton.hidden = true;
          delegateButton.setAttribute("aria-hidden", "true");
        }
      });

      if (themeMediaQuery) {
        const onThemeChange = () => {
          if (String(themePreference || "system") === "system") {
            applyTheme(themePreference);
          }
        };
        if (themeMediaQuery.addEventListener) {
          themeMediaQuery.addEventListener("change", onThemeChange);
        } else if (themeMediaQuery.addListener) {
          themeMediaQuery.addListener(onThemeChange);
        }
      }

      renderAll();
      connectJulesStream();
      loadJulesCatalog().catch(() => {});
      fetch("/api/state").then((response) => response.json()).then((fresh) => {
        state = fresh;
        renderAll();
      }).catch(() => {});
    </script>
  </body>
</html>`;
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
                currentEntry.state = await buildBoardState(currentEntry.context);
                currentEntry.stateRefreshedAt = new Date().toISOString();
                res.statusCode = 200;
                res.setHeader("Content-Type", "application/json; charset=utf-8");
                res.end(JSON.stringify(currentEntry.state));
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
                if (!["task", "subtask"].includes(item.kind)) {
                    throw { code: "unsupported_item", message: "Jules delegation is available only for tasks and subtasks." };
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

            let closed = false;
            let busy = false;
            const send = (eventName, payload) => {
                if (closed) return;
                res.write(`event: ${eventName}\n`);
                res.write(`data: ${JSON.stringify(payload)}\n\n`);
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
    };
    instances.set(instanceId, entry);
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
                        if (!["task", "subtask"].includes(item.kind)) {
                            throw new CanvasError("unsupported_item", "Jules delegation is available only for tasks and subtasks.");
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
                await loadJulesState();
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
