const TERMINAL_STATES = new Set(["COMPLETED", "FAILED", "DELETED"]);

export function normalizeJulesSession(session, origin = "external") {
    return {
        name: session.name || session.sessionName,
        state: session.state || "STATE_UNSPECIFIED",
        url: session.url || null,
        title: session.title || session.prompt || session.name,
        prompt: session.prompt || null,
        prUrl: session.output?.pullRequest?.url || session.prUrl || null,
        origin,
        startedAt: session.startedAt || session.startTime || session.createTime || session.createdAt || null,
        endedAt: session.endedAt || session.endTime || session.completedAt || null,
        lastActivityAt: session.lastActivityAt || session.updateTime || session.updatedAt || null,
        lastMessage: session.lastMessage || null,
    };
}

export function mergeJulesSessions(tracked, remote) {
    const trackedSessions = tracked.map((session) => normalizeJulesSession(session, session.origin || "canvas"));
    const trackedNames = new Set(trackedSessions.map((session) => session.name));
    const remoteSessions = remote
        .map((session) => normalizeJulesSession(session))
        .filter((session) => session.name && !trackedNames.has(session.name));
    return [...trackedSessions, ...remoteSessions];
}

export function julesLifecycle(state) {
    if (state === "DELETED") return "deleted";
    if (TERMINAL_STATES.has(state)) return "archived";
    if (["PAUSED", "AWAITING_PLAN_APPROVAL", "AWAITING_USER_FEEDBACK"].includes(state)) return "paused";
    return "active";
}

export { TERMINAL_STATES };
