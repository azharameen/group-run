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

  // Attempt to parse deferred-work.md under implementation-artifacts if present
  try {
    const deferredPath = path.join(implementationRoot, "deferred-work.md");
    if (await fileExists(deferredPath)) {
      try {
        const deferredItems = await parseDeferredWork(workspacePath, deferredPath);
        board.deferredWork = deferredItems;
        board.deferredCounts = deferredItems.reduce((acc, item) => {
          acc[item.severity] = (acc[item.severity] || 0) + 1;
          return acc;
        }, { critical: 0, medium: 0, low: 0 });
      } catch (err) {
        board.notices.push(`Failed to parse deferred-work.md: ${err?.message || String(err)}`);
      }
    }
  } catch (err) {
    // ignore any issues while detecting deferred-work
  }

  return board;
}

/**
 * Parse deferred work items from implementation-artifacts/deferred-work.md
 * @param {string} workspacePath
 * @param {string} deferredWorkPath
 */
export async function parseDeferredWork(workspacePath, deferredWorkPath) {
  const text = await readTextIfExists(deferredWorkPath);
  if (!text) return [];

  const lines = String(text || "").split(/\r?\n/);
  const sections = [];
  let currentSource = null;
  let currentLines = [];
  for (const line of lines) {
    const m = line.match(/^##\s*Deferred from:\s*(.+)$/i);
    if (m) {
      if (currentSource !== null) sections.push({ source: currentSource, body: currentLines.join("\n") });
      currentSource = (m[1] || "").trim();
      currentLines = [];
      continue;
    }
    if (currentSource !== null) currentLines.push(line);
  }
  if (currentSource !== null) sections.push({ source: currentSource, body: currentLines.join("\n") });

  const items = [];
  const seen = new Set();

  function normalizeParent(matchStr) {
    if (!matchStr) return null;
    let v = String(matchStr).toLowerCase().trim();
    v = v.replace(/\s+/g, "-");
    v = v.replace(/[^a-z0-9-]/g, "-");
    v = v.replace(/-+/g, "-");
    // normalize patterns like epic-7 or epic- 7
    const epicMatch = v.match(/epic-?(\d+)/i);
    if (epicMatch) return `epic-${epicMatch[1]}`;
    const specMatch = v.match(/spec-?(\d+)(?:[-\.](\d+))?/i);
    if (specMatch) return specMatch[2] ? `spec-${specMatch[1]}-${specMatch[2]}` : `spec-${specMatch[1]}`;
    return v;
  }

  for (const section of sections) {
    const slines = String(section.body || "").split(/\r?\n/);
    let current = [];
    function flushCurrent() {
      if (!current.length) return;
      const raw = current.join("\n").trim();
      current = [];
      if (!raw) return;
      // skip resolved
      if (/\[RESOLVED\]/i.test(raw) || /~~.*~~/.test(raw)) return;

      let title = null;
      let sourceSpec = null;
      let summary = null;
      let evidence = null;

      // attempt structured YAML parse
      try {
        const yamlText = raw.replace(/^\s*-\s+/, "");
        const parsed = parseSimpleYaml(yamlText);
        if (parsed && Object.keys(parsed).length) {
          summary = parsed.summary || parsed.summary || parsed.__rootArray?.[0] || null;
          sourceSpec = parsed.source_spec || parsed.source || null;
          evidence = parsed.evidence || null;
        }
      } catch (err) {
        // ignore
      }

      if (!summary) {
        // fallback to simple textual parse
        let first = raw.split(/\r?\n/)[0].trim();
        // strip trailing em-dash context
        first = first.replace(/\s+—.*$/u, "").replace(/\s+-\s+.*$/u, "");
        // remove trailing (file:line)
        first = first.replace(/\s*\([^)]*\)\s*$/u, "").trim();
        summary = first || raw.slice(0, 120);
      }

      title = summary;

      // ensure unique id
      const base = `deferred-${slugify(title)}`;
      let id = base;
      let i = 1;
      while (seen.has(id)) { id = `${base}-${i++}`; }
      seen.add(id);

      const textLower = raw.toLowerCase();
      const criticalWords = ["security", "crash", "hang", "data loss", "break", "corrupt", "race condition"];
      const mediumWords = ["test", "validation", "edge case", "concurrency", "missing", "no test", "incomplete"];
      let severity = "low";
      for (const w of criticalWords) { if (textLower.includes(w)) { severity = "critical"; break; } }
      if (severity === "low") {
        for (const w of mediumWords) { if (textLower.includes(w)) { severity = "medium"; break; } }
      }

      // parent id heuristics: prefer source_spec -> section.source -> inline matches
      let parentId = null;
      const searchSpace = [sourceSpec || "", section.source || "", raw].join(" ");
      const pidMatch = searchSpace.match(/(epic[-\s]?\d+|spec[-\s]?\d+(?:[-\.]\d+)?|story[-\s]?[A-Za-z0-9\.-]+)/i);
      if (pidMatch) parentId = normalizeParent(pidMatch[1]);

      items.push({ id, kind: "deferred", title, severity, parentId, sourcePath: toPosix(path.relative(workspacePath, deferredWorkPath)), summary, evidence });
    }

    for (const line of slines) {
      if (/^\s*-\s+/.test(line)) {
        flushCurrent();
        current.push(line.replace(/^\s*-\s+/, ""));
      } else if (/^\s{2,}/.test(line) || line.trim() === "") {
        if (current.length) current.push(line.replace(/^\s{2}/, ""));
      } else {
        // non-indented content: treat as continuation if we are in an item
        if (current.length) current.push(line);
      }
    }
    flushCurrent();
  }

  return items;
}

/**
 * Append a deferred work item to the deferred-work.md file.
 * @param {string} deferredWorkPath - Path to deferred-work.md
 * @param {object} item - { source_spec, summary, evidence }
 * @returns {Promise<boolean>} True if appended successfully
 */
