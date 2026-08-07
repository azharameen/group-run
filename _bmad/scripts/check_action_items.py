#!/usr/bin/env python3
"""Pre-flight action item gate.

Reads sprint-status.yaml action_items and reports any open items from prior epics.
Exit code 0 = clear to proceed, 1 = blockers found (prints them).

Usage:
    python check_action_items.py --sprint-status <path> --current-epic <number>
    python check_action_items.py --sprint-status <path>  # checks ALL open items
"""

import argparse
import json
import sys
import yaml


def load_yaml(path):
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def main():
    parser = argparse.ArgumentParser(description="Action item gate")
    parser.add_argument("--sprint-status", required=True, help="Path to sprint-status.yaml")
    parser.add_argument("--current-epic", type=int, default=None,
                        help="Current epic number (only flag prior epic items)")
    args = parser.parse_args()

    data = load_yaml(args.sprint_status)
    action_items = data.get("action_items", [])
    if not action_items:
        print("clear")
        return 0

    blockers = []
    for item in action_items:
        item_epic = item.get("epic")
        status = item.get("status", "open")
        if status != "open":
            continue
        if args.current_epic is not None and item_epic >= args.current_epic:
            continue
        blockers.append(item)

    if not blockers:
        print("clear")
        return 0

    print(f"blockers:{len(blockers)}")
    for item in blockers:
        epic = item.get("epic", "?")
        action = item.get("action", "unknown")
        owner = item.get("owner", "unassigned")
        print(f"  Epic {epic}: {action} (owner: {owner})")

    return 1


if __name__ == "__main__":
    sys.exit(main())
