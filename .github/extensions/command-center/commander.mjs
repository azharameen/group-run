import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildCanonicalWorkModel, classifyReferenceDocuments } from "./services/bmad-model.mjs";

/**
 * Minimal CanvasError equivalent used by commander logic to signal canvas-level errors.
 * This mirrors the shape used in the extension but does not import the SDK.
 */
export class CanvasError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CanvasError";
    this.code = code;
  }
}

/**
 * Convert a path-like value to posix form (forward slashes).
 * @param {any} value
 * @returns {string}
 */
export function toPosix(value) {
  return String(value || "").replaceAll("\\", "/");
}

/**
 * Slugify a string into an id-friendly lower-case dash-separated value.
 * @param {any} value
 * @returns {string}
 */
export function slugify(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "item";
}

/**
 * Parse a YAML-like scalar into JS types (boolean, null, number, quoted string).
 * @param {any} raw
 */
export function parseScalar(raw) {
  const value = String(raw ?? "").trim();
  if (value === "") return "";
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (/^-?\d+$/.test(value)) return Number(value);
  if (/^-?\d+\.\d+$/.test(value)) return Number(value);
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  return value;
}

/**
 * Very small YAML-ish parser sufficient for the configuration shapes used by the extension.
 * It handles simple key: value, lists and simple nested object-list items used in front-matter.
 * @param {string} text
 */
export function parseSimpleYaml(text) {
  const result = {};
  let currentListKey = null;
  let currentObject = null;
  let currentObjectListKey = null;

  const lines = String(text ?? "").split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith("#")) continue;

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

/**
 * Parse front matter delimited by leading "---" and return { frontMatter, body }
 * @param {string} text
 */
export function parseFrontMatter(text) {
  const source = String(text ?? "");
  if (!source.startsWith("---")) return { frontMatter: {}, body: source };
  const endIndex = source.indexOf("\n---", 3);
  if (endIndex === -1) return { frontMatter: {}, body: source };
  const block = source.slice(3, endIndex).replace(/^\r?\n/, "");
  const body = source.slice(endIndex + 4).replace(/^\r?\n/, "");
  return { frontMatter: parseSimpleYaml(block), body };
}

/**
 * Check for file existence using fs.access
 * @param {string} filePath
 */
export async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read text from a file if it exists, otherwise return null.
 * @param {string} filePath
 */
export async function readTextIfExists(filePath) {
  try {
    if (!(await fileExists(filePath))) return null;
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

/**
 * Load theme preference from the standard extension preference file location.
 * If missing or malformed returns "system".
 * @param {string} prefFilePath - file path to read (optional). If omitted, uses ~/.copilot/extensions/command-center/theme-preference.json
 */
export async function loadThemePreference(prefFilePath) {
  const file = prefFilePath || path.join(os.homedir(), ".copilot", "extensions", "command-center", "theme-preference.json");
  const raw = await readTextIfExists(file);
  if (!raw) return "system";
  try {
    const data = JSON.parse(raw);
    return ["light", "dark", "system"].includes(data?.theme) ? data.theme : "system";
  } catch {
    return "system";
  }
}

/**
 * Save theme preference to disk. Returns the saved theme (sanitized).
 * @param {string} theme
 * @param {string} prefFilePath - optional path to persist
 */
export async function saveThemePreference(theme, prefFilePath) {
  const safeTheme = ["light", "dark", "system"].includes(theme) ? theme : "system";
  const file = prefFilePath || path.join(os.homedir(), ".copilot", "extensions", "command-center", "theme-preference.json");
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify({ theme: safeTheme }, null, 2), "utf8");
  return safeTheme;
}

/**
 * Recursively walk files under a directory and return full file paths.
 * @param {string} rootDir
 */
export async function walkFiles(rootDir) {
  const files = [];
  async function walk(currentDir) {
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
          continue;
        }
        if (entry.isFile()) files.push(fullPath);
      }
    } catch {
      // Skip inaccessible directories
    }
  }
  if (await fileExists(rootDir)) await walk(rootDir);
  return files;
}

