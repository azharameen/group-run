"""Focused Story 11.3 product-definition tests."""

import asyncio
import threading
import time

import pytest
from app.storage.artifacts import load_artifact_revisions, save_artifact_revision
from app.storage.idea_workspace import load_idea_yaml, save_idea_yaml
from app.work_items import service as work_items_service
from app.work_items.idea_mapping import ensure_idea_for_work_item


@pytest.fixture
def client():
    from app.api.app import create_app

    return TestClient(create_app())
from fastapi.testclient import TestClient
from pydantic import ValidationError


def _definition_payload() -> dict:
    return {
        "requirements": [
            {
                "requirement_id": "REQ-1",
                "title": "Capture a run",
                "description": "Users can capture a completed group run.",
                "priority": "must",
                "evidence_refs": ["assessment:v1"],
            }
        ],
        "user_stories": [
            {
                "story_id": "US-1",
                "persona": "run organizer",
                "need": "record the result",
                "benefit": "participants can review it",
                "acceptance_criteria": ["Given a result, when saved, then it is reviewable."],
                "evidence_refs": ["assessment:v1"],
            }
        ],
        "roadmap": [
            {
                "phase": "MVP",
                "objective": "Deliver result capture.",
                "deliverables": ["Result form"],
                "agent_hours": 12,
                "projected_compute_cost": 4.5,
                "estimate_basis": {
                    "method": "task decomposition",
                    "assumptions": ["Existing work-item APIs remain available."],
                    "evidence_refs": ["assessment:v1"],
                },
            }
        ],
        "success_metrics": [
            {
                "name": "Successful captures",
                "target": "95% of valid submissions",
                "measurement": "API success telemetry",
                "evidence_refs": ["assessment:v1"],
            }
        ],
        "confidence": 8,
        "reasoning": "The validated workflow supports a bounded MVP.",
        "alternatives": ["Manual result tracking"],
        "evidence_refs": ["assessment:v1"],
        "provenance": "mock://product-team",
        "agent_id": "product-team",
        "generated_at": "2026-08-26T07:00:00+00:00",
    }


