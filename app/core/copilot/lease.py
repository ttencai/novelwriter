# SPDX-FileCopyrightText: 2026 Isaac.X.Ω.Yuan
# SPDX-License-Identifier: AGPL-3.0-only

"""Helpers that keep a Copilot run lease alive during slow model requests."""

from __future__ import annotations

import asyncio
from contextlib import suppress
from typing import Awaitable, Callable, TypeVar

from sqlalchemy.orm import Session

T = TypeVar("T")


def _heartbeat_interval_seconds() -> float:
    """Renew well before expiry while avoiding unnecessary database writes."""
    from app.config import get_settings

    lease_seconds = int(get_settings().copilot_run_lease_seconds or 0)
    if lease_seconds <= 0:
        return 60.0
    return float(max(1, min(60, lease_seconds // 3)))


async def await_with_run_lease_heartbeat(
    operation: Awaitable[T],
    *,
    db_factory: Callable[[], Session] | None,
    run_id: str,
    worker_id: str,
    renew_run_lease: Callable[..., bool],
    lease_lost_error_factory: Callable[[str], Exception],
) -> T:
    """Await an operation while periodically renewing its owned run lease."""
    if not db_factory or not run_id or not worker_id:
        return await operation

    async def heartbeat() -> None:
        while True:
            await asyncio.sleep(_heartbeat_interval_seconds())
            # 续租使用独立数据库会话，避免长请求占用执行阶段的会话。
            if not renew_run_lease(db_factory, run_id=run_id, worker_id=worker_id):
                raise lease_lost_error_factory(run_id)

    operation_task = asyncio.ensure_future(operation)
    heartbeat_task = asyncio.create_task(heartbeat())
    try:
        done, _ = await asyncio.wait(
            {operation_task, heartbeat_task},
            return_when=asyncio.FIRST_COMPLETED,
        )
        if heartbeat_task in done:
            error = heartbeat_task.exception()
            if error is not None:
                operation_task.cancel()
                with suppress(asyncio.CancelledError):
                    await operation_task
                raise error
        return await operation_task
    except asyncio.CancelledError:
        # 上层取消任务时同步取消模型请求，避免后台继续占用连接和并发槽。
        operation_task.cancel()
        with suppress(asyncio.CancelledError):
            await operation_task
        raise
    finally:
        heartbeat_task.cancel()
        with suppress(asyncio.CancelledError):
            await heartbeat_task