/**
 * Normalize a status string to lower-case trimmed form.
 * @param {any} status
 */
export function normalizeStatus(status) {
  return String(status ?? "").trim().toLowerCase();
}

/**
 * Map a status to a progress bucket label (Open, Active, Blocked, Done)
 * @param {any} status
 */
export function progressBucket(status) {
  const value = normalizeStatus(status);
  if (!value) return "Open";
  if (["done", "complete", "completed", "closed", "resolved"].includes(value)) return "Done";
  if (["in-progress", "in progress", "review", "ready-for-dev", "ready", "active"].includes(value)) return "Active";
  if (["blocked", "blocked-by-dependency"].includes(value)) return "Blocked";
  return "Open";
}

/**
 * Test whether a given file path matches the BMad story file name pattern (e.g. 1-2-title.md)
 * @param {string} filePath
 */
export function isBmadStoryFile(filePath) {
  return /(^|[\\/])\d+-\d+-.+\.md$/i.test(filePath);
}

/**
 * Test whether a file is a supported document file type
 * @param {string} filePath
 */
export function isBmadDocFile(filePath) {
  return /\.(md|mdx|yaml|yml|json)$/i.test(filePath);
}

/**
 * Human-friendly epic phase label
 * @param {number} epicNumber
 */
export function epicPhaseLabel(epicNumber) {
  if (epicNumber === 0) return "Technical prerequisite";
  return `Sprint ${epicNumber}`;
}

/**
 * Convert a filename like 1-2-title.md to story id ST-1.2
 * @param {string} fileName
 */
export function storyIdFromFileName(fileName) {
  const match = fileName.match(/^(\d+)-(\d+)-(.+)\.md$/i);
  if (!match) return null;
  return `ST-${Number(match[1])}.${Number(match[2])}`;
}

/**
 * Convert filename to story key like 1-2
 * @param {string} fileName
 */
export function storyKeyFromFileName(fileName) {
  const match = fileName.match(/^(\d+)-(\d+)-(.+)\.md$/i);
  if (!match) return null;
  return `${Number(match[1])}-${Number(match[2])}`;
}

/**
 * Given a storyKey (1-2) and a developmentStatus map, return the matching status value.
 * @param {string} storyKey
 * @param {object} developmentStatus
 */
export function storyFileStatusKey(storyKey, developmentStatus) {
  const prefix = `${storyKey}-`;
  for (const [key, value] of Object.entries(developmentStatus || {})) {
    if (key.startsWith(prefix)) return normalizeStatus(value);
  }
  return "";
}

/**
 * Parse sprint-status.yaml content into meta, developmentStatus and actionItems
 * @param {string} text
 */
export function parseSprintStatus(text) {
  const meta = {};
  const developmentStatus = {};
  const actionItems = [];
  const lines = String(text ?? "").split(/\r?\n/);
  let section = "meta";
  let currentAction = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");
    if (!line || line.trim().startsWith("#")) continue;
    if (/^development_status:\s*$/.test(line)) { section = "development"; currentAction = null; continue; }
    if (/^action_items:\s*$/.test(line)) { section = "actions"; currentAction = null; continue; }
    if (section === "meta") {
      const match = line.match(/^([^:]+):\s*(.*)$/);
      if (match) meta[match[1].trim()] = parseScalar(match[2]);
      continue;
    }
    if (section === "development") {
      const match = line.match(/^\s{2}([^:]+):\s*(.*)$/);
      if (match) developmentStatus[match[1].trim()] = parseScalar(match[2]);
      continue;
    }
    if (section === "actions") {
      const startMatch = line.match(/^\s{2}-\s+epic:\s*(.*)$/);
      if (startMatch) { currentAction = { epic: parseScalar(startMatch[1]) }; actionItems.push(currentAction); continue; }
      const fieldMatch = line.match(/^\s{4}([^:]+):\s*(.*)$/);
      if (fieldMatch && currentAction) currentAction[fieldMatch[1].trim()] = parseScalar(fieldMatch[2]);
    }
  }

  return { meta, developmentStatus, actionItems };
}