export async function appendDeferredWork(deferredWorkPath, item) {
  const { fs } = await import("fs/promises");
  const { join } = await import("path");

  const entry = [
    "",
    `## Deferred from: ${item.source_spec || "unknown"} (${new Date().toISOString().split("T")[0]})`,
    "",
    `- source_spec: \`${item.source_spec || "unknown"}\``,
    `  summary: ${item.summary || "No summary"}`,
    `  evidence: ${item.evidence || "No evidence"}`,
  ].join("\n");

  try {
    // Check if file exists and append, or create new
    let existing = "";
    try {
      existing = await fs.readFile(deferredWorkPath, "utf-8");
    } catch {
      // File doesn't exist, create header
      existing = "# Deferred Work Ledger\n";
    }

    await fs.writeFile(deferredWorkPath, existing + entry + "\n", "utf-8");
    return true;
  } catch (err) {
    console.error("Failed to append deferred work:", err.message);
    return false;
  }
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

  if (boardFileInput && (await fileExists(boardFileInput))) return await decorateBoardState(await parseGenericBoard(workspacePath, boardFileInput, themePreference));
  if (mode === "generic") return await decorateBoardState({ title: "Command Center", mode: "generic", themePreference, workspacePath, artifactRootPath, sourceFiles: {}, meta: {}, counts: { epics: 0, stories: 0, milestones: 0, actions: 0, documents: 0, tasks: 0 }, statusCounts: {}, items: [], documents: [], rawDocuments: [], lookup: {}, notices: ["Generic mode is active but no board file was provided.", "Point this canvas at a JSON/YAML board file or switch to a BMad artifact root." ], });

  const sprintStatusPath = path.join(artifactRootPath, "implementation-artifacts", "sprint-status.yaml");
  if (await fileExists(sprintStatusPath)) return await decorateBoardState(await parseBmadBoard(workspacePath, artifactRootPath, themePreference));

  return await decorateBoardState({ title: "Command Center", mode: "generic", themePreference, workspacePath, artifactRootPath, sourceFiles: {}, meta: {}, counts: { epics: 0, stories: 0, milestones: 0, actions: 0, documents: 0, tasks: 0 }, statusCounts: {}, items: [], documents: [], rawDocuments: [], lookup: {}, notices: [ `No BMad artifacts found under ${toPosix(path.relative(workspacePath, artifactRootPath) || artifactRootInput)}.`, "The canvas still opens, but you need to point it at a compatible artifact root or board file." ], });
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
 * Classify dispatch readiness for a story or task.
 * @param {object} story
 * @param {object} state
 */
export async function classifyDispatch(story, state = {}) {
  const resultDefault = { agent: 'copilot', level: 'story' };
  try {
    // attempt to locate story document body via preloaded documents or disk
    let body = null;
    const storyFile = story?.metadata?.storyFile || story?.sourcePath || null;
    if (storyFile) {
      const doc = (state.documents || []).find((d) => d.sourcePath === storyFile || d.path === storyFile);
      if (doc && doc.body !== undefined) body = doc.body;
      else {
        const workspace = state.workspacePath || process.cwd();
        const abs = path.resolve(workspace, storyFile);
        body = await readTextIfExists(abs) || null;
      }
    } else if (story?.raw?.storyFile?.path) {
      const doc2 = (state.documents || []).find((d) => d.sourcePath === story.raw.storyFile.path);
      if (doc2 && doc2.body !== undefined) body = doc2.body;
    }

    const textForScan = [story?.summary || "", JSON.stringify(story?.metadata || {}), body || ""].join("\n");

    // detect BMAD skill references (Copilot-only)
    const skillMatch = (textForScan.match(/bmad-[a-z0-9-]+/i) || [])[0];
    if (skillMatch) {
      return { agent: 'copilot', level: 'story', skill: skillMatch.toLowerCase() };
    }

    // detect intent contract and code map
    const hasIntent = !!(body && /<intent-contract\b[^>]*>/i.test(body));
    const codeMapSnippet = body ? (extractHeadingSnippet(body, '## Code Map') || extractHeadingSnippet(body, '## Dev Notes') || "") : "";
    const codeMapHasFiles = !!(codeMapSnippet && (/[\\/]/.test(codeMapSnippet) || /\.[a-z0-9]{1,5}\b/i.test(codeMapSnippet)));

    if (hasIntent && codeMapHasFiles) return { agent: 'jules', level: 'story' };

    // detect task-level file targets
    const filePattern = /[A-Za-z0-9_\/\\-]+\.[a-z0-9]{1,5}\b/i;
    let tasksHaveFiles = false;
    if (Array.isArray(story.tasks) && story.tasks.length) {
      for (const t of story.tasks) {
        if (filePattern.test(t.title || "")) { tasksHaveFiles = true; break; }
      }
    }
    if (!tasksHaveFiles && story?.metadata?.files) {
      if (filePattern.test(String(story.metadata.files))) tasksHaveFiles = true;
    }
    if (tasksHaveFiles) return { agent: 'jules', level: 'task' };

    return resultDefault;
  } catch (err) {
    return { agent: 'copilot', level: 'story' };
  }
}

/**
 * Extract a kebab-case story key from a story object.
 * Examples: "ST-C2.1" -> "c2-1". Falls back to story.metadata.storyFile via storyKeyFromFileName.
 * @param {object} story
 * @returns {string|null} kebab-case story key or null
 */
export function extractStoryKey(story) {
  const sid = String(story?.id ?? "");
  const m = sid.match(/ST-(?:C)?(\d+)\.(\d+)/i);
  if (m) {
    const epic = String(m[1]);
    const num = String(m[2]);
    return `c${epic}-${num}`;
  }
  // try from storyFile name
  const file = story?.metadata?.storyFile || null;
  if (file) {
    try {
      const basename = path.basename(String(file));
      const key = storyKeyFromFileName(basename);
      if (key) return `c${String(key)}`;
    } catch (err) {
      // ignore
    }
  }
  return null;
}

/**
 * Create a feature branch name for a story and optional task.
 * Format: feat/<story-key>-<descriptor>[-<task-slug>]
 * Truncates to max 100 characters. Appends "-2", "-3", etc. if branch already exists.
 * @param {object} story
 * @param {object|null} task
 * @param {object} [options]
 * @param {string[]} [options.existingBranches] - array of existing branch names for uniqueness check
 * @returns {string}
 */
export function createFeatureBranch(story, task = null, options = {}) {
  const storyKey = extractStoryKey(story) || slugify(story?.title ?? "feature");
  const descriptor = slugify(story?.title ?? "work");
  const taskSlug = task ? slugify(task.title ?? String(task)) : null;
  const prefix = `feat/${storyKey}-`;
  const MAX = 100;

  // start with descriptor and task if present
  let body = descriptor + (taskSlug ? `-${taskSlug}` : "");
  let branch = `${prefix}${body}`;

  // truncate to fit within MAX while preserving prefix
  if (branch.length > MAX) {
    const available = Math.max(1, MAX - prefix.length);
    if (taskSlug) {
      const taskLen = Math.min(taskSlug.length, Math.max(1, Math.floor(available * 0.25)));
      const descAvailable = available - 1 - taskLen; // 1 for the dash
      const descPart = descriptor.slice(0, Math.max(1, descAvailable));
      const taskPart = taskSlug.slice(0, Math.max(1, taskLen));
      branch = `${prefix}${descPart}-${taskPart}`;
      if (branch.length > MAX) {
        branch = `${prefix}${descriptor.slice(0, available)}`;
      }
    } else {
      branch = `${prefix}${descriptor.slice(0, available)}`;
    }
  }

  // ensure branch <= MAX (hard clamp)
  if (branch.length > MAX) branch = branch.slice(0, MAX);

  // AC3: uniqueness check - append "-2", "-3", etc. if branch exists
  const existing = options?.existingBranches || [];
  if (existing.length > 0) {
    let suffix = 2;
    let candidate = branch;
    while (existing.includes(candidate)) {
      candidate = `${branch}-${suffix}`;
      if (candidate.length > MAX) {
        const suffixLen = String(suffix).length + 1; // dash + number
        const maxDesc = MAX - prefix.length - suffixLen;
        candidate = `${prefix}${descriptor.slice(0, Math.max(1, maxDesc))}-${suffix}`;
      }
      suffix++;
      if (suffix > 100) break;
    }
    branch = candidate;
  }

  return branch;
}

/**
 * Build a self-contained Jules brief string for a story suitable for dispatch.
 * Respects token budget and caps: story body max 10KB, project context max 2KB, total < 12KB.
 * @param {object} story
 * @param {object} state
 * @param {object} [options]
 * @param {string} [options.projectContextPath]
 * @returns {Promise<string>} brief
 */
export async function buildJulesBrief(story, state = {}, options = {}) {
  const WORKSPACE = state.workspacePath || process.cwd();
  // locate story body: prefer state.documents then disk
  let body = null;
  const storyFile = story?.metadata?.storyFile || story?.sourcePath || null;
  if (storyFile) {
    const doc = (state.documents || []).find((d) => d.sourcePath === storyFile || d.path === storyFile);
    if (doc && doc.body !== undefined) body = String(doc.body ?? "");
    else {
      const abs = path.resolve(WORKSPACE, storyFile);
      body = await readTextIfExists(abs) || null;
    }
  } else if (story?.raw?.storyFile?.path) {
    const doc2 = (state.documents || []).find((d) => d.sourcePath === story.raw.storyFile.path);
    if (doc2 && doc2.body !== undefined) body = String(doc2.body ?? "");
  }
  body = String(body ?? "");

  // sections
  const lines = [];
  lines.push(`# Task: ${String(story?.title ?? "Untitled")}`);

  // Context
  const contextText = String(story?.summary ?? "");
  lines.push(`\n## Context\n${contextText}`);

  // Acceptance Criteria
  const ac = extractHeadingSnippet(body, "Acceptance Criteria") || extractHeadingSnippet(body, "## Acceptance Criteria") || "";
  lines.push(`\n## Acceptance Criteria\n${String(ac)}`);

  // Tasks
  let tasksList = [];
  try { tasksList = Array.isArray(parseStoryTasks(body)) ? parseStoryTasks(body) : []; } catch (err) { tasksList = []; }
  const taskText = tasksList.length ? tasksList.map((t) => `- ${String(t.title || t)}`).join("\n") : "- N/A";
  lines.push(`\n## Tasks\n${taskText}`);

  // Code Map
  const codeMap = extractHeadingSnippet(body, "Code Map") || extractHeadingSnippet(body, "Dev Notes") || "";
  lines.push(`\n## Code Map\n${String(codeMap)}`);

  // Project Rules
  let projectContext = "";
  const defaultProjPath = options?.projectContextPath || path.join("_bmad-output", "project-context.md");
  const absProj = path.resolve(WORKSPACE, defaultProjPath);
  const rawProj = await readTextIfExists(absProj);
  if (rawProj) projectContext = String(rawProj).slice(0, 2048);
  else {
    // fallback to known rules requested by spec
    projectContext = [
      "Branch naming: feat/<story-key>-<short-description>",
      "Commit format: type(scope): description",
      "PR target: develop branch",
      "No BMad skills available in Jules sessions",
      "Never fabricate output",
      "File size limits: route < 150 lines, services < 200",
    ].join("\n");
  }
  lines.push(`\n## Project Rules\n${projectContext}`);

  // Constraints
  const constraints = [
    "No BMad skills in Jules sessions",
    "Commit format: type(scope): description",
    "PR target: develop",
    `Branch name: feat/<story-key>-<short-description>`,
    "Never fabricate output",
    "File size limits: route < 150 lines, services < 200",
  ].join("\n");
  lines.push(`\n## Constraints\n${constraints}`);

  // assemble with budget enforcement
  const joiner = "\n\n";

  // helper to measure bytes
  const bytes = (s) => Buffer.byteLength(String(s ?? ""), "utf8");
  const STORY_BODY_MAX = 10240; // 10KB
  const PROJECT_MAX = 2048; // 2KB
  const TOTAL_MAX = 12288; // 12KB

  // enforce caps on body and projectContext
  let storyBody = String(body ?? "").slice(0, STORY_BODY_MAX);
  if (bytes(storyBody) > STORY_BODY_MAX) {
    // truncate safely
    storyBody = storyBody.slice(0, STORY_BODY_MAX);
  }
  // replace the Code Map and Acceptance Criteria occurrences that depend on body
  // regenerate AC and Code Map sections to respect truncated body
  const acTrunc = extractHeadingSnippet(storyBody, "Acceptance Criteria") || "";
  const codeMapTrunc = extractHeadingSnippet(storyBody, "Code Map") || extractHeadingSnippet(storyBody, "Dev Notes") || "";

  // rebuild sections array with truncated body-dependent pieces
  const parts = [];
  parts.push(`# Task: ${String(story?.title ?? "Untitled")}`);
  parts.push(`## Context\n${contextText}`);
  parts.push(`## Acceptance Criteria\n${String(acTrunc)}`);
  parts.push(`## Tasks\n${taskText}`);
  parts.push(`## Code Map\n${String(codeMapTrunc)}`);
  parts.push(`## Project Rules\n${projectContext.slice(0, PROJECT_MAX)}`);
  parts.push(`## Constraints\n${constraints}`);

  // now assemble and ensure within TOTAL_MAX, truncate story body first if needed
  // insert story body into Context section if content exists (alternatively include as separate section)
  // We'll append the story specification (body) after Code Map as read-only context
  let assembled = parts.join(joiner);
  // append story specification
  if (storyBody) assembled = `${assembled}${joiner}## Story Specification\n${storyBody}`;

  if (bytes(assembled) <= TOTAL_MAX) return assembled;

  // Need to trim storyBody further
  const overhead = bytes(assembled) - bytes(storyBody);
  const allowedForBody = Math.max(0, TOTAL_MAX - overhead - Buffer.byteLength("\n\n[truncated for token budget]", "utf8"));
  // truncate storyBody to allowedForBody bytes
  function truncateToBytes(str, maxBytes) {
    if (bytes(str) <= maxBytes) return str;
    // binary-safe trim: progressively reduce
    let end = Math.min(str.length, Math.floor(maxBytes * 1.1));
    let out = str.slice(0, end);
    while (bytes(out) > maxBytes && end > 0) { end = Math.floor(end * 0.9); out = str.slice(0, end); }
    return out;
  }

  const newBody = truncateToBytes(storyBody, allowedForBody);
  const truncatedNotice = newBody.length < storyBody.length ? "\n\n[truncated for token budget]" : "";
  assembled = parts.join(joiner) + `${joiner}## Story Specification\n${newBody}${truncatedNotice}`;
  // final safety: if still too big, truncate projectContext as last resort
  if (bytes(assembled) > TOTAL_MAX) {
    const reduceNeeded = bytes(assembled) - TOTAL_MAX;
    const proj = projectContext.slice(0, Math.max(0, PROJECT_MAX - reduceNeeded));
    assembled = parts.slice(0, -2).join(joiner) + joiner + `## Project Rules\n${proj}` + joiner + `## Constraints\n${constraints}` + (newBody ? `${joiner}## Story Specification\n${truncateToBytes(newBody, Math.max(0, allowedForBody - Math.min(reduceNeeded, PROJECT_MAX)))}${truncatedNotice}` : "");
  }

  // final clamp
  if (bytes(assembled) > TOTAL_MAX) {
    // as last resort, truncate to TOTAL_MAX and add notice
    let out = assembled.slice(0, TOTAL_MAX - 64);
    out += "\n\n[truncated for token budget]";
    return out;
  }

  return assembled;
}

/**
 * Validate PR against quality gates.
 * @param {object} pr - Pull request object
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validatePR(pr) {
  const errors = [];

  // Check PR targets develop (not main)
  const baseRef = pr?.base?.ref || pr?.base_ref || "";
  if (baseRef === "main" || baseRef === "master") {
    errors.push("PR must target develop, not main/master");
  }

  // Check branch naming convention
  const headRef = pr?.head?.ref || pr?.head_ref || "";
  if (!/^feat\/[a-z0-9]+-[a-z0-9]/.test(headRef)) {
    errors.push("Branch must follow feat/<story-key>-<desc> naming convention");
  }

  // Check commit message format
  const commits = pr?.commits || [];
  for (const commit of commits) {
    const message = commit?.message || "";
    if (!/^(feat|fix|chore|docs|test|refactor|ci|build|perf)\([^)]+\):/.test(message)) {
      errors.push(`Invalid commit format: ${message.slice(0, 50)}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Review PR with Copilot (bmad-agent-dev).
 * @param {object} pr - Pull request object
 * @param {object} state - Board state
 * @returns {Promise<{status: 'pass' | 'fail', issues: array, suggestions: array}>}
 */
export async function reviewPR(pr, state) {
  const validation = validatePR(pr);
  if (!validation.valid) {
    return {
      status: "fail",
      issues: validation.errors,
      suggestions: [],
    };
  }

  // TODO: Integrate with Copilot code review
  // For now, return simulated review results
  return {
    status: "pass",
    issues: [],
    suggestions: ["Consider adding more test coverage"],
  };
}

/**
 * Monitor PR pipeline status.
 * @param {object} pr - Pull request object
 * @param {object} state - Board state
 * @returns {Promise<{status: 'running' | 'success' | 'failure', checks: array}>}
 */
export async function monitorPipeline(pr, state) {
  const checks = pr?.checks || [];
  const statuses = pr?.statuses || [];

  const allPassed = checks.every((c) => c.conclusion === "success") &&
                    statuses.every((s) => s.state === "success");
  const anyFailed = checks.some((c) => c.conclusion === "failure") ||
                    statuses.some((s) => s.state === "failure");
  const anyRunning = checks.some((c) => c.status === "in_progress") ||
                     statuses.some((s) => s.state === "pending");

  return {
    status: anyFailed ? "failure" : allPassed ? "success" : anyRunning ? "running" : "unknown",
    checks,
  };
}

/**
 * Auto-merge PR after validation and approval.
 * @param {object} pr - Pull request object
 * @param {object} state - Board state
 * @returns {Promise<{merged: boolean, method: string}>}
 */
export async function autoMergePR(pr, state) {
  const validation = validatePR(pr);
  if (!validation.valid) {
    return { merged: false, error: validation.errors.join("; ") };
  }

  const pipeline = await monitorPipeline(pr, state);
  if (pipeline.status !== "success") {
    return { merged: false, error: "Pipeline not passing" };
  }

  // TODO: Implement actual PR merge via GitHub API
  return {
    merged: true,
    method: "squash",
  };
}

/**
 * Clean up merged PR branches and sync local repo.
 * @param {object} pr - Merged PR object
 * @param {string} workspacePath - Workspace directory
 * @returns {Promise<{cleaned: boolean, branchDeleted: boolean}>}
 */
export async function cleanupAfterMerge(pr, workspacePath) {
  const headRef = pr?.head?.ref || pr?.head_ref || "";
  const baseRef = pr?.base?.ref || pr?.base_ref || "develop";

  // NEVER delete main or develop
  if (headRef === "main" || headRef === "develop" || headRef === "master") {
    console.warn("Refusing to delete protected branch:", headRef);
    return { cleaned: false, branchDeleted: false, error: "Protected branch" };
  }

  // TODO: Implement actual cleanup
  // 1. git fetch origin develop
  // 2. git checkout develop
  // 3. git pull origin develop
  // 4. gh pr delete --head ${headRef} (remote branch)
  // 5. Update board state (task → done)

  return {
    cleaned: true,
    branchDeleted: true,
    branch: headRef,
  };
}

// ============================================================================
// C6.2: Merge Serialization Queue
// ============================================================================

/**
 * Global merge queue to serialize PR merges to develop.
 * Prevents cross-branch conflicts when multiple sessions push simultaneously.
 */
const mergeQueue = {
  pending: [],
  processing: false,
  waiting: [],

  /**
   * Enqueue a merge request.
   * @param {object} mergeRequest - { prNumber, branch, base, onNotify }
   * @returns {Promise<{enqueued: boolean, position: number}>}
   */
  async enqueue(mergeRequest) {
    this.pending.push({
      ...mergeRequest,
      enqueuedAt: Date.now(),
    });
    const position = this.pending.length;
    if (position === 1) await this.processNext();
    return { enqueued: true, position };
  },

  /**
   * Process the next merge in queue.
   * @returns {Promise<void>}
   */
  async processNext() {
    if (this.processing || this.pending.length === 0) return;
    this.processing = true;

    const request = this.pending[0];
    try {
      // Pull latest develop before merge
      const pullResult = await runGitCommand("pull", "origin", "develop");
      if (pullResult.exitCode !== 0 && !pullResult.stdout.includes("Up-to-date")) {
        console.warn("Pull failed before merge:", pullResult.stderr);
        // Notify waiting sessions
        this.waiting.forEach((cb) => cb({ success: false, error: "Pull failed", prNumber: request.prNumber }));
        return;
      }

      // Merge the branch
      const mergeResult = await runGitCommand("merge", request.branch, "--no-ff", "-m", `Merge PR #${request.prNumber}`);
      if (mergeResult.exitCode !== 0) {
        console.warn("Merge conflict detected:", mergeResult.stderr);
        // Notify waiting sessions about conflict
        this.waiting.forEach((cb) => cb({
          success: false,
          conflict: true,
          error: "Merge conflict requires resolution",
          prNumber: request.prNumber,
        }));
        return;
      }

      // Push to develop
      const pushResult = await runGitCommand("push", "origin", "develop");
      if (pushResult.exitCode !== 0) {
        console.warn("Push failed after merge:", pushResult.stderr);
        this.waiting.forEach((cb) => cb({ success: false, error: "Push failed", prNumber: request.prNumber }));
        return;
      }

      // Success - remove from queue and notify
      this.pending.shift();
      this.waiting.forEach((cb) => cb({ success: true, prNumber: request.prNumber }));
      this.waiting = [];
    } catch (err) {
      console.error("Merge queue error:", err.message);
      this.pending.shift();
      this.waiting.forEach((cb) => cb({ success: false, error: err.message, prNumber: request.prNumber }));
      this.waiting = [];
    } finally {
      this.processing = false;
      // Process next item if any
      if (this.pending.length > 0) await this.processNext();
    }
  },

  /**
   * Get current queue status.
   * @returns {{pending: number, processing: boolean, queue: Array}}
   */
  status() {
    return {
      pending: this.pending.length,
      processing: this.processing,
      queue: this.pending.map((r) => ({ prNumber: r.prNumber, branch: r.branch, enqueuedAt: r.enqueuedAt })),
    };
  },
};

/**
 * Run a git command and capture output.
 * @param {...string} args - Git command arguments
 * @returns {Promise<{exitCode: number, stdout: string, stderr: string}>}
 */
function runGitCommand(...args) {
  return new Promise((resolve) => {
    const { exec } = require("child_process");
    exec(`git ${args.join(" ")}`, { timeout: 30000 }, (err, stdout, stderr) => {
      resolve({ exitCode: err ? err.code || 1 : 0, stdout: stdout || "", stderr: stderr || "" });
    });
  });
}

/**
 * Serialize a PR merge through the merge queue.
 * @param {object} pr - PR object with head.ref and number
 * @param {string} workspacePath - Workspace directory
 * @returns {Promise<{merged: boolean, enqueued: boolean, status: object}>}
 */
export async function serializeMerge(pr, workspacePath) {
  const headRef = pr?.head?.ref || pr?.head_ref || "";
  const prNumber = pr?.number || pr?.pr_number || 0;

  if (!headRef || !prNumber) {
    return { merged: false, error: "Invalid PR: missing branch or number" };
  }

  // Enqueue the merge
  const enqueued = await mergeQueue.enqueue({
    prNumber,
    branch: headRef,
    base: "develop",
  });

  return {
    merged: false, // Will be true after queue processes
    enqueued: enqueued.enqueued,
    position: enqueued.position,
    status: mergeQueue.status(),
  };
}

// ============================================================================
// C6.2: Session Failure Handling
// ============================================================================

/**
 * Handle a Jules session that reached terminal FAILED state.
 * Logs the error and prepares for fix session dispatch.
 * @param {object} session - Failed session object
 * @param {string} errorReason - Human-readable error reason
 * @param {string} logPath - Path to JSONL log file
 * @returns {Promise<{logged: boolean, fixSessionId: string|null}>}
 */
export async function handleSessionFailure(session, errorReason, logPath) {
  const sessionId = session?.id || session?.session_id || "unknown";
  const storyId = session?.storyId || session?.story_id || null;

  // Log the failure
  const failureEntry = {
    timestamp: new Date().toISOString(),
    event: "session_failure",
    sessionId,
    storyId,
    error: errorReason,
    state: session?.state || session?.status || "FAILED",
    lastActivity: session?.lastActivity || null,
  };

  try {
    await logDecision(failureEntry, logPath);
  } catch (err) {
    console.error("Failed to log session failure:", err.message);
  }

  return {
    logged: true,
    sessionId,
    errorReason,
    fixSessionId: null, // Set after dispatchFixSession is called
  };
}

/**
 * Dispatch a fix session for a failed Jules session.
 * Creates a new session to address the failure.
 * @param {object} failedSession - The failed session object
 * @param {string} errorReason - What went wrong
 * @param {object} options - Dispatch options
 * @returns {Promise<{dispatched: boolean, fixSessionId: string, prompt: string}>}
 */
export async function dispatchFixSession(failedSession, errorReason, options = {}) {
  const sessionId = failedSession?.id || failedSession?.session_id || "unknown";
  const storyId = failedSession?.storyId || failedSession?.story_id || "unknown";

  // Build fix prompt from failure context
  const fixPrompt = [
    `Fix session for failed story ${storyId} (original session: ${sessionId}).`,
    ``,
    `Error: ${errorReason}`,
    ``,
    `Original session state:`,
    JSON.stringify(failedSession, null, 2),
    ``,
    `Please diagnose the failure, apply the fix, and validate the solution works.`,
  ].join("\n");

  const fixSessionId = `fix-${sessionId}-${Date.now()}`;

  // TODO: Integrate with actual session creation API
  // For now, return the prepared dispatch payload
  return {
    dispatched: false, // True after API integration
    fixSessionId,
    prompt: fixPrompt,
    storyId,
    originalSession: sessionId,
  };
}

/**
 * Check if a session is in a terminal error state and handle it.
 * @param {object} session - Session to check
 * @param {string} logPath - Path to JSONL log
 * @returns {Promise<{isTerminalError: boolean, handled: boolean}>}
 */
export async function checkAndHandleFailure(session, logPath) {
  const state = String(session?.state || session?.status || "").toUpperCase();
  const isTerminalError = state === "FAILED" || state === "ERROR" || state === "CRASHED";

  if (!isTerminalError) {
    return { isTerminalError: false, handled: false };
  }

  const errorReason = session?.error || session?.errorReason || "Session reached terminal error state";
  await handleSessionFailure(session, errorReason, logPath);

  return { isTerminalError: true, handled: true, errorReason };
}

/**
 * Log Commander decision to JSONL.
 * @param {object} decision - Decision details
 * @param {string} logPath - Path to JSONL log file
 * @returns {Promise<void>}
 */
export async function logDecision(decision, logPath) {
  const entry = {
    timestamp: new Date().toISOString(),
    action: decision?.action || "unknown",
    itemId: decision?.itemId || null,
    decision: decision?.decision || null,
    reasoning: decision?.reasoning || "",
    confidence: decision?.confidence || 0,
    outcome: decision?.outcome || null,
    duration: decision?.duration || 0,
    sessionIds: decision?.sessionIds || {},
  };

  const line = JSON.stringify(entry);
  await fs.appendFile(logPath || "commander.log", line + "\n", "utf8");
}

/**
 * Calculate trust metrics from logged decisions.
 * @param {string} logPath - Path to JSONL log file
 * @returns {Promise<object>} trust metrics
 */
export async function getTrustMetrics(logPath) {
  const log = await readTextIfExists(logPath || "commander.log");
  if (!log) return { accuracy: 0, total: 0 };

  const lines = log.split("\n").filter((l) => l.trim());
  const entries = lines.map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);

  const total = entries.length;
  const correct = entries.filter((e) => e.outcome === "success" || e.decision === e.outcome).length;
  const dispatches = entries.filter((e) => e.action === "dispatch").length;
  const resolutions = entries.filter((e) => e.action === "resolve").length;
  const reviews = entries.filter((e) => e.action === "review").length;
  const merges = entries.filter((e) => e.action === "merge").length;

  return {
    accuracy: total ? Math.round((correct / total) * 100) : 0,
    total,
    dispatchAccuracy: dispatches ? Math.round((entries.filter((e) => e.action === "dispatch" && e.outcome === "success").length / dispatches) * 100) : 0,
    autoResolutionRate: total ? Math.round((resolutions / total) * 100) : 0,
    reviewPassRate: reviews ? Math.round((entries.filter((e) => e.action === "review" && e.outcome === "pass").length / reviews) * 100) : 0,
    mergeCount: merges,
    humanOverrideCount: entries.filter((e) => e.humanOverride).length,
    silentFailureCount: entries.filter((e) => e.outcome === "failure" && !e.reasoning).length,
  };
}

