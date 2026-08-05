# SPDX-FileCopyrightText: 2026 Isaac.X.Ω.Yuan
# SPDX-License-Identifier: AGPL-3.0-only

"""Copilot lease heartbeat behavior tests."""

import asyncio

import pytest

from app.core.copilot.lease import await_with_run_lease_heartbeat


@pytest.mark.asyncio
async def test_long_operation_renews_lease_until_completion(monkeypatch):
    renewals: list[str] = []
    real_sleep = asyncio.sleep

    async def fast_sleep(_seconds: float) -> None:
        await real_sleep(0)

    async def slow_operation() -> str:
        for _ in range(3):
            await real_sleep(0)
        return "completed"

    def renew(_db_factory, *, run_id: str, worker_id: str) -> bool:
        renewals.append(f"{run_id}:{worker_id}")
        return True

    monkeypatch.setattr("app.core.copilot.lease.asyncio.sleep", fast_sleep)

    result = await await_with_run_lease_heartbeat(
        slow_operation(),
        db_factory=lambda: None,
        run_id="run-1",
        worker_id="worker-1",
        renew_run_lease=renew,
        lease_lost_error_factory=RuntimeError,
    )

    assert result == "completed"
    assert renewals


@pytest.mark.asyncio
async def test_lease_loss_cancels_long_operation(monkeypatch):
    operation_cancelled = asyncio.Event()
    real_sleep = asyncio.sleep

    async def fast_sleep(_seconds: float) -> None:
        await real_sleep(0)

    async def never_finishes() -> None:
        try:
            await asyncio.Event().wait()
        finally:
            operation_cancelled.set()

    monkeypatch.setattr("app.core.copilot.lease.asyncio.sleep", fast_sleep)

    with pytest.raises(RuntimeError, match="run-2"):
        await await_with_run_lease_heartbeat(
            never_finishes(),
            db_factory=lambda: None,
            run_id="run-2",
            worker_id="worker-2",
            renew_run_lease=lambda *_args, **_kwargs: False,
            lease_lost_error_factory=RuntimeError,
        )

    assert operation_cancelled.is_set()