/**
 * Parse a markdown table and return rows as arrays of cell values
 * @param {string} text
 * @param {(line:string)=>boolean} predicate
 */
export function parseMarkdownTableRows(text, predicate) {
  const rows = [];
  const lines = String(text ?? "").split(/\r?\n/);
  for (const line of lines) {
    if (!line.startsWith("|")) continue;
    if (line.includes("---")) continue;
    if (predicate && !predicate(line)) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    rows.push(cells);
  }
  return rows;
}

/**
 * Parse epic sections from planning epics markdown
 * @param {string} text
 * @param {string} sourcePath
 */
export function parseEpicsMarkdown(text, sourcePath) {
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
      if (/^\s*\*\*User value:\*\*/.test(line)) { userValue = line.replace(/^\s*\*\*User value:\*\*\s*/, "").trim(); continue; }
      if (/^\s*\*\*Dependencies:\*\*/.test(line)) { dependencies = line.replace(/^\s*\*\*Dependencies:\*\*\s*/, "").trim(); continue; }
      if (/^\s*\*\*Acceptance:\*\*/.test(line)) { acceptance = line.replace(/^\s*\*\*Acceptance:\*\*\s*/, "").trim(); continue; }
      if (!summary && line.trim() && !line.startsWith("|") && !/^###\s+/.test(line) && !/^\*\*/.test(line)) { summary = line.trim(); }
      if (line.startsWith("| Story |")) { inTable = true; continue; }
      if (inTable) {
        if (!line.startsWith("|")) { inTable = false; continue; }
        if (line.includes("---")) continue;
        const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
        if (cells.length >= 4 && /^ST-\d+\.\d+$/.test(cells[0])) {
          stories.push({ id: cells[0], layer: cells[1], title: cells[2], files: cells[3] });
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

/**
 * Extract a snippet following a heading until the next H2 (##) occurrence.
 * @param {string} text
 * @param {string} heading
 */
export function extractHeadingSnippet(text, heading) {
  const source = String(text ?? "");
  const start = source.indexOf(heading);
  if (start === -1) return "";
  const afterHeading = source.slice(start + heading.length);
  const nextHeadingMatch = afterHeading.match(/\n##\s+/);
  const snippet = nextHeadingMatch ? afterHeading.slice(0, nextHeadingMatch.index) : afterHeading;
  return snippet.trim();
}

/**
 * Parse tasks & acceptance checklist from a story markdown body.
 * @param {string} body
 */
export function parseStoryTasks(body) {
  const lines = String(body ?? "").split(/\r?\n/);
  const tasks = [];
  let inTaskSection = false;
  for (const line of lines) {
    if (/^##\s+Tasks & Acceptance/.test(line)) { inTaskSection = true; continue; }
    if (inTaskSection && /^##\s+/.test(line)) break;
    if (inTaskSection) {
      const match = line.match(/^\s*-\s+\[(x| )\]\s+(.+)$/i);
      if (match) tasks.push({ title: match[2].trim(), status: match[1].toLowerCase() === "x" ? "done" : "open" });
    }
  }
  return tasks;
}

/**
 * Parse BMad artifact root into a board structure consumable by the canvas UI.
 * @param {string} workspacePath
 * @param {string} artifactRootPath
 * @param {string} themePreference
 */
export async function parseBmadBoard(workspacePath, artifactRootPath, themePreference) {
  const implementationRoot = path.join(artifactRootPath, "implementation-artifacts");
  const planningRoot = path.join(artifactRootPath, "planning-artifacts");
  const specsRoot = path.join(artifactRootPath, "specs");
  const sprintStatusPath = path.join(implementationRoot, "sprint-status.yaml");
  const epicsPath = path.join(planningRoot, "epics.md");

  const [sprintText, epicsText] = await Promise.all([readTextIfExists(sprintStatusPath), readTextIfExists(epicsPath)]);

  if (!sprintText) {
    throw new CanvasError("missing_artifact", `Could not find ${toPosix(path.relative(workspacePath, sprintStatusPath)) || sprintStatusPath}.`);
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
    if (text == null) continue;

    const { frontMatter, body } = parseFrontMatter(text);
    const kind = fileName.endsWith(".yaml") || fileName.endsWith(".yml") ? "yaml" : fileName.endsWith(".json") ? "json" : "markdown";
    const hasStoryShape = isBmadStoryFile(filePath);

    const storyMeta = hasStoryShape ? frontMatter : {};
    const storyFileKey = hasStoryShape ? storyKeyFromFileName(fileName) : null;
    const storyTasks = hasStoryShape ? parseStoryTasks(body) : [];
    const title = String(storyMeta.title || storyMeta.name || frontMatter.title || fileName.replace(/\.(md|mdx|yaml|yml|json)$/i, ""));
    const status = normalizeStatus(
      storyMeta.status || frontMatter.status || (storyFileKey ? storyFileStatusKey(storyFileKey, sprint.developmentStatus) : "")
    );

    rawDocs.push({ path: relativePath, kind, title, frontMatter, excerpt: body.slice(0, 700).trim() });

    docItems.push({
      id: `doc-${slugify(relativePath)}`,
      kind: hasStoryShape ? "story-file" : "doc",
      title,
      status,
      phase: hasStoryShape && storyFileKey ? `Sprint ${Number(storyFileKey.split("-")[0])}` : "Reference",
      sourcePath: relativePath,
      metadata: { ...frontMatter, fileName, kind },
      tasks: storyTasks,
      body,
    });

    if (hasStoryShape && storyFileKey) {
      storyDocIndex.set(storyFileKey, { id: `doc-${slugify(relativePath)}`, path: relativePath, title, status, frontMatter, body, tasks: storyTasks });
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
        metadata: { layer: story.layer, files: story.files, storyFile: storyDoc?.path || null },
        raw: { ...story, status: storyStatus || null, storyFile: storyDoc || null },
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
        metadata: { stage: "retrospective" },
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
      metadata: { epic: actionItem.epic, owner: actionItem.owner },
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

  const CANVAS_NAME = "Command Center";

  const board = {
    title: sprint.meta.project ? `${sprint.meta.project} Command Center` : CANVAS_NAME,
    mode: "bmad",
    themePreference,
    workspacePath,
    artifactRootPath,
    sourceFiles: { sprintStatusPath: path.relative(workspacePath, sprintStatusPath), epicsPath: path.relative(workspacePath, epicsPath) },
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

/**
 * Parse a generic board JSON/YAML into the standard board shape.
 * @param {string} workspacePath
 * @param {string} boardFilePath
 * @param {string} themePreference
 */
export async function parseGenericBoard(workspacePath, boardFilePath, themePreference) {
  const text = await readTextIfExists(boardFilePath);
  if (!text) {
    throw new CanvasError("missing_artifact", `Could not read ${toPosix(path.relative(workspacePath, boardFilePath))}.`);
  }
  let data;
  try {
    if (/\.json$/i.test(boardFilePath)) data = JSON.parse(text); else data = parseSimpleYaml(text);
  } catch (err) {
    throw new CanvasError("invalid_board_file", `Invalid board file ${toPosix(path.relative(workspacePath, boardFilePath))}: ${err.message}`);
  }
  return {
    title: data.title || "Kanban Board",
    mode: "generic",
    themePreference,
    workspacePath,
    artifactRootPath: path.dirname(boardFilePath),
    sourceFiles: { boardFilePath: path.relative(workspacePath, boardFilePath) },
    meta: data.meta || {},
    counts: { epics: Array.isArray(data.epics) ? data.epics.length : 0, stories: Array.isArray(data.stories) ? data.stories.length : 0, milestones: Array.isArray(data.milestones) ? data.milestones.length : 0, actions: Array.isArray(data.actions) ? data.actions.length : 0, documents: Array.isArray(data.documents) ? data.documents.length : 0, tasks: Array.isArray(data.tasks) ? data.tasks.length : 0 },
    statusCounts: {},
    items: Array.isArray(data.items) ? data.items : [],
    documents: Array.isArray(data.documents) ? data.documents : [],
    rawDocuments: [],
    lookup: {},
    notices: ["Generic mode is active. Provide a compatible board JSON/YAML file or switch to a BMad artifact root."],
  };
}

/**
 * Build the board state from context: detects generic/auto/bmad modes.
 * @param {object} context
 */
export async function buildBoardState(context) {
  const workspacePath = context.workingDirectory || context.workspacePath || process.cwd();
  const input = context.input || {};
  const mode = String(input.mode || "auto").toLowerCase();
  const DEFAULT_ARTIFACT_ROOT = "_bmad-output";
  const artifactRootInput = input.artifactRoot || DEFAULT_ARTIFACT_ROOT;
  const artifactRootPath = path.resolve(workspacePath, artifactRootInput);
  const boardFileInput = input.boardFile ? path.resolve(workspacePath, input.boardFile) : null;
  const themePreference = await loadThemePreference();

  if (boardFileInput && (await fileExists(boardFileInput))) return decorateBoardState(await parseGenericBoard(workspacePath, boardFileInput, themePreference));
  if (mode === "generic") return decorateBoardState({ title: "Command Center", mode: "generic", themePreference, workspacePath, artifactRootPath, sourceFiles: {}, meta: {}, counts: { epics: 0, stories: 0, milestones: 0, actions: 0, documents: 0, tasks: 0 }, statusCounts: {}, items: [], documents: [], rawDocuments: [], lookup: {}, notices: ["Generic mode is active but no board file was provided.", "Point this canvas at a JSON/YAML board file or switch to a BMad artifact root." ], });

  const sprintStatusPath = path.join(artifactRootPath, "implementation-artifacts", "sprint-status.yaml");
  if (await fileExists(sprintStatusPath)) return decorateBoardState(await parseBmadBoard(workspacePath, artifactRootPath, themePreference));

  return decorateBoardState({ title: "Command Center", mode: "generic", themePreference, workspacePath, artifactRootPath, sourceFiles: {}, meta: {}, counts: { epics: 0, stories: 0, milestones: 0, actions: 0, documents: 0, tasks: 0 }, statusCounts: {}, items: [], documents: [], rawDocuments: [], lookup: {}, notices: [ `No BMad artifacts found under ${toPosix(path.relative(workspacePath, artifactRootPath) || artifactRootInput)}.`, "The canvas still opens, but you need to point it at a compatible artifact root or board file." ], });
}

/**
 * Summarize a board state into a small overview object.
 * @param {object} state
 */
export function summarizeState(state) {
  const items = Array.isArray(state.items) ? state.items : [];
  const counts = items.reduce((acc, item) => {
    acc.total += 1;
    acc.byKind[item.kind] = (acc.byKind[item.kind] || 0) + 1;
    acc.byStatus[item.status || "unassigned"] = (acc.byStatus[item.status || "unassigned"] || 0) + 1;
    return acc;
  }, { total: 0, byKind: {}, byStatus: {} });
  return { total: counts.total, byKind: counts.byKind, byStatus: counts.byStatus, workCounts: state.workCounts || {}, referenceDocuments: state.referenceDocuments?.length || 0, notices: state.notices || [], title: state.title, mode: state.mode };
}

/**
 * Decide next action suggestion for a board state (skill/agent hint, jules suitability)
 * @param {object} state
 */
export function buildNextActionSuggestion(state) {
  const items = Array.isArray(state.workItems) ? state.workItems : (Array.isArray(state.items) ? state.items : []);
  const openStories = items.filter((item) => item.kind === "story" && ["open", "Open", "ready-for-dev", "backlog"].includes(item.status));
  const reviewStories = items.filter((item) => item.kind === "story" && ["review", "in-review"].includes(item.status));
  const openActions = items.filter((item) => item.kind === "action-item" && ["open", "Open", "in-progress"].includes(item.status));
  const allEpics = items.filter((item) => item.kind === "epic");
  const allDone = allEpics.length > 0 && allEpics.every((epic) => ["done", "Done"].includes(epic.status));

  let skill = null; let agent = null; let reason = null; let sessionReuse = true; let julesCanHandle = false; let julesPrompt = null; let targetItemId = null;

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
    julesPrompt = julesCanHandle ? `Implement the story ${item.title}${item.metadata?.storyFile ? ` using ${item.metadata.storyFile}` : ""}${item.summary ? `.` : ""}${item.summary ? `\n\nContext: ${item.summary}` : ""}` : null;
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

/**
 * Build a prompt string to send to Jules for an item. If 'prompt' is provided returns it.
 * @param {object} state
 * @param {object} item
 * @param {string|null} prompt
 */
export function buildJulesTaskPrompt(state, item, prompt) {
  if (prompt) return prompt;
  const lookup = state?.workLookup || {};
  const ancestors = [];
  let current = item;
  while (current?.parentId && lookup[current.parentId]) { current = lookup[current.parentId]; ancestors.unshift(current); }
  const children = Array.isArray(item?.children) ? item.children : [];
  const story = [item, ...ancestors].find((candidate) => candidate?.kind === "story");
  const storyDocument = story?.metadata?.storyFile ? (state.documents || []).find((document) => document.kind === "story-file" && document.sourcePath === story.metadata.storyFile) : (item?.sourcePath ? (state.documents || []).find((document) => document.kind === "story-file" && document.sourcePath === item.sourcePath) : null);
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

/**
 * Decorate a raw board state with canonical work model and classification.
 * @param {object} state
 */
export function decorateBoardState(state) {
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

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

export function renderHtml(instanceId, initialState) {
    const CANVAS_NAME = "Command Center";
    const initialJson = JSON.stringify(initialState ?? {})
        .replaceAll("<", "\\u003c")
        .replaceAll("\u2028", "\\u2028")
        .replaceAll("\u2029", "\\u2029");
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
      .dialog-close:hover,
      .jules-toolbar button:hover {
        border-color: var(--accent);
        color: var(--accent);
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
      .jules-icon-button img {
        width: 20px;
        height: 20px;
        display: block;
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
      /* Command-center visual system: fewer containers, stronger hierarchy. */
      :root {
        --radius-control: 6px;
        --radius-card: 8px;
        --radius-dialog: 12px;
        --surface-command: color-mix(in srgb, var(--surface) 92%, var(--accent) 8%);
      }
      body {
        background: var(--bg);
      }
      header {
        padding: 10px 18px 0;
        background: color-mix(in srgb, var(--surface) 94%, transparent);
        box-shadow: 0 1px 0 var(--border);
      }
      .topbar { align-items: center; }
      h1 { letter-spacing: -.02em; }
      .tab-list { margin-top: 8px; }
      .tab-button { padding: 8px 14px 9px; }
      main {
        width: min(100%, 1540px);
        margin: 0 auto;
        padding: 16px 20px 28px;
      }
      .tab-view.active { gap: 16px; }
      .tab-controls { margin-bottom: 4px; }
      .tab-controls input, .tab-controls select, .tab-controls button,
      .toolbar input, .toolbar select, .toolbar button {
        border-radius: var(--radius-control);
      }
      .status-filters { gap: 6px; margin-top: 2px; }
      .filter-chip {
        border-radius: var(--radius-control);
        padding: 5px 9px;
        gap: 6px;
        font-size: 12px;
      }
      .summary {
        display: flex;
        gap: 0;
        border-top: 1px solid var(--border);
        border-bottom: 1px solid var(--border);
        background: transparent;
      }
      .stat {
        flex: 1 1 0;
        min-width: 110px;
        border: 0;
        border-right: 1px solid var(--border);
        border-radius: 0;
        padding: 10px 14px;
        background: transparent;
        box-shadow: none;
      }
      .stat:first-child { padding-left: 0; }
      .stat:last-child { border-right: 0; }
      .stat .value { margin-top: 2px; font-size: 20px; }
      .layout { display: block; }
      .panel {
        border: 0;
        border-radius: 0;
        background: transparent;
        box-shadow: none;
        overflow: visible;
      }
      .panel h2 {
        padding: 0 0 8px;
        background: transparent;
        border-bottom: 1px solid var(--border);
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: .06em;
      }
      .panel-body { padding: 0; }
      .columns {
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 18px;
      }
      .column {
        border: 0;
        border-top: 2px solid var(--border);
        border-radius: 0;
        background: transparent;
        box-shadow: none;
        overflow: visible;
      }
      .column h2 {
        padding: 9px 0 8px;
        border-bottom: 1px solid var(--border);
        background: transparent;
        font-size: 13px;
      }
      .cards { padding: 0; gap: 0; }
      .card {
        border: 0;
        border-left: 3px solid var(--border);
        border-bottom: 1px solid var(--border-soft);
        border-radius: 0;
        padding: 11px 10px;
        background: transparent;
      }
      .card:hover {
        border-color: var(--accent);
        background: var(--surface-subtle);
        box-shadow: none;
      }
      .card.selected { outline: 2px solid color-mix(in srgb, var(--accent) 55%, transparent); outline-offset: -2px; }
      .card-meta { margin-top: 4px; }
      .badges { margin-top: 6px; gap: 4px; }
      .badge { border-radius: 4px; padding: 2px 6px; }
      .roadmap-card, .jules-session-card, .jules-empty {
        border-radius: var(--radius-card);
        box-shadow: none;
      }
      .columns.list-view { grid-template-columns: 1fr; }
      .columns.list-view .column { border-top: 1px solid var(--border); }
      .columns.list-view .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); column-gap: 18px; }
      @media (max-width: 900px) {
        .columns { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .summary { overflow-x: auto; }
        .stat { min-width: 120px; }
      }
      @media (max-width: 560px) {
        main { padding: 12px; }
        .columns { grid-template-columns: 1fr; }
        .topbar { grid-template-columns: 1fr auto; }
      }      /* Phase 3-5: distinct execution and reference surfaces. */
      .details-grid { gap: 0; border-top: 1px solid var(--border); }
      .details-grid .kv {
        border: 0;
        border-bottom: 1px solid var(--border-soft);
        border-radius: 0;
        padding: 9px 0;
        background: transparent;
      }
      .relation-group { border-top: 1px solid var(--border); padding-top: 12px; }
      .relation-group .list { gap: 0; }
      .relation-group .list-item {
        border: 0;
        border-bottom: 1px solid var(--border-soft);
        border-radius: 0;
        padding-left: 0;
        padding-right: 0;
        background: transparent;
      }
      .dialog-shell { padding: 22px; }
      dialog { border-radius: var(--radius-dialog); }
      #automations { border-top: 1px solid var(--border); }
      #automations .jules-toolbar { padding: 10px 0; margin: 0; }
      .jules-session-card {
        border: 0;
        border-bottom: 1px solid var(--border-soft);
        border-radius: 0;
        padding: 12px 0;
        margin: 0;
        grid-template-columns: minmax(0, 1.7fr) minmax(150px, .8fr) minmax(180px, 1fr) auto;
        align-items: center;
        column-gap: 14px;
        display: grid;
        background: transparent;
      }
      .jules-session-card .jsc-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .jules-session-card .jsc-meta { margin: 0; }
      .jules-session-card .jsc-actions { justify-content: flex-end; margin: 0; }
      .jules-empty { border: 1px dashed var(--border); border-radius: var(--radius-card); margin-top: 12px; }
      #artifacts { border-top: 1px solid var(--border); }
      #artifacts .list-item {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(180px, .7fr);
        align-items: center;
        gap: 16px;
        border: 0;
        border-bottom: 1px solid var(--border-soft);
        border-radius: 0;
        padding: 12px 0;
        background: transparent;
      }
      #artifacts .list-item small { margin: 0; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      @media (max-width: 760px) {
        .jules-session-card { grid-template-columns: 1fr; gap: 6px; }
        .jules-session-card .jsc-actions { justify-content: flex-start; }
        #artifacts .list-item { grid-template-columns: 1fr; gap: 4px; }
        #artifacts .list-item small { text-align: left; }
      }      /* Final accessibility and responsive hardening. */
      :focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }
      button:disabled, select:disabled, input:disabled { cursor: not-allowed; opacity: .62; }
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after {
          scroll-behavior: auto !important;
          transition-duration: .01ms !important;
          animation-duration: .01ms !important;
          animation-iteration-count: 1 !important;
        }
      }
      @media (max-width: 560px) {
        .topbar { gap: 8px; }
        .tab-list { overflow-x: auto; scrollbar-width: thin; }
        .tab-button { flex: 0 0 auto; }
        .tab-controls input { min-width: 0; flex-basis: 100%; }
        .summary { margin-inline: -12px; padding-inline: 12px; }
        .dialog-shell { padding: 16px; }
      }

      /* Filter contrast: active controls must remain readable in both themes. */
      .filter-chip {
        background: var(--surface-subtle);
        color: var(--text);
        border-color: var(--border);
      }
      .filter-chip.active {
        background: var(--accent-soft);
        color: #1e3a8a;
        border-color: var(--accent);
      }
      .filter-chip.active small { color: inherit; opacity: .82; }
      :root[data-theme="dark"] .filter-chip.active {
        background: #1d4ed8;
        color: #f8fafc;
        border-color: #93c5fd;
      }
      :root[data-theme="dark"] .filter-chip.active small { color: #f8fafc; }
      .filter-chip:hover { border-color: var(--accent); }    </style>
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
            <button class="dialog-close jules-icon-button" id="dialogDelegateJules" type="button" title="Delegate this task to Jules" aria-label="Delegate this task to Jules" hidden><img src="https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/google-jules.svg" alt="" aria-hidden="true"></button>
            <button class="dialog-close jules-icon-button" id="dialogClose" type="button" title="Close" aria-label="Close">&times;</button>
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
      let selectedStatuses = new Set(["Blocked", "Active", "Open"]);
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
        container.classList.add("list-view");
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
        const subtitle = item.summary && normalize(item.summary) !== normalize(item.title) ? item.summary : "";
        const relation = parent
          ? "Parent: " + parent.title
          : ((state.workLookup?.[item.id]?.children || []).length ? "Root · " + state.workLookup[item.id].children.length + " children" : "Root work item");
        return '<div class="card ' + selected + '" data-item-id="' + esc(item.id) + '">' +
          '<div class="card-head">' +
            '<div class="card-title">' + esc(item.title) + '</div>' +
          '</div>' +
          (subtitle ? '<div class="card-meta">' + esc(subtitle) + '</div>' : '') +
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
              "Use the 🤖 Delegate button in any card dialog.",
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
        }).join("");

        container.querySelectorAll("[data-status-filter]").forEach((node) => {
          node.addEventListener("click", () => {
            const status = node.getAttribute("data-status-filter");
            toggleStatus(status);
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
          selectedStatuses = new Set(["Blocked", "Active", "Open"]);
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