class TestProductDefinitionModels:
    def test_complete_definition_is_strict_and_estimates_are_generated(self):
        from app.work_items.models import ProductDefinitionSummary

        summary = ProductDefinitionSummary.model_validate(_definition_payload())

        assert summary.roadmap[0].agent_hours == 12
        assert summary.roadmap[0].projected_compute_cost == 4.5
        assert summary.roadmap[0].estimate_trust == "generated"
        assert summary.trust == "generated"

    @pytest.mark.parametrize(
        ("path", "value"),
        [
            (("roadmap", 0, "agent_hours"), "12"),
            (("roadmap", 0, "estimate_basis"), None),
            (("success_metrics",), []),
            (("alternatives",), []),
        ],
    )
    def test_incomplete_or_coercible_definition_is_rejected(self, path, value):
        from app.work_items.models import ProductDefinitionSummary

        payload = _definition_payload()
        target = payload
        for key in path[:-1]:
            target = target[key]
        target[path[-1]] = value

        with pytest.raises(ValidationError):
            ProductDefinitionSummary.model_validate(payload)

    def test_provider_cannot_add_unrecognized_fields(self):
        from app.work_items.models import ProductDefinitionSummary

        payload = _definition_payload()
        payload["approval"] = "approved"

        with pytest.raises(ValidationError):
            ProductDefinitionSummary.model_validate(payload)

    def test_provider_lists_reject_blank_string_elements(self):
        from app.work_items.models import ProductDefinitionSummary

        for path in (
            ("requirements", 0, "evidence_refs"),
            ("user_stories", 0, "acceptance_criteria"),
            ("roadmap", 0, "deliverables"),
            ("roadmap", 0, "estimate_basis", "assumptions"),
            ("success_metrics", 0, "evidence_refs"),
            ("alternatives",),
        ):
            payload = _definition_payload()
            target = payload
            for key in path[:-1]:
                target = target[key]
            if path == ("alternatives",):
                target[path[-1]] = ["  "]
            else:
                target[path[-1]][0] = "  "
            with pytest.raises(ValidationError):
                ProductDefinitionSummary.model_validate(payload)

    @pytest.mark.parametrize("field", ["agent_hours", "projected_compute_cost"])
    @pytest.mark.parametrize("value", [float("nan"), float("inf"), float("-inf")])
    def test_non_finite_estimates_are_rejected(self, field, value):
        from app.work_items.models import ProductDefinitionSummary

        payload = _definition_payload()
        payload["roadmap"][0][field] = value
        with pytest.raises(ValidationError):
            ProductDefinitionSummary.model_validate(payload)

    def test_decision_reasoning_and_lists_reject_blank_values(self):
        from app.work_items.models import (
            ProductDefinitionDecisionRequest,
            ProductDefinitionStatus,
        )

        with pytest.raises(ValidationError):
            ProductDefinitionDecisionRequest(
                actor_id="chief_of_staff",
                decision="approve",
                artifact_version=1,
                reasoning="  ",
            )
        with pytest.raises(ValidationError):
            ProductDefinitionDecisionRequest(
                actor_id="chief_of_staff",
                decision="reject",
                artifact_version=1,
                reasoning="Revise.",
                alternatives=["  "],
            )
        with pytest.raises(ValidationError):
            ProductDefinitionStatus(
                state="failed",
                idea_id="IDEA-1",
                expected_artifacts=["  "],
            )

    @pytest.mark.asyncio
    async def test_waiting_generation_lock_cancellation_does_not_release_owner_lock(self):
        from app.agent.teams.product_team import _generation_lock, _generation_locks

        async with _generation_lock("IDEA-lock"):
            waiting = asyncio.create_task(_generation_lock("IDEA-lock").__aenter__())
            await asyncio.sleep(0)
            waiting.cancel()
            with pytest.raises(asyncio.CancelledError):
                await waiting
            assert _generation_locks["IDEA-lock"].lock.locked()
        assert "IDEA-lock" not in _generation_locks

    @pytest.mark.asyncio
    async def test_waiting_decision_lock_cancellation_does_not_release_owner_lock(self):
        from app.work_items.service import (
            _decision_locks,
            _product_definition_decision_lock,
        )

        async with _product_definition_decision_lock("work-item-lock"):
            waiting = asyncio.create_task(
                _product_definition_decision_lock("work-item-lock").__aenter__()
            )
            await asyncio.sleep(0)
            waiting.cancel()
            with pytest.raises(asyncio.CancelledError):
                await waiting
            assert _decision_locks["work-item-lock"].lock.locked()
        assert "work-item-lock" not in _decision_locks

    def test_handoff_decision_requires_an_explicit_actor_and_revision(self):
        from app.work_items.models import ProductDefinitionDecisionRequest

        with pytest.raises(ValidationError):
            ProductDefinitionDecisionRequest.model_validate(
                {"decision": "approve", "artifact_version": 1, "reasoning": "Ready."}
            )

        request = ProductDefinitionDecisionRequest(
            actor_id="chief_of_staff",
            decision="reject",
            artifact_version=2,
            reasoning="Revise the estimate assumptions.",
        )
        assert request.decision == "reject"


async def _product_item(organization, *, ready: bool = True, phase: str = "product_definition"):
    item = await work_items_service.submit_work_item(
        "Validated running concept",
        "Coordinate and review group runs.",
        org_id=organization.org_id,
    )
    if phase != "new":
        item, _ = await work_items_service.transition_work_item(item.work_item_id, phase)
    idea_id = ensure_idea_for_work_item(item.work_item_id, title=item.title, description=item.description)
    if ready:
        record = save_artifact_revision(
            idea_id,
            "novelty-assessment",
            "# Assessment\nValidated concept.",
            provenance="mock://validation",
            evidence_refs=["assessment:v1"],
            agent_id="idea-team-validator",
        )
        save_idea_yaml(
            idea_id,
            "idea.yaml",
            {
                **(load_idea_yaml(idea_id, "idea.yaml") or {}),
                "validation": {
                    "state": "completed",
                    "completed_artifacts": ["novelty-assessment"],
                    "summary": {"artifact_version": record["version"]},
                },
            },
        )
    return item, idea_id