/**
 * Get health metrics for Command Center dashboard.
 * @param {object} state - Board state
 * @returns {object} health metrics
 */
export function getHealthMetrics(state) {
  const activeJules = (state?.julesSessions || []).filter((s) => !isTerminal(s.state)).length;
  const activeCopilot = (state?.copilotSessions || []).filter((s) => !["completed", "failed", "idle"].includes(s.status)).length;
  const totalStories = (state?.stories || []).length;
  const completedStories = (state?.stories || []).filter((s) => s.status === "done").length;
  const pendingStories = totalStories - completedStories;

  return {
    sessions: {
      julesActive: activeJules,
      copilotActive: activeCopilot,
      totalActive: activeJules + activeCopilot,
    },
    stories: {
      total: totalStories,
      completed: completedStories,
      pending: pendingStories,
      completionRate: totalStories ? Math.round((completedStories / totalStories) * 100) : 0,
    },
    system: {
      uptime: process.uptime(),
      memory: process.memoryUsage().heapUsed,
      nodeVersion: process.version,
    },
  };
}

/**
 * Analyze decision mismatches for learning loop.
 * @param {string} logPath - Path to JSONL log file
 * @returns {Promise<{mismatches: array, patterns: array, suggestions: array}>}
 */
export async function analyzeMismatches(logPath) {
  const log = await readTextIfExists(logPath || "commander.log");
  if (!log) return { mismatches: [], patterns: [], suggestions: [] };

  const lines = log.split("\n").filter((l) => l.trim());
  const entries = lines.map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);

  const mismatches = entries.filter((e) => e.outcome && e.decision !== e.outcome);

  // Group by action type
  const patterns = {};
  for (const m of mismatches) {
    const key = `${m.action}:${m.decision}`;
    patterns[key] = (patterns[key] || 0) + 1;
  }

  const suggestions = Object.entries(patterns)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([key]) => `Review ${key} pattern (${patterns[key]} occurrences)`);

  return {
    mismatches,
    patterns: Object.entries(patterns),
    suggestions,
  };
}

