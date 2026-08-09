# Story: 6-3 Wire skills loading into DeepAgents runtime

## Status
- Status: done
- Epic: EP-6 Knowledge & Memory
- Acceptance Criteria: Verified via unit tests.

## Changes
- Modified `backend/app/agent/runtime.py`: Added `skills=["/skills/"]` to `create_deep_agent` call.
- Modified `backend/app/agent/subagents.py`: Added `skills` to subagent definitions, defaulting to `["/skills/"]`.
- Created `backend/tests/test_skills_wiring.py`: Added unit tests to verify the wiring.

## Verification
- Ran `pytest backend/tests/test_skills_wiring.py` - passed.