class TestProductDefinitionWorkflow:
    @pytest.mark.asyncio
    async def test_product_runtime_disables_mutation_tools(self, monkeypatch):
        from app.orchestrator import supervisor

        captured: dict[str, object] = {}

        class StubAgent:
            async def ainvoke(self, *_args, **_kwargs):
                return {"output": "{}"}

        async def runtime(team_name, **kwargs):
            captured["team_name"] = team_name
            captured.update(kwargs)
            return StubAgent()

        monkeypatch.setattr(supervisor, "get_deep_agent_runtime_async", runtime)
        await supervisor.invoke_product_team("validated context", idea_id="IDEA-0001")

        assert captured == {
            "team_name": "product",
            "include_domain_tools": False,
            "include_mcp_tools": False,
        }

    @pytest.mark.asyncio
    async def test_happy_path_persists_one_canonical_generated_revision(
        self, organization, work_item_db, patch_config
    ):
        from app.agent.teams.product_team import generate_product_definition

        item, idea_id = await _product_item(organization)
        result = await generate_product_definition(
            idea_id,
            item.work_item_id,
            f"{item.title}\n{item.description}",
            provider=lambda _: _definition_payload(),
        )

        assert result["state"] == "completed"
        assert result["approval_state"] == "unreviewed"
        assert result["summary"]["agent_id"] == "product-team"
        assert result["summary"]["trust"] == "generated"
        assert result["summary"]["roadmap"][0]["estimate_trust"] == "generated"
        revisions = [
            revision
            for revision in load_artifact_revisions(idea_id)
            if revision["artifact_name"] == "product-definition"
        ]
        assert [revision["version"] for revision in revisions] == [1]
        assert "## Product requirements" in revisions[0]["content"]
        assert "## Phased roadmap and estimates" in revisions[0]["content"]
        assert (await work_items_service.get_work_item(item.work_item_id)).status == "product_definition"

    @pytest.mark.asyncio
    async def test_wrong_phase_refuses_provider_and_writes_no_artifact(
        self, organization, work_item_db, patch_config
    ):
        from app.agent.teams.product_team import generate_product_definition

        item, idea_id = await _product_item(organization, phase="new")
        called = False

        def provider(_):
            nonlocal called
            called = True
            return _definition_payload()

        result = await generate_product_definition(
            idea_id, item.work_item_id, item.title, provider=provider
        )

        assert result["state"] == "failed"
        assert "product_definition" in result["error"]
        assert called is False
        assert not [
            revision
            for revision in load_artifact_revisions(idea_id)
            if revision["artifact_name"] == "product-definition"
        ]

    @pytest.mark.asyncio
    async def test_reject_records_decision_and_keeps_product_definition_phase(
        self, organization, work_item_db, patch_config
    ):
        from app.agent.teams.product_team import generate_product_definition
        from app.work_items.models import ProductDefinitionDecisionRequest

        item, idea_id = await _product_item(organization)
        result = await generate_product_definition(
            idea_id, item.work_item_id, item.title, provider=lambda _: _definition_payload()
        )
        request = ProductDefinitionDecisionRequest(
            actor_id="chief_of_staff",
            decision="reject",
            artifact_version=result["summary"]["artifact_version"],
            reasoning="Clarify the compute-cost assumptions.",
        )
        _, status, event = await work_items_service.decide_product_definition(
            item.work_item_id, request
        )

        assert event is None
        assert status["approval_state"] == "rejected"
        assert (await work_items_service.get_work_item(item.work_item_id)).status == "product_definition"
        decisions = await work_items_service.repository.list_decisions(item.work_item_id)
        assert any(row["decision_type"] == "review" for row in decisions)

    @pytest.mark.asyncio
    async def test_reject_after_approve_is_compare_and_set_conflict(
        self, organization, work_item_db, patch_config
    ):
        from app.agent.teams.product_team import generate_product_definition
        from app.work_items.models import ProductDefinitionDecisionRequest

        item, idea_id = await _product_item(organization)
        result = await generate_product_definition(
            idea_id,
            item.work_item_id,
            item.title,
            provider=lambda _: _definition_payload(),
        )
        request = ProductDefinitionDecisionRequest(
            actor_id="chief_of_staff",
            decision="approve",
            artifact_version=result["summary"]["artifact_version"],
            reasoning="Ready.",
        )
        await work_items_service.decide_product_definition(item.work_item_id, request)

        with pytest.raises(work_items_service.ProductDefinitionApprovalError):
            await work_items_service.decide_product_definition(
                item.work_item_id,
                request.model_copy(update={"decision": "reject", "reasoning": "Too late."}),
            )
        assert load_idea_yaml(idea_id, "idea.yaml")["product_definition"]["approval_state"] == "approved"

    @pytest.mark.asyncio
    async def test_generation_after_approved_handoff_preserves_approval_metadata(
        self, organization, work_item_db, patch_config
    ):
        from app.agent.teams.product_team import generate_product_definition
        from app.work_items.models import ProductDefinitionDecisionRequest

        item, idea_id = await _product_item(organization)
        generated = await generate_product_definition(
            idea_id, item.work_item_id, item.title, provider=lambda _: _definition_payload()
        )
        await work_items_service.decide_product_definition(
            item.work_item_id,
            ProductDefinitionDecisionRequest(
                actor_id="chief_of_staff",
                decision="approve",
                artifact_version=generated["summary"]["artifact_version"],
                reasoning="Ready for Technology.",
            ),
        )
        before = load_idea_yaml(idea_id, "idea.yaml")["product_definition"]
        called = False

        def provider(_):
            nonlocal called
            called = True
            raise AssertionError("approved handoffs must not regenerate")

        result = await generate_product_definition(
            idea_id, item.work_item_id, item.title, provider=provider
        )
        assert called is False
        assert result["approval_state"] == "approved"
        assert load_idea_yaml(idea_id, "idea.yaml")["product_definition"] == before

    @pytest.mark.asyncio
    @pytest.mark.parametrize("target", ["development", "testing", "deployment", "monitoring"])
    async def test_generic_transition_cannot_bypass_product_definition_handoff(
        self, organization, work_item_db, patch_config, target
    ):
        item, _idea_id = await _product_item(organization, ready=False)

        with pytest.raises(work_items_service.InvalidTransitionError, match="approval"):
            await work_items_service.transition_work_item(item.work_item_id, target)

        assert (await work_items_service.get_work_item(item.work_item_id)).status == (
            "product_definition"
        )

    @pytest.mark.asyncio
    async def test_generic_technology_transition_accepts_only_audited_approval(
        self, organization, work_item_db, patch_config
    ):
        from app.agent.teams.product_team import generate_product_definition

        item, idea_id = await _product_item(organization)
        result = await generate_product_definition(
            idea_id, item.work_item_id, item.title, provider=lambda _: _definition_payload()
        )
        version = result["summary"]["artifact_version"]
        evidence = [f"product-definition:v{version:02d}"]
        now = "2026-08-26T00:00:00+00:00"
        await work_items_service.repository.insert_product_definition_decision_if_absent(
            {
                "decision_id": "audited-handoff",
                "work_item_id": item.work_item_id,
                "agent_id": "chief_of_staff",
                "decision_type": "handoff",
                "reasoning": "Approved.",
                "evidence": evidence,
                "confidence": "high",
                "alternatives": [],
                "decided_at": now,
            }
        )
        product_definition = load_idea_yaml(idea_id, "idea.yaml")["product_definition"]
        product_definition["approval_state"] = "approved"
        product_definition["approval_decision"] = {
            "decision": "approve",
            "actor_id": "chief_of_staff",
            "reasoning": "Approved.",
            "alternatives": [],
            "artifact_version": version,
            "decided_at": now,
        }
        save_idea_yaml(
            idea_id,
            "idea.yaml",
            {**load_idea_yaml(idea_id, "idea.yaml"), "product_definition": product_definition},
        )

        updated, event = await work_items_service.transition_work_item(
            item.work_item_id,
            "testing",
            decided_by="chief_of_staff",
        )
        assert updated.status == "testing"
        assert event.event_type == "handoff"

    @pytest.mark.asyncio
    async def test_concurrent_decisions_allow_only_one_terminal_outcome(
        self, organization, work_item_db, patch_config
    ):
        from app.agent.teams.product_team import generate_product_definition
        from app.work_items.models import ProductDefinitionDecisionRequest

        item, idea_id = await _product_item(organization)
        generated = await generate_product_definition(
            idea_id, item.work_item_id, item.title, provider=lambda _: _definition_payload()
        )
        version = generated["summary"]["artifact_version"]
        requests = [
            ProductDefinitionDecisionRequest(
                actor_id="chief_of_staff",
                decision="approve",
                artifact_version=version,
                reasoning="Ship it.",
            ),
            ProductDefinitionDecisionRequest(
                actor_id="chief_of_staff",
                decision="reject",
                artifact_version=version,
                reasoning="Needs another review.",
            ),
        ]
        results = await asyncio.gather(
            *(work_items_service.decide_product_definition(item.work_item_id, request)
              for request in requests),
            return_exceptions=True,
        )
        assert sum(isinstance(result, tuple) for result in results) == 1
        assert sum(
            isinstance(result, work_items_service.ProductDefinitionApprovalError)
            for result in results
        ) == 1
        assert (await work_items_service.get_work_item(item.work_item_id)).status in {
            "product_definition",
            "development",
        }

    @pytest.mark.asyncio
    async def test_cancellation_after_persistence_starts_preserves_completed_revision(
        self, organization, work_item_db, patch_config, monkeypatch
    ):
        from app.agent.teams import product_team

        item, idea_id = await _product_item(organization)
        started = threading.Event()
        original_save = product_team.save_artifact_revision

        def slow_save(*args, **kwargs):
            started.set()
            time.sleep(0.03)
            return original_save(*args, **kwargs)

        monkeypatch.setattr(product_team, "save_artifact_revision", slow_save)
        task = asyncio.create_task(
            product_team.generate_product_definition(
                idea_id, item.work_item_id, item.title, provider=lambda _: _definition_payload()
            )
        )
        await asyncio.to_thread(started.wait, 2)
        task.cancel()
        result = await task

        assert result["state"] == "completed"
        assert result["completed_artifacts"] == ["product-definition"]

    @pytest.mark.asyncio
    async def test_reject_rolls_back_metadata_when_audit_persistence_fails(
        self, organization, work_item_db, patch_config, monkeypatch
    ):
        from app.agent.teams.product_team import generate_product_definition
        from app.work_items.models import ProductDefinitionDecisionRequest

        item, idea_id = await _product_item(organization)
        result = await generate_product_definition(
            idea_id, item.work_item_id, item.title, provider=lambda _: _definition_payload()
        )

        async def fail_audit(_decision, _workspace_action):
            raise RuntimeError("audit unavailable")

        monkeypatch.setattr(
            work_items_service.repository,
            "record_product_definition_decision_with_workspace",
            fail_audit,
        )
        with pytest.raises(RuntimeError, match="audit unavailable"):
            await work_items_service.decide_product_definition(
                item.work_item_id,
                ProductDefinitionDecisionRequest(
                    actor_id="chief_of_staff",
                    decision="reject",
                    artifact_version=result["summary"]["artifact_version"],
                    reasoning="Needs revision.",
                ),
            )
        assert load_idea_yaml(idea_id, "idea.yaml")["product_definition"]["approval_state"] == "unreviewed"

    @pytest.mark.asyncio
    async def test_workspace_failure_rolls_back_approved_transition_and_audit(
        self, organization, work_item_db, patch_config, monkeypatch
    ):
        from app.agent.teams.product_team import generate_product_definition
        from app.storage import idea_workspace
        from app.work_items.models import ProductDefinitionDecisionRequest

        item, idea_id = await _product_item(organization)
        result = await generate_product_definition(
            idea_id, item.work_item_id, item.title, provider=lambda _: _definition_payload()
        )

        def fail_workspace(*_args, **_kwargs):
            raise OSError("workspace unavailable")

        monkeypatch.setattr(idea_workspace, "save_idea_yaml", fail_workspace)
        with pytest.raises(OSError, match="workspace unavailable"):
            await work_items_service.decide_product_definition(
                item.work_item_id,
                ProductDefinitionDecisionRequest(
                    actor_id="chief_of_staff",
                    decision="approve",
                    artifact_version=result["summary"]["artifact_version"],
                    reasoning="Ready for Technology.",
                ),
            )

        assert (await work_items_service.get_work_item(item.work_item_id)).status == (
            "product_definition"
        )
        assert load_idea_yaml(idea_id, "idea.yaml")["product_definition"]["approval_state"] == "unreviewed"
        assert not await work_items_service.repository.has_product_definition_approval(
            item.work_item_id,
            [f"product-definition:v{result['summary']['artifact_version']:02d}"],
        )

    @pytest.mark.asyncio
    async def test_workspace_failure_rolls_back_rejection_audit(
        self, organization, work_item_db, patch_config, monkeypatch
    ):
        from app.agent.teams.product_team import generate_product_definition
        from app.storage import idea_workspace
        from app.work_items.models import ProductDefinitionDecisionRequest

        item, idea_id = await _product_item(organization)
        result = await generate_product_definition(
            idea_id, item.work_item_id, item.title, provider=lambda _: _definition_payload()
        )

        def fail_workspace(*_args, **_kwargs):
            raise OSError("workspace unavailable")

        monkeypatch.setattr(idea_workspace, "save_idea_yaml", fail_workspace)
        with pytest.raises(OSError, match="workspace unavailable"):
            await work_items_service.decide_product_definition(
                item.work_item_id,
                ProductDefinitionDecisionRequest(
                    actor_id="chief_of_staff",
                    decision="reject",
                    artifact_version=result["summary"]["artifact_version"],
                    reasoning="Needs revision.",
                ),
            )

        assert (await work_items_service.get_work_item(item.work_item_id)).status == (
            "product_definition"
        )
        assert load_idea_yaml(idea_id, "idea.yaml")["product_definition"]["approval_state"] == "unreviewed"
        decisions = await work_items_service.repository.list_decisions(item.work_item_id)
        assert not [decision for decision in decisions if decision["decision_type"] == "review"]

    @pytest.mark.asyncio
    async def test_only_chief_of_staff_can_approve_and_stale_revision_is_rejected(
        self, organization, work_item_db, patch_config
    ):
        from app.agent.teams.product_team import generate_product_definition
        from app.work_items.models import ProductDefinitionDecisionRequest

        item, idea_id = await _product_item(organization)
        result = await generate_product_definition(
            idea_id, item.work_item_id, item.title, provider=lambda _: _definition_payload()
        )
        version = result["summary"]["artifact_version"]
        with pytest.raises(work_items_service.UnauthorizedProductDefinitionError):
            await work_items_service.decide_product_definition(
                item.work_item_id,
                ProductDefinitionDecisionRequest(
                    actor_id="not-chief-of-staff",
                    decision="approve",
                    artifact_version=version,
                    reasoning="Not authorized.",
                ),
            )
        with pytest.raises(work_items_service.ProductDefinitionApprovalError):
            await work_items_service.decide_product_definition(
                item.work_item_id,
                ProductDefinitionDecisionRequest(
                    actor_id="chief_of_staff",
                    decision="approve",
                    artifact_version=version + 1,
                    reasoning="Stale revision.",
                ),
            )

    @pytest.mark.asyncio
    async def test_approve_records_handoff_and_enters_development(
        self, organization, work_item_db, patch_config
    ):
        from app.agent.teams.product_team import generate_product_definition
        from app.work_items.models import ProductDefinitionDecisionRequest

        item, idea_id = await _product_item(organization)
        result = await generate_product_definition(
            idea_id, item.work_item_id, item.title, provider=lambda _: _definition_payload()
        )
        _, status, event = await work_items_service.decide_product_definition(
            item.work_item_id,
            ProductDefinitionDecisionRequest(
                actor_id="chief_of_staff",
                decision="approve",
                artifact_version=result["summary"]["artifact_version"],
                reasoning="Definition is ready for Technology.",
            ),
        )

        assert status["approval_state"] == "approved"
        assert event is not None and event.event_type == "handoff"
        assert (await work_items_service.get_work_item(item.work_item_id)).status == "development"
        decisions = await work_items_service.repository.list_decisions(item.work_item_id)
        handoff = next(row for row in decisions if row["decision_type"] == "handoff")
        assert handoff["agent_id"] == "chief_of_staff"

    @pytest.mark.asyncio
    async def test_api_read_and_decision_expose_audited_lifecycle(
        self, client, organization, work_item_db, patch_config
    ):
        from app.agent.teams.product_team import generate_product_definition

        item, idea_id = await _product_item(organization)
        result = await generate_product_definition(
            idea_id, item.work_item_id, item.title, provider=lambda _: _definition_payload()
        )
        response = client.get(f"/api/work-items/{item.work_item_id}/product-definition")
        assert response.status_code == 200
        assert response.json()["product_definition"]["summary"]["artifact_version"] == 1

        decision = client.post(
            f"/api/work-items/{item.work_item_id}/product-definition/approve",
            json={
                "actor_id": "chief_of_staff",
                "decision": "approve",
                "artifact_version": result["summary"]["artifact_version"],
                "reasoning": "Ready for Technology.",
            },
        )
        assert decision.status_code == 200
        assert decision.json()["lifecycle_status"] == "development"
        assert decision.json()["event"]["event_type"] == "handoff"
        fetched = client.get(f"/api/work-items/{item.work_item_id}/product-definition")
        assert fetched.json()["product_definition"]["approval_decision"]["decision"] == "approve"

    @pytest.mark.asyncio
    async def test_single_work_item_includes_product_definition_metadata(
        self, client, organization, work_item_db, patch_config
    ):
        from app.agent.teams.product_team import generate_product_definition

        item, idea_id = await _product_item(organization)
        await generate_product_definition(
            idea_id, item.work_item_id, item.title, provider=lambda _: _definition_payload()
        )

        response = client.get(f"/api/work-items/{item.work_item_id}")
        assert response.status_code == 200
        assert response.json()["work_item"]["product_definition"]["state"] == "completed"

    @pytest.mark.asyncio
    async def test_unmapped_generation_failure_survives_a_follow_up_read(
        self, client, organization, work_item_db, patch_config
    ):
        item = await work_items_service.submit_work_item(
            "Unmapped concept", "No idea has been created.", org_id=organization.org_id
        )
        result = await work_items_service.run_work_item_product_definition(item.work_item_id)
        assert result[1]["state"] == "failed"

        response = client.get(f"/api/work-items/{item.work_item_id}/product-definition")
        assert response.status_code == 200
        assert response.json()["product_definition"]["error"] == "No idea is mapped to this work item"

    @pytest.mark.asyncio
    async def test_missing_assessment_is_explicit_and_writes_no_artifact(
        self, organization, work_item_db, patch_config
    ):
        from app.agent.teams.product_team import generate_product_definition

        item, idea_id = await _product_item(organization, ready=False)
        result = await generate_product_definition(
            idea_id,
            item.work_item_id,
            item.title,
            provider=lambda _: _definition_payload(),
        )

        assert result["state"] == "failed"
        assert "assessment" in result["error"].lower()
        assert result["completed_artifacts"] == []

    @pytest.mark.asyncio
    async def test_invalid_provider_output_is_failed_without_partial_success(
        self, organization, work_item_db, patch_config
    ):
        from app.agent.teams.product_team import generate_product_definition

        item, idea_id = await _product_item(organization)
        invalid = _definition_payload()
        invalid["roadmap"][0].pop("estimate_basis")

        result = await generate_product_definition(
            idea_id, item.work_item_id, item.title, provider=lambda _: invalid
        )

        assert result["state"] == "failed"
        assert "Invalid product definition" in result["error"]
        assert not [
            revision
            for revision in load_artifact_revisions(idea_id)
            if revision["artifact_name"] == "product-definition"
        ]

    @pytest.mark.asyncio
    async def test_unrecognized_evidence_reference_is_rejected(
        self, organization, work_item_db, patch_config
    ):
        from app.agent.teams.product_team import generate_product_definition

        item, idea_id = await _product_item(organization)
        invalid = _definition_payload()
        invalid["requirements"][0]["evidence_refs"] = ["fabricated:source"]

        result = await generate_product_definition(
            idea_id, item.work_item_id, item.title, provider=lambda _: invalid
        )

        assert result["state"] == "failed"
        assert "supplied assessment evidence" in result["error"]

    @pytest.mark.asyncio
    async def test_repeat_generation_preserves_prior_revision(
        self, organization, work_item_db, patch_config
    ):
        from app.agent.teams.product_team import generate_product_definition

        item, idea_id = await _product_item(organization)
        await generate_product_definition(
            idea_id, item.work_item_id, item.title, provider=lambda _: _definition_payload()
        )
        changed = _definition_payload()
        changed["roadmap"][0]["agent_hours"] = 20
        second = await generate_product_definition(
            idea_id, item.work_item_id, item.title, provider=lambda _: changed
        )

        revisions = [
            revision
            for revision in load_artifact_revisions(idea_id)
            if revision["artifact_name"] == "product-definition"
        ]
        assert second["summary"]["artifact_version"] == 2
        assert [revision["version"] for revision in revisions] == [1, 2]
        assert revisions[-1]["diff"]

    @pytest.mark.asyncio
    async def test_concurrent_generations_keep_serialized_latest_success(
        self, organization, work_item_db, patch_config
    ):
        from app.agent.teams.product_team import generate_product_definition

        item, idea_id = await _product_item(organization)
        calls: list[str] = []

        async def first(_):
            calls.append("first")
            await asyncio.sleep(0.01)
            payload = _definition_payload()
            payload["roadmap"][0]["agent_hours"] = 10
            return payload

        async def second(_):
            calls.append("second")
            payload = _definition_payload()
            payload["roadmap"][0]["agent_hours"] = 20
            return payload

        results = await asyncio.gather(
            generate_product_definition(idea_id, item.work_item_id, item.title, provider=first),
            generate_product_definition(idea_id, item.work_item_id, item.title, provider=second),
        )
        revisions = [
            revision for revision in load_artifact_revisions(idea_id)
            if revision["artifact_name"] == "product-definition"
        ]
        assert calls == ["first", "second"]
        assert [revision["version"] for revision in revisions] == [1, 2]
        assert results[-1]["summary"]["roadmap"][0]["agent_hours"] == 20

    @pytest.mark.asyncio
    async def test_timeout_and_cancellation_publish_no_partial_artifact(
        self, organization, work_item_db, patch_config
    ):
        from app.agent.teams.product_team import generate_product_definition

        item, idea_id = await _product_item(organization)

        def slow(_):
            time.sleep(0.02)
            return _definition_payload()

        timed_out = await generate_product_definition(
            idea_id,
            item.work_item_id,
            item.title,
            provider=slow,
            time_budget_sec=0.001,
        )
        assert timed_out["state"] == "incomplete"

        async def waiting(_):
            await asyncio.sleep(1)
            return _definition_payload()

        task = asyncio.create_task(
            generate_product_definition(
                idea_id, item.work_item_id, item.title, provider=waiting
            )
        )
        await asyncio.sleep(0.001)
        task.cancel()
        cancelled = await task
        assert cancelled["state"] == "cancelled"
        assert not [
            revision
            for revision in load_artifact_revisions(idea_id)
            if revision["artifact_name"] == "product-definition"
        ]