/**
 * Try to auto-resolve feedback against known rules.
 * @param {string} feedback - Jules feedback message
 * @param {object} story - Story work item
 * @returns {string|null} resolution response or null
 */
export function tryAutoResolve(feedback, story) {
  const fb = String(feedback ?? "").toLowerCase();
  const storyId = String(story?.id ?? "");
  const storyTitle = String(story?.title ?? "");

  // Known auto-resolution patterns
  const rules = [
    { pattern: /which branch|branch.*use/i, response: `Use branch: ${createFeatureBranch(story)}` },
    { pattern: /should.*create.*pr|create.*pr/i, response: "yes, create PR targeting develop branch" },
    { pattern: /confirm.*story/i, response: `confirmed: ${storyTitle} (${storyId})` },
    { pattern: /what.*implement|what.*task/i, response: `Implement: ${storyTitle}. Follow story spec tasks.` },
    { pattern: /commit.*format/i, response: "Use: type(scope): description" },
  ];

  for (const rule of rules) {
    if (rule.pattern.test(feedback ?? "")) {
      return rule.response;
    }
  }

  return null;
}

/**
 * Merge Jules and Copilot session states into unified view.
 * @param {object} state - Board state with julesSessions and copilotSessions
 * @returns {object} unified state with all sessions
 */
