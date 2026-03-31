"""LLM test endpoint — validate user-supplied API config."""

import json
import time

from fastapi import APIRouter, Depends, HTTPException, Request
from openai import AsyncOpenAI
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.auth import get_current_user_or_default
from app.core.ai_client import (
    _extract_response_text,
    _extract_usage_pair,
    _normalize_base_url,
    _record_usage,
    _resolve_billing_source,
    _responses_unsupported,
    _stream_options_unsupported,
)
from app.core.llm_request import get_llm_config
from app.core.safety_fuses import ensure_ai_available

router = APIRouter(prefix="/api/llm", tags=["llm"])


def _probe_error_message(exc: Exception) -> str:
    text = str(exc).strip()
    if not text:
        return type(exc).__name__
    return text


async def _probe_stream_support(client: AsyncOpenAI, model: str) -> None:
    try:
        stream = await client.responses.create(
            model=model,
            input="Reply with exactly: ok",
            max_output_tokens=4,
            stream=True,
        )
        async for _event in stream:
            pass
        return
    except Exception as exc:
        if not _responses_unsupported(exc):
            raise

    request_kwargs = {
        "model": model,
        "messages": [{"role": "user", "content": "Reply with exactly: ok"}],
        "max_tokens": 4,
        "stream": True,
    }
    try:
        stream = await client.chat.completions.create(
            **request_kwargs,
            stream_options={"include_usage": True},
        )
    except Exception as exc:
        if not _stream_options_unsupported(exc):
            raise
        stream = await client.chat.completions.create(**request_kwargs)

    async for _chunk in stream:
        pass


async def _probe_json_mode_support(client: AsyncOpenAI, model: str) -> None:
    try:
        response = await client.responses.create(
            model=model,
            instructions='Return a JSON object: {"ok": true}. Return JSON only.',
            input="respond now",
            max_output_tokens=32,
        )
        raw = _extract_response_text(response)
    except Exception as exc:
        if not _responses_unsupported(exc):
            raise
        response = await client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": 'Return a JSON object: {"ok": true}'}],
            max_tokens=32,
            response_format={"type": "json_object"},
        )
        raw = response.choices[0].message.content or ""

    parsed = json.loads(raw)
    if not isinstance(parsed, dict):
        raise ValueError("JSON mode response is not an object")


def _build_capability_error(capabilities: dict[str, bool], errors: dict[str, str]) -> str:
    missing: list[str] = []
    if not capabilities["stream"]:
        missing.append("流式输出（续写）")
    if not capabilities["json_mode"]:
        missing.append("JSON 模式（世界生成 / Bootstrap）")

    if not missing:
        return errors.get("basic") or "连接失败"

    missing_text = "、".join(missing)
    detail_parts = [errors[key] for key in ("stream", "json_mode") if errors.get(key)]
    detail = f"；详情：{'；'.join(detail_parts)}" if detail_parts else ""
    return f"基础连接成功，但当前模型/接口不支持 {missing_text}{detail}"


@router.post("/test")
async def test_llm_connection(
    request: Request,
    _user=Depends(get_current_user_or_default),
    db: Session = Depends(get_db),
):
    config = get_llm_config(request)
    if not config or not config.get("base_url") or not config.get("api_key") or not config.get("model"):
        raise HTTPException(status_code=400, detail="Missing LLM config headers (X-LLM-Base-Url, X-LLM-Api-Key, X-LLM-Model)")

    using_request_override = bool(
        request.headers.get("x-llm-base-url")
        and request.headers.get("x-llm-api-key")
        and request.headers.get("x-llm-model")
    )
    billing_source = _resolve_billing_source(
        config.get("billing_source_hint"),
        using_request_override=using_request_override,
    )
    ensure_ai_available(db, billing_source=billing_source)

    client = AsyncOpenAI(
        base_url=_normalize_base_url(config["base_url"]),
        api_key=config["api_key"],
        timeout=10.0,
    )

    start = time.perf_counter()
    capabilities = {"basic": False, "stream": False, "json_mode": False}
    errors: dict[str, str] = {}
    try:
        try:
            response = await client.responses.create(
                model=config["model"],
                input="hi",
                max_output_tokens=1,
            )
            capabilities["basic"] = True
            prompt_tokens, completion_tokens = _extract_usage_pair(getattr(response, "usage", None))
        except Exception as exc:
            if not _responses_unsupported(exc):
                raise
            response = await client.chat.completions.create(
                model=config["model"],
                messages=[{"role": "user", "content": "hi"}],
                max_tokens=1,
            )
            capabilities["basic"] = True
            usage = getattr(response, "usage", None)
            try:
                prompt_tokens = int(usage.prompt_tokens) if usage is not None else 0
                completion_tokens = int(usage.completion_tokens) if usage is not None else 0
            except (TypeError, ValueError):
                prompt_tokens = 0
                completion_tokens = 0

        if prompt_tokens or completion_tokens:
            _record_usage(
                config["model"],
                prompt_tokens,
                completion_tokens,
                endpoint="/api/llm/test",
                node_name="llm_test",
                user_id=getattr(_user, "id", None),
                billing_source=billing_source,
            )
        latency_ms = round((time.perf_counter() - start) * 1000)
    except Exception as e:
        errors["basic"] = _probe_error_message(e)
        return {
            "ok": False,
            "model": config["model"],
            "latency_ms": round((time.perf_counter() - start) * 1000),
            "capabilities": capabilities,
            "error": f"基础连接失败：{errors['basic']}",
        }

    try:
        await _probe_stream_support(client, config["model"])
        capabilities["stream"] = True
    except Exception as e:
        errors["stream"] = _probe_error_message(e)

    try:
        await _probe_json_mode_support(client, config["model"])
        capabilities["json_mode"] = True
    except Exception as e:
        errors["json_mode"] = _probe_error_message(e)

    ok = all(capabilities.values())
    payload = {
        "ok": ok,
        "model": config["model"],
        "latency_ms": latency_ms,
        "capabilities": capabilities,
    }
    if ok:
        payload["message"] = "连接与应用兼容性检测通过"
    else:
        payload["error"] = _build_capability_error(capabilities, errors)
    return payload
