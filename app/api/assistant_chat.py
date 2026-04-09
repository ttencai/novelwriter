# SPDX-FileCopyrightText: 2026 Isaac.X.惟.Yuan
# SPDX-License-Identifier: AGPL-3.0-only

"""Dedicated assistant-chat API endpoints.

These endpoints provide a normal multi-turn chat experience and intentionally
do not execute the world-model copilot/research runtime.
"""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.api.copilot import _run_to_response
from app.api.deps import verify_novel_access
from app.core.auth import (
    check_generation_quota,
    finalize_quota_reservation,
    get_current_user_or_default,
    open_quota_reservation,
)
from app.core.copilot import (
    CopilotError,
    _is_assistant_chat_session,
    check_stale_run,
    create_run,
    execute_assistant_chat_run,
    list_session_runs,
    load_latest_run,
    load_run,
    load_session,
    open_or_reuse_session,
)
from app.core.llm_request import get_llm_config
from app.database import get_db
from app.models import Novel, User
from app.schemas import (
    CopilotRunCreateRequest,
    CopilotRunResponse,
    CopilotSessionOpenRequest,
    CopilotSessionResponse,
)

router = APIRouter(prefix="/api/novels/{novel_id}/assistant-chat", tags=["assistant-chat"])


def _handle_copilot_error(exc: CopilotError) -> None:
    raise HTTPException(
        status_code=exc.status_code,
        detail={"code": exc.code, "message": exc.message},
    )


def _ensure_assistant_session(session) -> None:
    if _is_assistant_chat_session(session):
        return
    raise HTTPException(
        status_code=404,
        detail={"code": "assistant_chat_session_not_found", "message": "Assistant chat session not found"},
    )


@router.post("/sessions", response_model=CopilotSessionResponse)
def session_open(
    novel_id: int,
    body: CopilotSessionOpenRequest,
    novel: Novel = Depends(verify_novel_access),
    user: User = Depends(get_current_user_or_default),
    db: Session = Depends(get_db),
):
    try:
        context = body.context.model_dump() if body.context else None
        session, created = open_or_reuse_session(
            db=db,
            novel_id=novel_id,
            user_id=user.id,
            mode=body.mode,
            scope=body.scope,
            context=context,
            interaction_locale=body.interaction_locale,
            entrypoint="assistant_chat",
            session_key=body.session_key,
            display_title=body.display_title or "AI 对话",
        )
        return CopilotSessionResponse(
            session_id=session.session_id,
            signature=session.signature,
            mode=session.mode,
            scope=session.scope,
            context=session.context_json,
            interaction_locale=session.interaction_locale,
            display_title=session.display_title,
            created=created,
            created_at=session.created_at,
        )
    except CopilotError as exc:
        _handle_copilot_error(exc)


@router.post("/sessions/{session_id}/runs", response_model=CopilotRunResponse, status_code=202)
async def run_create(
    novel_id: int,
    session_id: str,
    body: CopilotRunCreateRequest,
    request: Request,
    novel: Novel = Depends(verify_novel_access),
    user: User = Depends(check_generation_quota),
    db: Session = Depends(get_db),
):
    reservation_id: int | None = None
    try:
        session = load_session(db, novel_id, user.id, session_id)
        _ensure_assistant_session(session)
        reservation_id = open_quota_reservation(db, user.id, count=1)
        try:
            run = create_run(
                db,
                session,
                user.id,
                body.prompt,
                resume_run_id=body.resume_run_id,
                quota_reservation_id=reservation_id,
            )
        except Exception:
            if reservation_id is not None:
                finalize_quota_reservation(db, reservation_id)
            raise
    except CopilotError as exc:
        _handle_copilot_error(exc)
        return

    llm_config = get_llm_config(request)
    asyncio.create_task(
        execute_assistant_chat_run(
            run_id=run.run_id,
            novel_id=novel_id,
            user_id=user.id,
            llm_config=llm_config,
        )
    )
    return _run_to_response(run)


@router.get("/sessions/{session_id}/runs/{run_id}", response_model=CopilotRunResponse)
def run_poll(
    novel_id: int,
    session_id: str,
    run_id: str,
    novel: Novel = Depends(verify_novel_access),
    user: User = Depends(get_current_user_or_default),
    db: Session = Depends(get_db),
):
    try:
        session = load_session(db, novel_id, user.id, session_id)
        _ensure_assistant_session(session)
        run = load_run(db, novel_id, user.id, session_id, run_id)
    except CopilotError as exc:
        _handle_copilot_error(exc)
        return

    if check_stale_run(run):
        db.commit()
    return _run_to_response(run)


@router.get("/sessions/{session_id}/runs/latest", response_model=CopilotRunResponse)
def run_latest(
    novel_id: int,
    session_id: str,
    novel: Novel = Depends(verify_novel_access),
    user: User = Depends(get_current_user_or_default),
    db: Session = Depends(get_db),
):
    try:
        session = load_session(db, novel_id, user.id, session_id)
        _ensure_assistant_session(session)
        run = load_latest_run(db, session.id)
    except CopilotError as exc:
        _handle_copilot_error(exc)
        return

    if check_stale_run(run):
        db.commit()
    return _run_to_response(run)


@router.get("/sessions/{session_id}/runs", response_model=list[CopilotRunResponse])
def run_list(
    novel_id: int,
    session_id: str,
    novel: Novel = Depends(verify_novel_access),
    user: User = Depends(get_current_user_or_default),
    db: Session = Depends(get_db),
):
    try:
        session = load_session(db, novel_id, user.id, session_id)
        _ensure_assistant_session(session)
    except CopilotError as exc:
        _handle_copilot_error(exc)
        return

    runs = list_session_runs(db, session.id)
    for run in runs:
        if check_stale_run(run):
            db.commit()

    return [_run_to_response(run) for run in runs]