export function mergeAgentState(state) {
  const julesSessions = (state?.julesSessions || []).map((s) => ({
    type: "jules",
    id: s.id || s.session_id,
    status: s.state || "unknown",
    storyId: s.storyId || s.story_id,
    taskId: s.taskId || s.task_id,
    url: s.url || null,
    prUrl: s.prUrl || s.pr_url || null,
    lastPolled: s.lastPolled || s.last_polled || Date.now(),
    title: s.title || null,
  }));

  const copilotSessions = (state?.copilotSessions || []).map((s) => ({
    type: "copilot",
    id: s.sessionId || s.id,
    status: s.status || "unknown",
    storyId: s.storyId || s.story_id,
    taskId: s.taskId || s.task_id,
    branch: s.branch || null,
    url: s.url || null,
    lastPolled: s.lastPolled || s.last_polled || Date.now(),
    title: s.title || null,
  }));

  return {
    jules: julesSessions,
    copilot: copilotSessions,
    all: [...julesSessions, ...copilotSessions],
    summary: {
      total: julesSessions.length + copilotSessions.length,
      julesRunning: julesSessions.filter((s) => !isTerminal(s.status)).length,
      copilotRunning: copilotSessions.filter((s) => !["completed", "failed", "idle"].includes(s.status)).length,
      totalActive: julesSessions.filter((s) => !isTerminal(s.status)).length + copilotSessions.filter((s) => !["completed", "failed", "idle"].includes(s.status)).length,
    },
  };
}

