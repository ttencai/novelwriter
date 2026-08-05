# SPDX-FileCopyrightText: 2026 Isaac.X.Ω.Yuan
# SPDX-License-Identifier: AGPL-3.0-only

"""Tool-loop runtime/orchestration helpers for copilot."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from sqlalchemy.orm import Session

from app.core.ai_client import AIClient, ToolCall
from app.core.copilot.scope import EvidenceItem, ScopeSnapshot
from app.core.copilot.lease import await_with_run_lease_heartbeat
from app.core.copilot.workspace import (
    Workspace,
    deserialize_tool_call,
    serialize_tool_call,
)
from app.models import Novel

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ToolLoopDeps:
    tool_schemas: list[dict[str, Any]]
    acquire_llm_slot: Callable[[], Awaitable[Any]]
    release_llm_slot: Callable[[], None]
    build_system_prompt: Callable[[ScopeSnapshot, str, str, dict[str, Any], str], str]
    build_auto_preload: Callable[[ScopeSnapshot, str], str]
    should_preload_world_context: Callable[[str], bool]
    load_scope_snapshot: Callable[[Session, Novel, str, str, dict[str, Any] | None], ScopeSnapshot]
    dispatch_tool: Callable[[str, dict[str, Any], Session, int, ScopeSnapshot, Workspace, str], str]
    tool_load_scope_snapshot: Callable[[ScopeSnapshot], str]
    persist_workspace: Callable[..., bool]
    renew_run_lease: Callable[..., bool]
    extract_llm_kwargs: Callable[[dict[str, Any] | None], dict[str, Any]]
    parse_llm_response: Callable[[str], dict[str, Any]]
    evidence_from_workspace: Callable[[Workspace, list[EvidenceItem], str], list[EvidenceItem]]
    lease_lost_error_factory: Callable[[str], Exception]
    client_factory: Callable[[], AIClient] = AIClient


def build_assistant_tool_call_message(
    tool_calls: list[ToolCall],
    *,
    content: str | None,
) -> dict[str, Any]:
    return {
        "role": "assistant",
        "content": content or "",
        "tool_calls": [
            {
                "id": tool_call.id,
                "type": "function",
                "function": {
                    "name": tool_call.name,
                    "arguments": tool_call.arguments,
                },
            }
            for tool_call in tool_calls
        ],
    }


def _ensure_run_lease(
    deps: ToolLoopDeps,
    db_factory: Callable[[], Session],
    *,
    run_id: str,
    worker_id: str,
) -> None:
    if run_id and worker_id and not deps.renew_run_lease(db_factory, run_id=run_id, worker_id=worker_id):
        raise deps.lease_lost_error_factory(run_id)


def _execute_pending_tool_calls(
    *,
    deps: ToolLoopDeps,
    build_tool_journal_entry: Callable[..., dict[str, Any]],
    db_factory: Callable[[], Session],
    novel_id: int,
    session_data: dict[str, Any],
    snapshot: ScopeSnapshot,
    workspace: Workspace,
    messages: list[dict[str, Any]],
    round_number: int,
    run_id: str = "",
    worker_id: str = "",
) -> ScopeSnapshot:
    while workspace.pending_tool_calls:
        _ensure_run_lease(deps, db_factory, run_id=run_id, worker_id=worker_id)

        tool_call = deserialize_tool_call(workspace.pending_tool_calls[0])
        workspace.tool_call_count += 1

        try:
            tool_args = json.loads(tool_call.arguments) if tool_call.arguments else {}
        except json.JSONDecodeError:
            tool_args = {}

        tool_db = db_factory()
        try:
            if tool_call.name == "load_scope_snapshot":
                tool_novel = tool_db.get(Novel, novel_id)
                if tool_novel:
                    snapshot = deps.load_scope_snapshot(
                        tool_db,
                        tool_novel,
                        session_data["mode"],
                        session_data["scope"],
                        session_data["context_json"],
                    )
                tool_result = deps.tool_load_scope_snapshot(snapshot)
            else:
                tool_result = deps.dispatch_tool(
                    tool_call.name,
                    tool_args,
                    tool_db,
                    novel_id,
                    snapshot,
                    workspace,
                    session_data["interaction_locale"],
                )
        finally:
            tool_db.close()

        messages.append({"role": "tool", "tool_call_id": tool_call.id, "content": tool_result})
        workspace.tool_journal.append(
            build_tool_journal_entry(
                tool_name=tool_call.name,
                tool_args=tool_args,
                tool_result=tool_result,
                round_number=round_number,
                call_index=workspace.tool_call_count,
                interaction_locale=session_data["interaction_locale"],
            )
        )
        workspace.pending_tool_calls.pop(0)
        workspace.messages = list(messages)

        if run_id and not deps.persist_workspace(db_factory, run_id, workspace, worker_id=worker_id):
            raise deps.lease_lost_error_factory(run_id)

    return snapshot
async def run_tool_loop(
    *,
    deps: ToolLoopDeps,
    db_factory: Callable[[], Session],
    novel_id: int,
    session_data: dict[str, Any],
    prompt: str,
    llm_config: dict[str, Any] | None,
    user_id: int,
    snapshot: ScopeSnapshot,
    scenario: str,
    evidence: list[EvidenceItem],
    turn_intent: str,
    run_id: str = "",
    worker_id: str = "",
    inherited_workspace: dict[str, Any] | None = None,
    prior_messages: list[dict[str, str]] | None = None,
    workspace_seed: dict[str, Any] | None = None,
    build_tool_journal_entry: Callable[..., dict[str, Any]],
) -> tuple[dict[str, Any], list[EvidenceItem], Workspace]:
    """Run the tool-loop agent. Returns (parsed_answer, evidence, workspace)."""
    from app.config import get_settings

    settings = get_settings()
    max_rounds = settings.copilot_max_tool_rounds
    client = deps.client_factory()
    llm_kwargs = deps.extract_llm_kwargs(llm_config)

    if inherited_workspace and inherited_workspace.get("messages"):
        workspace = Workspace.from_dict(inherited_workspace)
        messages = list(workspace.messages)
        rounds_used = workspace.round_count
        logger.info(
            "Resuming tool loop from workspace: %d rounds used, %d packs, %d journal entries",
            rounds_used, len(workspace.evidence_packs), len(workspace.tool_journal),
        )
    else:
        workspace = Workspace.from_dict(workspace_seed) if workspace_seed else Workspace()
        workspace.tool_journal = []
        workspace.messages = []
        workspace.pending_tool_calls = []
        workspace.tool_call_count = 0
        workspace.round_count = 0
        workspace.final_answer_draft = None
        rounds_used = 0

        system_prompt = deps.build_system_prompt(
            snapshot,
            scenario,
            session_data["interaction_locale"],
            session_data,
            turn_intent,
        )
        user_content = prompt
        if deps.should_preload_world_context(turn_intent):
            auto_preload = deps.build_auto_preload(snapshot, session_data["interaction_locale"])
            user_content = f"{prompt}\n\n---\n[Auto-preloaded world model summary]\n{auto_preload}"
        # 明确指定的章节或角色证据必须在首轮可见，不能只依赖模型主动调用检索工具。
        explicit_evidence = [
            item
            for item in evidence
            if isinstance(item.source_ref, dict) and item.source_ref.get("explicit_query")
        ]
        if explicit_evidence:
            evidence_text = "\n\n".join(
                f"[Evidence#{index}] {item.title}\n{item.excerpt}"
                for index, item in enumerate(explicit_evidence, 1)
            )
            user_content = (
                f"{user_content}\n\n---\n"
                "[Evidence explicitly requested by the user]\n"
                f"{evidence_text}"
            )
        messages = [{"role": "system", "content": system_prompt}]
        if prior_messages:
            messages.extend(prior_messages)
        messages.append({"role": "user", "content": user_content})
        workspace.messages = list(messages)

    remaining_rounds = max(0, max_rounds - rounds_used)

    if workspace.pending_tool_calls:
        logger.info(
            "Resuming pending tool batch with %d remaining call(s)",
            len(workspace.pending_tool_calls),
        )
        snapshot = _execute_pending_tool_calls(
            deps=deps,
            build_tool_journal_entry=build_tool_journal_entry,
            db_factory=db_factory,
            novel_id=novel_id,
            session_data=session_data,
            snapshot=snapshot,
            workspace=workspace,
            messages=messages,
            round_number=max(1, workspace.round_count),
            run_id=run_id,
            worker_id=worker_id,
        )

    for round_idx in range(remaining_rounds):
        workspace.round_count = rounds_used + round_idx + 1
        _ensure_run_lease(deps, db_factory, run_id=run_id, worker_id=worker_id)

        async def call_model():
            await deps.acquire_llm_slot()
            try:
                return await client.generate_with_tools(
                    messages=messages,
                    tools=deps.tool_schemas,
                    max_tokens=4000,
                    temperature=0.4,
                    role="default",
                    user_id=user_id,
                    **llm_kwargs,
                )
            finally:
                deps.release_llm_slot()

        response = await await_with_run_lease_heartbeat(
            call_model(),
            db_factory=db_factory,
            run_id=run_id,
            worker_id=worker_id,
            renew_run_lease=deps.renew_run_lease,
            lease_lost_error_factory=deps.lease_lost_error_factory,
        )

        _ensure_run_lease(deps, db_factory, run_id=run_id, worker_id=worker_id)

        if not response.tool_calls:
            parsed = deps.parse_llm_response(response.content or "")
            workspace.final_answer_draft = response.content
            if response.content:
                messages.append({"role": "assistant", "content": response.content})
            workspace.messages = list(messages)
            return (
                parsed,
                deps.evidence_from_workspace(workspace, evidence, session_data["interaction_locale"]),
                workspace,
            )

        messages.append(
            build_assistant_tool_call_message(
                response.tool_calls,
                content=response.content,
            )
        )
        workspace.pending_tool_calls = [serialize_tool_call(tool_call) for tool_call in response.tool_calls]
        workspace.messages = list(messages)

        if run_id and not deps.persist_workspace(db_factory, run_id, workspace, worker_id=worker_id):
            raise deps.lease_lost_error_factory(run_id)

        snapshot = _execute_pending_tool_calls(
            deps=deps,
            build_tool_journal_entry=build_tool_journal_entry,
            db_factory=db_factory,
            novel_id=novel_id,
            session_data=session_data,
            snapshot=snapshot,
            workspace=workspace,
            messages=messages,
            round_number=round_idx + 1,
            run_id=run_id,
            worker_id=worker_id,
        )

    _ensure_run_lease(deps, db_factory, run_id=run_id, worker_id=worker_id)
    async def call_final_model():
        await deps.acquire_llm_slot()
        try:
            return await client.generate_with_tools(
                messages=messages,
                tools=deps.tool_schemas,
                max_tokens=4000,
                temperature=0.4,
                role="default",
                user_id=user_id,
                tool_choice="none",
                **llm_kwargs,
            )
        finally:
            deps.release_llm_slot()

    response = await await_with_run_lease_heartbeat(
        call_final_model(),
        db_factory=db_factory,
        run_id=run_id,
        worker_id=worker_id,
        renew_run_lease=deps.renew_run_lease,
        lease_lost_error_factory=deps.lease_lost_error_factory,
    )

    _ensure_run_lease(deps, db_factory, run_id=run_id, worker_id=worker_id)

    parsed = deps.parse_llm_response(response.content or "")
    workspace.final_answer_draft = response.content
    if response.content:
        messages.append({"role": "assistant", "content": response.content})
    workspace.messages = list(messages)
    return (
        parsed,
        deps.evidence_from_workspace(workspace, evidence, session_data["interaction_locale"]),
        workspace,
    )
