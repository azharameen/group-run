const WORK_KINDS = new Set(["epic", "story", "task", "subtask"]);

function slugify(value) {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 120) || "item";
}

function parseChecklistTasks(body) {
    const lines = String(body ?? "").split(/\r?\n/);
    const tasks = [];
    let inSection = false;
    for (const line of lines) {
        if (/^##\s+Tasks(?:\s*\/\s*Subtasks|\s*&\s*Acceptance)?/i.test(line)) {
            inSection = true;
            continue;
        }
        if (inSection && /^##\s+/.test(line)) break;
        if (!inSection) continue;

        const match = line.match(/^(\s*)[-*]\s+\[(x| )\]\s+(.+)$/i);
        if (!match) continue;
        tasks.push({
            title: match[3].trim(),
            status: match[2].toLowerCase() === "x" ? "done" : "open",
            indent: match[1].replaceAll("\t", "    ").length,
        });
    }
    return tasks;
}

function normalizeParentChildren(nodes) {
    const lookup = Object.fromEntries(nodes.map((node) => [node.id, { ...node, children: [] }]));
    const roots = [];
    for (const node of Object.values(lookup)) {
        if (node.parentId && lookup[node.parentId]) lookup[node.parentId].children.push(node);
        else roots.push(node);
    }
    return { roots, lookup };
}

function addStoryTasks(story, storyDocument) {
    const checklist = parseChecklistTasks(storyDocument?.body);
    if (!checklist.length) return [];

    const minimumIndent = Math.min(...checklist.map((task) => task.indent));
    const stack = [];
    const nodes = [];
    checklist.forEach((task, index) => {
        const level = task.indent > minimumIndent ? 1 : 0;
        const kind = level ? "subtask" : "task";
        if (level) {
            const parent = stack[stack.length - 1];
            if (!parent) return;
            const node = {
                id: `${parent.id}-subtask-${slugify(task.title)}-${index + 1}`,
                kind,
                title: task.title,
                status: task.status,
                parentId: parent.id,
                phase: story.phase,
                sourcePath: storyDocument.path,
                summary: task.title,
                metadata: { sourceKind: "story-checklist", checklistIndex: index + 1 },
            };
            nodes.push(node);
            return;
        }

        const node = {
            id: `${story.id}-task-${slugify(task.title)}-${index + 1}`,
            kind,
            title: task.title,
            status: task.status,
            parentId: story.id,
            phase: story.phase,
            sourcePath: storyDocument.path,
            summary: task.title,
            metadata: { sourceKind: "story-checklist", checklistIndex: index + 1 },
        };
        stack.length = 0;
        stack.push(node);
        nodes.push(node);
    });
    return nodes;
}

export function buildCanonicalWorkModel(state) {
    const sourceItems = Array.isArray(state?.items) ? state.items : [];
    const documents = Array.isArray(state?.documents) ? state.documents : [];
    const stories = sourceItems.filter((item) => item.kind === "story");
    const storyDocs = new Map(
        documents
            .filter((document) => document.kind === "story-file")
            .map((document) => [document.sourcePath, document])
    );

    const nodes = sourceItems
        .filter((item) => WORK_KINDS.has(item.kind) && item.kind !== "task" && item.kind !== "subtask")
        .map((item) => ({ ...item }));

    for (const story of stories) {
        const storyDocument = story.metadata?.storyFile ? storyDocs.get(story.metadata.storyFile) : null;
        nodes.push(...addStoryTasks(story, storyDocument));
    }

    const hierarchy = normalizeParentChildren(nodes);
    return {
        workItems: nodes,
        workRoots: hierarchy.roots,
        workLookup: hierarchy.lookup,
        workCounts: nodes.reduce((counts, item) => {
            counts[item.kind] = (counts[item.kind] || 0) + 1;
            return counts;
        }, { epic: 0, story: 0, task: 0, subtask: 0 }),
        workStatusCounts: nodes.reduce((counts, item) => {
            const status = String(item.status || "open").toLowerCase();
            const bucket = ["done", "complete", "completed", "closed", "resolved"].includes(status)
                ? "Done"
                : ["in-progress", "in progress", "review", "ready-for-dev", "ready", "active"].includes(status)
                    ? "Active"
                    : status === "blocked" ? "Blocked" : "Open";
            counts[bucket] = (counts[bucket] || 0) + 1;
            return counts;
        }, {}),
    };
}

export function classifyReferenceDocuments(state) {
    const normalizePath = (value) => String(value || "")
        .replaceAll("\\", "/")
        .replace(/^\/+/, "")
        .toLowerCase();
    const workspace = normalizePath(state?.workspacePath);
    const sourcePaths = new Set(
        (state?.workItems || [])
            .filter((item) => item.sourcePath)
            .map((item) => {
                const source = normalizePath(item.sourcePath);
                return workspace && source.startsWith(workspace) ? source.slice(workspace.length).replace(/^\/+/, "") : source;
            })
            .filter(Boolean)
    );
    return (state?.documents || []).filter((document) => {
        if (document.kind === "story-file") return false;
        const source = normalizePath(document.sourcePath);
        return !sourcePaths.has(source) && !source.endsWith("/planning-artifacts/epics.md");
    });
}