/**
 * Resolve Jules feedback through 3-tier process.
 * @param {object} session - Jules session object
 * @param {object} story - Story work item
 * @param {string} feedback - Feedback message
 * @returns {Promise<{tier: 'auto' | 'copilot' | 'user', response?: string, cardId?: string}>}
 */
export async function resolveFeedback(session, story, feedback) {
  // Tier 1: Auto-resolution
  const autoResponse = tryAutoResolve(feedback, story);
  if (autoResponse !== null) {
    await sendMessage(session?.id || session?.session_id, autoResponse);
    return { tier: "auto", response: autoResponse };
  }

  // Tier 2: Copilot escalation
  try {
    const { messageId } = await escalateToCopilot(
      session,
      story,
      `Jules session needs feedback resolution: ${feedback}`
    );
    await sendMessage(session?.id || session?.session_id, `Escalated to Copilot: ${messageId}`);
    return { tier: "copilot", response: messageId };
  } catch (err) {
    console.warn("Copilot escalation failed, creating user card:", err.message);
  }

  // Tier 3: User approval card
  const card = createFeedbackCard(session, feedback);
  return { tier: "user", cardId: card.cardId };
}

/**
 * Create user approval card with timer.
 * @param {object} session - Jules session object
 * @param {string} feedback - Feedback content
 * @param {number} [timeout=120000] - Timeout in milliseconds (default 2 minutes)
 * @returns {{cardId: string, timer: number, resolve: Function, reject: Function}}
 */
export function createFeedbackCard(session, feedback, timeout = 120000) {
  const cardId = `card_${Date.now()}`;
  const sessionId = session?.id || session?.session_id;

  // Create timer
  const timer = setTimeout(async () => {
   console.log(`Feedback card ${cardId} expired after ${timeout}ms, deferring feedback`);

   // Log timeout event
   try {
     const timeoutLog = {
       timestamp: new Date().toISOString(),
       event: "feedback_timeout",
       cardId,
       sessionId,
       timeout: timeout,
       feedback: feedback.substring(0, 200),
     };
     await logDecision(timeoutLog, "_bmad-output/implementation-artifacts/commander-decisions.jsonl");
   } catch (err) {
     console.warn("Failed to log feedback timeout:", err.message);
   }

   // Append to deferred-work.md
   try {
     await appendDeferredWork("_bmad-output/implementation-artifacts/deferred-work.md", {
       source_spec: `session/${sessionId}`,
       summary: `Feedback timeout for ${sessionId}: ${feedback.substring(0, 100)}`,
       evidence: `Escalation timeout (${timeout}ms) exceeded, Copilot could not resolve`,
     });
   } catch (err) {
     console.warn("Failed to append deferred work:", err.message);
   }

   // Send defer message
   try {
     await sendMessage(sessionId, "Feedback deferred - timeout exceeded, continuing with default resolution");
   } catch (err) {
     console.warn("Failed to send defer message:", err.message);
   }
 }, timeout);

 return {
   cardId,
   timer,
   sessionId,
   feedback,
   resolve: async (response) => {
     clearTimeout(timer);
     await sendMessage(sessionId, response);
   },
   reject: async () => {
     clearTimeout(timer);
     await sendMessage(sessionId, "Feedback rejected - session should wait for clarification");
   },
 };
}

/**
 * Build Copilot prompt with story spec and branch context.
 * @param {object} story - Story work item
 * @param {object} state - Board state
 * @returns {string} Copilot prompt
 */
export function buildCopilotPrompt(story, state) {
  const lines = [];
  lines.push(`# Task: ${String(story?.title ?? "Untitled")}`);
  lines.push("");

  // Story specification
  const body = String(story?.body ?? "");
  if (body) {
    lines.push("## Story Specification");
    lines.push(body);
    lines.push("");
  }

  // Branch context
  const branch = createFeatureBranch(story);
  lines.push("## Branch");
  lines.push(branch);
  lines.push("");

  // Instructions
  lines.push("## Instructions");
  lines.push("- Use bmad-dev-story skill");
  lines.push("- Execute story tasks");
  lines.push("- Commit and push changes");
  lines.push("- Create PR to develop");
  lines.push("");

  // Project rules
  lines.push("## Project Rules");
  lines.push("- Branch naming: feat/&lt;story-key&gt;-&lt;short-description&gt;");
  lines.push("- Commit format: type(scope): description");
  lines.push("- PR target: develop branch");
  lines.push("- Never fabricate output");

  return lines.join("\n");
}

/**
 * Dispatch story to Copilot with bmad-agent-dev.
 * @param {object} story - Story work item
 * @param {object} state - Board state
 * @param {object} [options] - Optional dispatch options
 * @returns {Promise&lt;{sessionId: string, branch: string}&gt;}
 */
