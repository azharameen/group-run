#!/usr/bin/env python3
"""
github-board.py — Group Run board sync CLI (stdlib-only, Python 3.13)

Board: azharameen/group-run · Project "Group Run" #4
Project node ID: PVT_kwHOAJ-q4c4Bgfea
Auth token: env COPILOT_GH_ACCOUNT_GITHUB_2E_COM_AZHARAMEEN (fallback GITHUB_TOKEN)

Field IDs (source: github-board.md, read 2026-08-17 — never discover at runtime):
  Status    PVTSSF_lAHOAJ-q4c4Bgfeazhfe4Ck
    Backlog     f75ad846
    In Progress 47fc9ee4
    In Review   fb6c50f7
    On Hold     ccb0a41e
    Done        98236657
  Issue Type  PVTSSF_lAHOAJ-q4c4Bgfeazhfgrrc
    Epic        e76f70fa
    Story       73799926
    Task        defcd137
    Bug         c070c336
  Sprint      PVTIF_lAHOAJ-q4c4BgfeazhfguqI  (iteration field)
    Sprint 1    e876806a
    Sprint 2    5712f32c

Usage:
  github-board.py add <title> [--sprint ITER_ID] [--label L]... [--assignee U] [--type Story|Task]
  github-board.py set <issue-number> [--sprint ITER_ID]
  github-board.py state <issue-number> <STATE>
  github-board.py list [--state STATE]

Sprint --sprint accepts either a known sprint label ("Sprint 1", "Sprint 2") or
the raw 8-hex iterationId (e.g. e876806a).
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

# ── Constants (baked from github-board.md) ───────────────────────────────────
REPO_OWNER = "azharameen"
REPO_NAME = "group-run"
PROJECT_NODE_ID = "PVT_kwHOAJ-q4c4Bgfea"

FIELD_STATUS = "PVTSSF_lAHOAJ-q4c4Bgfeazhfe4Ck"
FIELD_ISSUE_TYPE = "PVTSSF_lAHOAJ-q4c4Bgfeazhfgrrc"
FIELD_SPRINT = "PVTIF_lAHOAJ-q4c4BgfeazhfguqI"

STATUS_OPTIONS = {
    "backlog":      "f75ad846",
    "in progress":  "47fc9ee4",
    "in review":    "fb6c50f7",
    "on hold":      "ccb0a41e",
    "done":         "98236657",
}

ISSUE_TYPE_OPTIONS = {
    "epic":  "e76f70fa",
    "story": "73799926",
    "task":  "defcd137",
    "bug":   "c070c336",
}

SPRINT_LABELS = {
    "sprint 1": "e876806a",
    "sprint 2": "5712f32c",
}

GRAPHQL_URL = "https://api.github.com/graphql"
REST_BASE = "https://api.github.com"

# ── Auth ─────────────────────────────────────────────────────────────────────

def get_token():
    token = os.environ.get("COPILOT_GH_ACCOUNT_GITHUB_2E_COM_AZHARAMEEN") or \
            os.environ.get("GITHUB_TOKEN")
    if not token:
        print("ERROR: No auth token found. Set COPILOT_GH_ACCOUNT_GITHUB_2E_COM_AZHARAMEEN "
              "or GITHUB_TOKEN.", file=sys.stderr)
        sys.exit(1)
    return token


def headers(token):
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

# ── HTTP helpers ─────────────────────────────────────────────────────────────

def graphql(token, query, variables=None):
    payload = json.dumps({"query": query, "variables": variables or {}}).encode()
    req = urllib.request.Request(GRAPHQL_URL, data=payload, headers=headers(token), method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        print(f"ERROR: GraphQL HTTP {e.code}: {body}", file=sys.stderr)
        sys.exit(1)
    if data.get("errors"):
        print(f"ERROR: GraphQL errors: {json.dumps(data['errors'], indent=2)}", file=sys.stderr)
        sys.exit(1)
    return data["data"]


def rest(token, method, path, body=None):
    url = REST_BASE + path
    payload = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=payload, headers=headers(token), method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        body_txt = e.read().decode(errors="replace")
        print(f"ERROR: REST {method} {path} HTTP {e.code}: {body_txt}", file=sys.stderr)
        sys.exit(1)

# ── Sprint helper ─────────────────────────────────────────────────────────────

def resolve_sprint_id(sprint_arg):
    """Return raw 8-hex iterationId from label or pass-through hex."""
    if sprint_arg is None:
        return None
    lower = sprint_arg.lower()
    if lower in SPRINT_LABELS:
        return SPRINT_LABELS[lower]
    # Accept raw 8-hex
    if len(sprint_arg) == 8 and all(c in "0123456789abcdefABCDEF" for c in sprint_arg):
        return sprint_arg.lower()
    print(f"ERROR: Unknown sprint '{sprint_arg}'. Known: {list(SPRINT_LABELS)} "
          "or pass an 8-hex iterationId.", file=sys.stderr)
    sys.exit(1)

# ── Board helpers ─────────────────────────────────────────────────────────────

def add_item_to_project(token, content_id):
    """Add an issue to the project and return the new project item node ID."""
    q = """
    mutation($projectId: ID!, $contentId: ID!) {
      addProjectV2ItemById(input: {projectId: $projectId, contentId: $contentId}) {
        item { id }
      }
    }"""
    data = graphql(token, q, {"projectId": PROJECT_NODE_ID, "contentId": content_id})
    return data["addProjectV2ItemById"]["item"]["id"]


def set_single_select(token, item_id, field_id, option_id):
    q = """
    mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $projectId, itemId: $itemId, fieldId: $fieldId,
        value: { singleSelectOptionId: $optionId }
      }) { projectV2Item { id } }
    }"""
    graphql(token, q, {
        "projectId": PROJECT_NODE_ID, "itemId": item_id,
        "fieldId": field_id, "optionId": option_id,
    })


def set_iteration(token, item_id, iteration_id):
    q = """
    mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $iterationId: String!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $projectId, itemId: $itemId, fieldId: $fieldId,
        value: { iterationId: $iterationId }
      }) { projectV2Item { id } }
    }"""
    graphql(token, q, {
        "projectId": PROJECT_NODE_ID, "itemId": item_id,
        "fieldId": FIELD_SPRINT, "iterationId": iteration_id,
    })


def get_project_item(token, issue_number):
    """Find the project item node ID for a given issue number. Returns (item_id, content_id)."""
    q = """
    query($projectId: ID!) {
      node(id: $projectId) { ... on ProjectV2 { items(first: 100) { nodes {
        id
        content { ... on Issue { number databaseId } }
      }}}}
    }"""
    data = graphql(token, q, {"projectId": PROJECT_NODE_ID})
    for node in data["node"]["items"]["nodes"]:
        c = node.get("content") or {}
        if c.get("number") == issue_number:
            return node["id"], c.get("databaseId")
    return None, None


def read_item_fields(token, item_id):
    """Read field values for a board item. Returns dict with status/type/sprint."""
    q = """
    query($projectId: ID!) {
      node(id: $projectId) { ... on ProjectV2 { items(first: 100) { nodes {
        id
        content { ... on Issue { number title state } }
        fieldValues(first: 15) { nodes {
          ... on ProjectV2ItemFieldSingleSelectValue { name optionId field { ... on ProjectV2SingleSelectField { id } } }
          ... on ProjectV2ItemFieldIterationValue { iterationId title field { ... on ProjectV2IterationField { id } } }
        }}
      }}}}
    }"""
    data = graphql(token, q, {"projectId": PROJECT_NODE_ID})
    for node in data["node"]["items"]["nodes"]:
        if node["id"] == item_id:
            return node
    return None

# ── Verify helpers ────────────────────────────────────────────────────────────

def verify_single_select(token, item_id, field_id, expected_option_id, field_name):
    item = read_item_fields(token, item_id)
    if item is None:
        print(f"ERROR: Verify failed — item {item_id} not found on board.", file=sys.stderr)
        sys.exit(1)
    for fv in item["fieldValues"]["nodes"]:
        if fv.get("field", {}).get("id") == field_id:
            if fv.get("optionId") == expected_option_id:
                return  # verified
            print(f"ERROR: Verify failed — {field_name} is '{fv.get('name')}' "
                  f"(optionId {fv.get('optionId')}), expected {expected_option_id}.", file=sys.stderr)
            sys.exit(1)
    print(f"ERROR: Verify failed — {field_name} field value not found on item.", file=sys.stderr)
    sys.exit(1)


def verify_iteration(token, item_id, expected_iteration_id):
    item = read_item_fields(token, item_id)
    if item is None:
        print(f"ERROR: Verify failed — item {item_id} not found on board.", file=sys.stderr)
        sys.exit(1)
    for fv in item["fieldValues"]["nodes"]:
        if fv.get("field", {}).get("id") == FIELD_SPRINT:
            if fv.get("iterationId") == expected_iteration_id:
                return
            print(f"ERROR: Verify failed — Sprint is '{fv.get('title')}' "
                  f"(iterationId {fv.get('iterationId')}), expected {expected_iteration_id}.", file=sys.stderr)
            sys.exit(1)
    print(f"ERROR: Verify failed — Sprint field value not found on item.", file=sys.stderr)
    sys.exit(1)

# ── Commands ──────────────────────────────────────────────────────────────────

def cmd_add(args, token):
    # Determine Issue Type option
    if args.type:
        type_key = args.type.lower()
        if type_key not in ISSUE_TYPE_OPTIONS:
            print(f"ERROR: Unknown type '{args.type}'. Choices: Story, Task, Epic, Bug", file=sys.stderr)
            sys.exit(1)
        type_option_id = ISSUE_TYPE_OPTIONS[type_key]
    else:
        # Default: Story (CHORE/EPIC labels → Story too; everything else → Task)
        # Since we can't know the type from title alone at add-time, default Story
        type_option_id = ISSUE_TYPE_OPTIONS["story"]

    # Determine sprint
    sprint_id = resolve_sprint_id(getattr(args, "sprint", None))

    # 1. Create the GitHub issue
    issue_body = {
        "title": args.title,
    }
    if args.label:
        issue_body["labels"] = args.label
    if args.assignee:
        issue_body["assignees"] = [args.assignee]

    issue = rest(token, "POST", f"/repos/{REPO_OWNER}/{REPO_NAME}/issues", issue_body)
    issue_number = issue["number"]
    issue_node_id = issue["node_id"]
    print(f"Created issue #{issue_number}: {issue['html_url']}")

    # 2. Add to project
    item_id = add_item_to_project(token, issue_node_id)
    print(f"Added to board as item {item_id}")

    # 3. Set Status = Backlog
    set_single_select(token, item_id, FIELD_STATUS, STATUS_OPTIONS["backlog"])

    # 4. Set Issue Type
    set_single_select(token, item_id, FIELD_ISSUE_TYPE, type_option_id)

    # 5. Set Sprint if given
    if sprint_id:
        set_iteration(token, item_id, sprint_id)

    # 6. Verify
    verify_single_select(token, item_id, FIELD_STATUS, STATUS_OPTIONS["backlog"], "Status")
    verify_single_select(token, item_id, FIELD_ISSUE_TYPE, type_option_id, "Issue Type")
    if sprint_id:
        verify_iteration(token, item_id, sprint_id)

    print(f"Verified. Issue #{issue_number} on board with Status=Backlog, "
          f"Type={'Story' if type_option_id == ISSUE_TYPE_OPTIONS['story'] else args.type}.")


def cmd_set(args, token):
    sprint_id = resolve_sprint_id(args.sprint)
    if sprint_id is None:
        print("ERROR: --sprint is required for 'set'.", file=sys.stderr)
        sys.exit(1)

    item_id, _ = get_project_item(token, args.issue_number)
    if item_id is None:
        print(f"ERROR: Issue #{args.issue_number} not found on the board.", file=sys.stderr)
        sys.exit(1)

    set_iteration(token, item_id, sprint_id)
    verify_iteration(token, item_id, sprint_id)

    sprint_label = next((k for k, v in SPRINT_LABELS.items() if v == sprint_id), sprint_id)
    print(f"Issue #{args.issue_number}: Sprint set to {sprint_label} ({sprint_id}). Verified.")


def cmd_state(args, token):
    state_key = args.state.lower()
    if state_key not in STATUS_OPTIONS:
        print(f"ERROR: Unknown state '{args.state}'. "
              f"Choices: {', '.join(k.title() for k in STATUS_OPTIONS)}", file=sys.stderr)
        sys.exit(1)

    option_id = STATUS_OPTIONS[state_key]
    item_id, _ = get_project_item(token, args.issue_number)
    if item_id is None:
        print(f"ERROR: Issue #{args.issue_number} not found on the board.", file=sys.stderr)
        sys.exit(1)

    set_single_select(token, item_id, FIELD_STATUS, option_id)
    verify_single_select(token, item_id, FIELD_STATUS, option_id, "Status")
    print(f"Issue #{args.issue_number}: Status set to {args.state.title()}. Verified.")


def cmd_list(args, token):
    filter_state = args.state.lower() if args.state else None

    q = """
    query($projectId: ID!) {
      node(id: $projectId) { ... on ProjectV2 { items(first: 100) { nodes {
        id
        content { ... on Issue { number title state } }
        fieldValues(first: 15) { nodes {
          ... on ProjectV2ItemFieldSingleSelectValue { name optionId field { ... on ProjectV2SingleSelectField { name } } }
          ... on ProjectV2ItemFieldIterationValue { title field { ... on ProjectV2IterationField { name } } }
        }}
      }}}}
    }"""
    data = graphql(token, q, {"projectId": PROJECT_NODE_ID})
    items = data["node"]["items"]["nodes"]

    printed = 0
    for node in items:
        content = node.get("content") or {}
        issue_num = content.get("number", "?")
        title = content.get("title", "(no title)")
        closed = content.get("state") == "CLOSED"

        status = issue_type = sprint = ""
        for fv in node["fieldValues"]["nodes"]:
            fname = fv.get("field", {}).get("name", "")
            if fname == "Status":
                status = fv.get("name", "")
            elif fname == "Issue Type":
                issue_type = fv.get("name", "")
            elif fname == "Sprint":
                sprint = fv.get("title", "")

        if filter_state and status.lower() != filter_state:
            continue

        closed_mark = " [closed]" if closed else ""
        parts = [f"#{issue_num}"]
        if issue_type:
            parts.append(f"[{issue_type}]")
        if sprint:
            parts.append(f"[{sprint}]")
        parts.append(f"{status or '(no status)'}")
        parts.append(f"— {title}{closed_mark}")
        print(" ".join(parts))
        printed += 1

    if printed == 0:
        print("(no items" + (f" with state '{args.state}'" if filter_state else "") + ")")

# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        prog="github-board.py",
        description="Group Run GitHub board sync (azharameen/group-run, project #4)",
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    # add
    p_add = sub.add_parser("add", help="Create issue and add to board")
    p_add.add_argument("title", help="Issue title")
    p_add.add_argument("--sprint", metavar="ITER_ID",
                       help="Sprint label ('Sprint 1') or raw 8-hex iterationId")
    p_add.add_argument("--label", action="append", default=[], metavar="L", help="Label (repeatable)")
    p_add.add_argument("--assignee", metavar="U", help="GitHub username to assign")
    p_add.add_argument("--type", metavar="TYPE", default="Story",
                       help="Issue type: Story|Task|Epic|Bug (default: Story)")

    # set
    p_set = sub.add_parser("set", help="Set sprint on an existing board item")
    p_set.add_argument("issue_number", type=int, metavar="ISSUE")
    p_set.add_argument("--sprint", required=True, metavar="ITER_ID",
                       help="Sprint label ('Sprint 2') or raw 8-hex iterationId")

    # state
    p_state = sub.add_parser("state", help="Set board status on an existing item")
    p_state.add_argument("issue_number", type=int, metavar="ISSUE")
    p_state.add_argument("state", metavar="STATE",
                         help="Backlog|In Progress|In Review|On Hold|Done")

    # list
    p_list = sub.add_parser("list", help="List board items")
    p_list.add_argument("--state", metavar="STATE", help="Filter by status name")

    args = parser.parse_args()
    token = get_token()

    if args.cmd == "add":
        cmd_add(args, token)
    elif args.cmd == "set":
        cmd_set(args, token)
    elif args.cmd == "state":
        cmd_state(args, token)
    elif args.cmd == "list":
        cmd_list(args, token)


if __name__ == "__main__":
    main()