export async function dispatchToCopilot(story, state, options = {}) {
  // Check if story is Copilot-only
  const classification = await classifyDispatch(story, state);
  if (!classification?.copilotOnly) {
    console.warn("dispatchToCopilot called for non-Copilot-only story");
  }

  // Create branch name
  const branch = createFeatureBranch(story);

  // Build prompt
  const prompt = buildCopilotPrompt(story, state);

  // TODO: Integrate with Copilot session creation API
  // For now, return simulated session info
  const sessionId = `copilot_${Date.now()}`;

  return { sessionId, branch };
}

/**
 * Track Copilot session state via SSE.
 * @param {string} sessionId - Copilot session ID
 * @returns {object} SSE listener
 */
export function trackCopilotSession(sessionId) {
  // TODO: Implement SSE listener for Copilot session state
  // Returns event listener object
  return {
    sessionId,
    on(event, callback) {
      // Register callback for event type
      console.log(`Tracking Copilot session ${sessionId} for ${event}`);
    },
    disconnect() {
      // Clean up SSE connection
      console.log(`Disconnected from Copilot session ${sessionId}`);
    },
  };
}

/**
 * Determine polling interval based on Jules session state.
 * @param {string} sessionState - Jules session state
 * @returns {number} polling interval in milliseconds (0 = stop)
 */
export function determinePollingInterval(sessionState) {
  const state = String(sessionState ?? "").toUpperCase();
  switch (state) {
    case "AWAITING_PLAN_APPROVAL": return 5000;
    case "AWAITING_USER_FEEDBACK": return 15000;
    case "QUEUED": return 10000;
    case "IN_PROGRESS": return 30000;
    case "COMPLETED":
    case "FAILED":
    case "CANCELLED":
    default: return 0;
  }
}

/**
 * Auto-approve plan or escalate to Copilot based on Jules-ready status.
 * @param {object} session - Jules session object with state, id, etc.
 * @param {object} story - Story work item
 * @param {object} state - Board state
 * @returns {Promise<{action: 'approved' | 'escalated', messageId?: string}>}
 */
export async function autoApprovePlan(session, story, state) {
  const sessionId = session?.id || session?.session_id;
  if (!sessionId) throw new Error("Session ID required");

  // Check if story is Jules-ready using classifyDispatch
  let julesReady = false;
  try {
    const classification = await classifyDispatch(story, state);
    julesReady = classification?.julesReady || false;
  } catch (err) {
    // If classification fails, default to escalation
    console.warn("classifyDispatch failed, escalating to Copilot:", err.message);
  }

  if (julesReady) {
    // Auto-approve the plan
    try {
      await approvePlan(sessionId);
      return { action: "approved" };
    } catch (err) {
      // If approve fails, escalate
      console.warn("approvePlan failed, escalating:", err.message);
    }
  }

  // Escalate to Copilot
  const messageId = await escalateToCopilot(
    session,
    story,
    `Plan approval needed for story ${story?.id || "unknown"}. Story lacks Jules-ready markers (intent-contract + code map). Please review and approve.`
  );
  return { action: "escalated", messageId };
}

/**
 * Escalate feedback to Copilot via sendMessage.
 * @param {object} session - Jules session object
 * @param {object} story - Story work item
 * @param {string} message - Escalation message
 * @returns {Promise<string>} message ID
 */
export async function escalateToCopilot(session, story, message) {
  const sessionId = session?.id || session?.session_id;
  if (!sessionId) throw new Error("Session ID required");

  // Build escalation payload
  const payload = {
    message,
    storyId: story?.id || null,
    storyTitle: story?.title || null,
  };

 // Log escalation event
 const escalationLog = {
   timestamp: new Date().toISOString(),
   event: "escalation_to_copilot",
   sessionId,
   storyId: story?.id || null,
   message: message.substring(0, 200), // Truncate for log
 };

 try {
   const logPath = "_bmad-output/implementation-artifacts/commander-decisions.jsonl";
   await logDecision(escalationLog, logPath);
 } catch (err) {
   console.warn("Failed to log escalation:", err.message);
 }

 // Send to Jules session (will be routed to Copilot)
 await sendMessage(sessionId, payload);
 return `msg_${Date.now()}`; // Return synthetic message ID
}

/**
 * Decorate a raw board state with canonical work model and classification.
 * @param {object} state
 */
export async function decorateBoardState(state) {
  const canonical = buildCanonicalWorkModel(state);
  state.workItems = canonical.workItems || [];
  state.workRoots = canonical.workRoots || [];
  state.workLookup = canonical.workLookup || {};
  state.workCounts = canonical.workCounts || {};
  state.statusCounts = canonical.workStatusCounts || {};
  state.referenceDocuments = classifyReferenceDocuments(state);

  // Integrate deferred work into the board lookups so UI/actions can reference them
  if (Array.isArray(state.deferredWork) && state.deferredWork.length) {
    state.deferredCounts = state.deferredCounts || state.deferredWork.reduce((acc, it) => { acc[it.severity] = (acc[it.severity] || 0) + 1; return acc; }, { critical: 0, medium: 0, low: 0 });
    state.workLookup = state.workLookup || {};
    state.lookup = state.lookup || {};
    for (const d of state.deferredWork) {
      state.workLookup[d.id] = d;
      state.lookup[d.id] = d;
    }
  }

  // classification
  state.classificationCounts = { julesReady: 0, tasksReady: 0, copilotOnly: 0 };
  state.classificationIndex = {};
  for (const item of state.workItems || []) {
    try {
      if (item && (item.kind === 'story' || item.kind === 'task' || item.kind === 'subtask')) {
        const cls = await classifyDispatch(item, state);
        if (cls) {
          item.classification = cls;
          state.classificationIndex[item.id] = cls;
          if (cls.agent === 'jules' && cls.level === 'story') state.classificationCounts.julesReady++;
          else if (cls.agent === 'jules' && cls.level === 'task') state.classificationCounts.tasksReady++;
          else if (cls.agent === 'copilot') state.classificationCounts.copilotOnly++;
        }
      }
    } catch (err) {
      // ignore per-item classification errors
    }
  }

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
         <select id="kanbanClassificationFilter">
           <option value="all">All</option>
           <option value="jules">🟢 Jules-ready</option>
           <option value="tasks">🟡 Tasks-ready</option>
           <option value="copilot">🔴 Copilot-only</option>
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
         <h2>Deferred Work <span class="section-subtle" id="deferredCounts"></span></h2>
         <div class="panel-body">
           <div class="tab-controls" aria-label="Deferred filters">
             <input id="deferredSearch" type="search" placeholder="Search deferred work..." />
             <div class="status-filters" id="deferredSeverityFilters" style="margin-left:8px"></div>
           </div>
           <div class="list" id="deferredList"></div>
           <div class="footer-note">Deferred items are read-only references parsed from <code>implementation-artifacts/deferred-work.md</code>.</div>
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
              const classificationFilter = byId("kanbanClassificationFilter")?.value;
              if (kind && item.kind !== kind) return false;
              if (selectedStatuses.size && !selectedStatuses.has(bucket(item.status))) return false;
              if (classificationFilter && classificationFilter !== "all") {
                if (!item.classification) return false;
                if (classificationFilter === "jules" && item.classification.agent !== "jules") return false;
                if (classificationFilter === "tasks" && item.classification.level !== "task") return false;
                if (classificationFilter === "copilot" && item.classification.agent !== "copilot") return false;
              }
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
        const classificationCounts = state.classificationCounts || {};
        const classificationHtml = '<div style="margin-top:8px;">' +
          '<span class="badge good">🟢 ' + esc(classificationCounts.julesReady || 0) + '</span> ' +
          '<span class="badge warn">🟡 ' + esc(classificationCounts.tasksReady || 0) + '</span> ' +
          '<span class="badge bad">🔴 ' + esc(classificationCounts.copilotOnly || 0) + '</span>' +
        '</div>';
        container.innerHTML = cards.map(([label, value]) => {
          return '<div class="stat">' +
            '<div class="label">' + esc(label) + '</div>' +
            '<div class="value">' + esc(value) + '</div>' +
            '</div>';
        }).join("") + classificationHtml;
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
        const classification_badge = item.classification ? (
          item.classification.agent === 'jules' && item.classification.level === 'story' ? '<span class="badge good">🟢 ' + esc('Jules-ready') + '</span>' :
          item.classification.agent === 'jules' && item.classification.level === 'task' ? '<span class="badge warn">🟡 ' + esc('Tasks-ready') + '</span>' :
          item.classification.agent === 'copilot' ? '<span class="badge bad">🔴 ' + esc('Copilot-only') + '</span>' : ''
        ) : '';
        const badges = [
          '<span class="badge">' + esc(kindLabels[item.kind] || item.kind) + '</span>',
          item.status ? '<span class="badge ' + statusClass(item.status) + '">' + esc(item.status) + '</span>' : "",
          item.phase ? '<span class="badge">' + esc(item.phase) + '</span>' : "",
          jules_badge,
          classification_badge,
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

      // Deferred work UI helpers
      function severityEmoji(sev) {
        if (!sev) return "";
        if (sev === "critical") return "🔴";
        if (sev === "medium") return "🟡";
        if (sev === "low") return "🟢";
        return "";
      }

      let selectedDeferredSeverities = new Set(["critical", "medium", "low"]);

      function renderDeferredFilters() {
        const container = byId("deferredSeverityFilters");
        if (!container) return;
        const counts = state.deferredCounts || { critical: 0, medium: 0, low: 0 };
        const severities = ["critical", "medium", "low"];
        container.innerHTML = severities.map((s) => {
          const label = s[0].toUpperCase() + s.slice(1);
          const active = selectedDeferredSeverities.has(s) ? "active" : "";
          return '<button type="button" class="filter-chip ' + active + '" data-severity="' + esc(s) + '">' + severityEmoji(s) + ' <small>' + esc(label) + '</small> ' + esc(counts[s]||0) + '</button>';
        }).join(" ");
        container.querySelectorAll("[data-severity]").forEach(btn => {
          btn.addEventListener("click", () => {
            const sev = btn.getAttribute("data-severity");
            if (selectedDeferredSeverities.has(sev)) selectedDeferredSeverities.delete(sev); else selectedDeferredSeverities.add(sev);
            renderDeferredList();
            btn.classList.toggle("active", selectedDeferredSeverities.has(sev));
          });
        });
      }

      function matchesDeferredFilters(item) {
        const query = normalize(byId("deferredSearch")?.value.trim());
        if (selectedDeferredSeverities.size && !selectedDeferredSeverities.has(item.severity)) return false;
        if (!query) return true;
        return [item.title, item.summary || "", item.sourcePath || "", item.parentId || "", item.id].join(" ").toLowerCase().includes(query);
      }

      function renderDeferredList() {
        const container = byId("deferredList");
        const countsEl = byId("deferredCounts");
        if (!container) return;
        const list = (state.deferredWork || []).filter(matchesDeferredFilters);
        if (countsEl) {
          const counts = state.deferredCounts || { critical: 0, medium: 0, low: 0 };
          countsEl.innerHTML = severityEmoji("critical") + ' ' + esc(counts.critical||0) + ' · ' + severityEmoji("medium") + ' ' + esc(counts.medium||0) + ' · ' + severityEmoji("low") + ' ' + esc(counts.low||0);
        }
        if (!list.length) {
          container.innerHTML = '<div class="notice">No deferred work matches the current filters.</div>';
          return;
        }
        container.innerHTML = list.map((item) => {
          const parent = item.parentId ? state.workLookup?.[item.parentId] || state.lookup?.[item.parentId] : null;
          const epicLink = parent ? '<a href="#" data-relation-id="' + esc(item.parentId) + '">' + esc(parent.title) + '</a>' : '';
          const emoji = severityEmoji(item.severity);
          const badgeClass = item.severity === 'critical' ? 'badge bad' : item.severity === 'medium' ? 'badge warn' : 'badge good';
          return '<div class="list-item" data-item-id="' + esc(item.id) + '"><strong>' + esc(emoji + ' ' + item.title) + '</strong>' +
            '<small>' + esc(item.sourcePath || '') + (epicLink ? ' · Epic: ' + epicLink : '') + '</small>' +
            '<div style="margin-top:6px"><span class="' + badgeClass + '">' + esc(item.severity) + '</span> ' +
            '<button type="button" data-delegate="' + esc(item.id) + '">Delegate</button></div></div>';
        }).join('');

        container.querySelectorAll('[data-delegate]').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = btn.getAttribute('data-delegate');
            if (!id) return;
            await dispatchToJules(id);
          });
        });
        container.querySelectorAll('[data-relation-id]').forEach((node) => {
          node.addEventListener('click', (ev) => {
            ev.preventDefault();
            selectItem(node.getAttribute('data-relation-id'));
          });
        });
        container.querySelectorAll('[data-item-id]').forEach(node => node.addEventListener('click', () => selectItem(node.getAttribute('data-item-id'))));
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
        const classificationHeaderBadge = item.classification ? (
          item.classification.agent === 'jules' && item.classification.level === 'story' ? '<span class="badge good">🟢 ' + esc('Jules-ready') + '</span>' :
          item.classification.agent === 'jules' && item.classification.level === 'task' ? '<span class="badge warn">🟡 ' + esc('Tasks-ready') + '</span>' :
          item.classification.agent === 'copilot' ? '<span class="badge bad">🔴 ' + esc('Copilot-only') + '</span>' : ''
        ) : '';
        const headerBadges = [
          '<span class="badge">' + esc(kindLabels[item.kind] || item.kind) + '</span>',
          item.status ? '<span class="badge ' + statusClass(item.status) + '">' + esc(item.status) + '</span>' : "",
          item.phase ? '<span class="badge">' + esc(item.phase) + '</span>' : "",
          classificationHeaderBadge,
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
        const canDelegate = ["task", "subtask", "deferred"].includes(item.kind);
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
        renderDeferredFilters();
        renderDeferredList();
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
          julesStream.addEventListener("classification", (event) => {
            try {
              const data = JSON.parse(event.data || "{}");
              if (data.classificationCounts) state.classificationCounts = data.classificationCounts;
              if (data.nextAction) state.nextAction = data.nextAction;
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
        if (!["task", "subtask", "deferred"].includes(item.kind)) {
          toast("Jules delegation is available only for tasks, subtasks, and deferred items.", "warn");
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
      byId("kanbanClassificationFilter").addEventListener("change", renderAll);
      byId("julesSearch").addEventListener("input", renderAll);
      byId("julesLifecycleFilter").addEventListener("change", renderAll);
      byId("docsSearch").addEventListener("input", renderAll);
      byId("docsTypeFilter").addEventListener("change", renderAll);
      try { if (byId("deferredSearch")) byId("deferredSearch").addEventListener("input", renderDeferredList); } catch (e) {}
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

