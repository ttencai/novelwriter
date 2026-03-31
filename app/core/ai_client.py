from typing import Any, Literal, Type, TypeVar
from dataclasses import dataclass, field
import json
import os
import logging
from openai import AsyncOpenAI
from pydantic import BaseModel
from app.config import get_settings
from app.core.safety_fuses import ensure_ai_available_fresh_session

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

AgentRole = Literal["director", "writer", "editor", "summary", "default"]


class LLMUnavailableError(RuntimeError):
    """Raised when an LLM request cannot be completed (network/auth/provider errors)."""


class StructuredOutputParseError(ValueError):
    """Raised when an LLM returns output that cannot be parsed into the response model."""

    def __init__(self, *, max_retries: int, last_error: Exception | None = None):
        message = f"Failed to parse structured output after {max_retries} retries"
        if last_error is not None:
            message = f"{message}: {type(last_error).__name__}"
        super().__init__(message)
        self.max_retries = max_retries
        self.last_error = last_error


class ToolCallUnsupportedError(RuntimeError):
    """Raised when the LLM provider does not support tool/function calling."""


@dataclass(slots=True)
class ToolCall:
    id: str
    name: str
    arguments: str


@dataclass(slots=True)
class ToolLLMResponse:
    content: str | None
    tool_calls: list[ToolCall] = field(default_factory=list)
    finish_reason: str | None = None
    prompt_tokens: int = 0
    completion_tokens: int = 0


_COST_TABLE = {
    "gemini-3.0-flash": (0.5, 3),
}
_DEFAULT_COST = (0.5, 3)
_BILLING_SOURCE_HOSTED = "hosted"
_BILLING_SOURCE_BYOK = "byok"
_BILLING_SOURCE_SELFHOST = "selfhost"


def _estimate_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    settings = get_settings()
    configured_input = float(settings.llm_default_input_cost_per_million_usd or 0.0)
    configured_output = float(settings.llm_default_output_cost_per_million_usd or 0.0)
    default_input_rate, default_output_rate = _COST_TABLE.get(model, _DEFAULT_COST)
    input_rate = configured_input if configured_input > 0 else default_input_rate
    output_rate = configured_output if configured_output > 0 else default_output_rate
    return (prompt_tokens * input_rate + completion_tokens * output_rate) / 1_000_000


def _resolve_billing_source(
    billing_source_hint: str | None,
    *,
    using_request_override: bool,
) -> str:
    normalized_hint = (billing_source_hint or "").strip().lower()

    if normalized_hint == _BILLING_SOURCE_HOSTED:
        return _BILLING_SOURCE_HOSTED

    settings = get_settings()
    if normalized_hint == _BILLING_SOURCE_BYOK:
        if using_request_override:
            return _BILLING_SOURCE_BYOK
        return _BILLING_SOURCE_HOSTED if settings.deploy_mode == "hosted" else _BILLING_SOURCE_SELFHOST

    if normalized_hint == _BILLING_SOURCE_SELFHOST:
        return _BILLING_SOURCE_SELFHOST

    if settings.deploy_mode == "hosted":
        return _BILLING_SOURCE_BYOK if using_request_override else _BILLING_SOURCE_HOSTED
    return _BILLING_SOURCE_SELFHOST


def _record_usage(
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    endpoint: str = "",
    node_name: str | None = None,
    user_id: int | None = None,
    billing_source: str = _BILLING_SOURCE_SELFHOST,
) -> None:
    """Persist token usage to DB. Non-blocking — failures are logged, never raised."""
    if os.getenv("DISABLE_TOKEN_USAGE_RECORDING", "").lower() in {"1", "true", "yes", "on"}:
        return

    try:
        from app.database import SessionLocal
        from app.models import TokenUsage

        total = prompt_tokens + completion_tokens
        record = TokenUsage(
            user_id=user_id,
            model=model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total,
            cost_estimate=_estimate_cost(model, prompt_tokens, completion_tokens),
            billing_source=billing_source,
            endpoint=endpoint,
            node_name=node_name,
        )
        db = SessionLocal()
        try:
            db.add(record)
            db.commit()
        finally:
            db.close()
    except Exception:
        logger.warning("Failed to record token usage", exc_info=True)


def _normalize_base_url(base_url: str) -> str:
    base_url = (base_url or "").rstrip("/")
    for suffix in ("/chat/completions", "/responses"):
        if base_url.endswith(suffix):
            base_url = base_url[: -len(suffix)]
    return base_url.rstrip("/")


def _stream_options_unsupported(exc: Exception) -> bool:
    if isinstance(exc, TypeError) and "stream_options" in str(exc):
        return True

    status_code = getattr(exc, "status_code", None)
    if status_code not in {None, 400, 422}:
        return False

    message = str(exc).lower()
    if "stream_options" not in message and "include_usage" not in message:
        return False

    return any(
        hint in message
        for hint in (
            "unknown",
            "unrecognized",
            "unexpected",
            "extra",
            "not permitted",
            "invalid",
            "unsupported",
            "not supported",
        )
    )


def _tool_call_unsupported(exc: Exception) -> bool:
    status_code = getattr(exc, "status_code", None)
    if status_code not in {None, 400, 422}:
        return False

    message = str(exc).lower()
    if "tool" not in message and "function" not in message:
        return False

    return any(
        hint in message
        for hint in (
            "unknown",
            "unrecognized",
            "unexpected",
            "not permitted",
            "invalid",
            "unsupported",
            "not supported",
            "does not support",
        )
    )


def _responses_unsupported(exc: Exception) -> bool:
    status_code = getattr(exc, "status_code", None)
    if status_code not in {None, 400, 404, 405, 422}:
        return False
    message = str(exc).lower()
    return any(
        hint in message
        for hint in (
            "/v1/responses",
            "unsupported response",
            "unsupported responses",
            "responses is not supported",
            "unknown url",
            "not found",
            "404",
            "legacy protocol required",
        )
    )


def _extract_usage_pair(usage: Any) -> tuple[int, int]:
    if usage is None:
        return 0, 0
    prompt_tokens = getattr(usage, "prompt_tokens", None)
    completion_tokens = getattr(usage, "completion_tokens", None)
    if prompt_tokens is not None or completion_tokens is not None:
        return int(prompt_tokens or 0), int(completion_tokens or 0)
    return int(getattr(usage, "input_tokens", 0) or 0), int(getattr(usage, "output_tokens", 0) or 0)


def _response_finish_reason(response: Any) -> str | None:
    incomplete = getattr(response, "incomplete_details", None)
    if incomplete is None:
        return None
    reason = getattr(incomplete, "reason", None)
    if reason:
        return str(reason)
    return "incomplete"


def _extract_response_text(response: Any) -> str:
    output_text = getattr(response, "output_text", None)
    if output_text:
        return output_text

    parts: list[str] = []
    for item in getattr(response, "output", []) or []:
        if getattr(item, "type", None) != "message":
            continue
        for content in getattr(item, "content", []) or []:
            text = getattr(content, "text", None)
            if text:
                parts.append(text)
    return "".join(parts)


def _extract_response_tool_calls(response: Any) -> list[ToolCall]:
    tool_calls: list[ToolCall] = []
    for item in getattr(response, "output", []) or []:
        if getattr(item, "type", None) == "function_call":
            tool_calls.append(
                ToolCall(
                    id=getattr(item, "call_id", None) or getattr(item, "id", ""),
                    name=getattr(item, "name", ""),
                    arguments=getattr(item, "arguments", "") or "{}",
                )
            )
    return tool_calls


class AIClient:
    @property
    def settings(self):
        return get_settings()

    def _get_config(self, role: AgentRole = "default") -> dict:
        return {
            "base_url": _normalize_base_url(self.settings.openai_base_url),
            "api_key": self.settings.openai_api_key,
            "model": self.settings.openai_model,
        }

    def _resolve_config(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        model: str | None = None,
    ) -> dict:
        if base_url and api_key and model:
            return {"base_url": _normalize_base_url(base_url), "api_key": api_key, "model": model}
        return self._get_config()

    async def _responses_generate(
        self,
        client: AsyncOpenAI,
        *,
        model: str,
        prompt: str,
        system_prompt: str,
        max_tokens: int,
        temperature: float,
    ):
        return await client.responses.create(
            model=model,
            instructions=system_prompt,
            input=prompt,
            max_output_tokens=max_tokens,
            temperature=temperature,
        )

    async def _responses_generate_stream(
        self,
        client: AsyncOpenAI,
        *,
        model: str,
        prompt: str,
        system_prompt: str,
        max_tokens: int,
        temperature: float,
    ):
        return await client.responses.create(
            model=model,
            instructions=system_prompt,
            input=prompt,
            max_output_tokens=max_tokens,
            temperature=temperature,
            stream=True,
        )

    async def generate(
        self,
        prompt: str,
        system_prompt: str = "You are a professional web novel writer.",
        max_tokens: int = 2000,
        temperature: float = 0.8,
        role: AgentRole = "default",
        base_url: str | None = None,
        api_key: str | None = None,
        model: str | None = None,
        billing_source_hint: str | None = None,
        user_id: int | None = None,
    ) -> str:
        usage_billing_source = _resolve_billing_source(
            billing_source_hint,
            using_request_override=bool(base_url and api_key and model),
        )
        ensure_ai_available_fresh_session(billing_source=usage_billing_source)
        config = self._resolve_config(base_url, api_key, model)
        client = AsyncOpenAI(base_url=config["base_url"], api_key=config["api_key"])

        try:
            response = await self._responses_generate(
                client,
                model=config["model"],
                prompt=prompt,
                system_prompt=system_prompt,
                max_tokens=max_tokens,
                temperature=temperature,
            )
            prompt_tokens, completion_tokens = _extract_usage_pair(getattr(response, "usage", None))
            if prompt_tokens or completion_tokens:
                _record_usage(
                    config["model"],
                    prompt_tokens,
                    completion_tokens,
                    node_name=role,
                    user_id=user_id,
                    billing_source=usage_billing_source,
                )
            finish_reason = _response_finish_reason(response)
            if finish_reason == "max_output_tokens":
                logger.warning(
                    "generate truncated (max_tokens=%s, finish_reason=%s)",
                    max_tokens,
                    finish_reason,
                    extra={"base_url": config["base_url"], "model": config["model"]},
                )
            return _extract_response_text(response)
        except Exception as exc:
            if not _responses_unsupported(exc):
                raise

        response = await client.chat.completions.create(
            model=config["model"],
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            max_tokens=max_tokens,
            temperature=temperature,
        )
        if response.usage:
            _record_usage(
                config["model"],
                response.usage.prompt_tokens,
                response.usage.completion_tokens,
                node_name=role,
                user_id=user_id,
                billing_source=usage_billing_source,
            )
        finish_reason = getattr(response.choices[0], "finish_reason", None)
        if finish_reason == "length":
            logger.warning(
                "generate truncated (max_tokens=%s, finish_reason=%s)",
                max_tokens,
                finish_reason,
                extra={"base_url": config["base_url"], "model": config["model"]},
            )
        return response.choices[0].message.content or ""

    async def generate_stream(
        self,
        prompt: str,
        system_prompt: str = "You are a professional web novel writer.",
        max_tokens: int = 2000,
        temperature: float = 0.8,
        role: AgentRole = "default",
        base_url: str | None = None,
        api_key: str | None = None,
        model: str | None = None,
        billing_source_hint: str | None = None,
        user_id: int | None = None,
    ):
        usage_billing_source = _resolve_billing_source(
            billing_source_hint,
            using_request_override=bool(base_url and api_key and model),
        )
        ensure_ai_available_fresh_session(billing_source=usage_billing_source)
        config = self._resolve_config(base_url, api_key, model)
        client = AsyncOpenAI(base_url=config["base_url"], api_key=config["api_key"])

        try:
            stream = await self._responses_generate_stream(
                client,
                model=config["model"],
                prompt=prompt,
                system_prompt=system_prompt,
                max_tokens=max_tokens,
                temperature=temperature,
            )
            prompt_tokens = 0
            completion_tokens = 0
            finish_reason: str | None = None
            async for event in stream:
                event_type = getattr(event, "type", None)
                if event_type == "response.output_text.delta":
                    delta = getattr(event, "delta", None)
                    if delta:
                        yield delta
                elif event_type == "response.completed":
                    response = getattr(event, "response", None)
                    prompt_tokens, completion_tokens = _extract_usage_pair(getattr(response, "usage", None))
                    finish_reason = _response_finish_reason(response)
            if prompt_tokens or completion_tokens:
                _record_usage(
                    config["model"],
                    prompt_tokens,
                    completion_tokens,
                    node_name=role,
                    user_id=user_id,
                    billing_source=usage_billing_source,
                )
            if finish_reason == "max_output_tokens":
                logger.warning(
                    "generate_stream truncated (max_tokens=%s, finish_reason=%s)",
                    max_tokens,
                    finish_reason,
                    extra={"base_url": config["base_url"], "model": config["model"]},
                )
            return
        except Exception as exc:
            if not _responses_unsupported(exc):
                raise

        request_kwargs = {
            "model": config["model"],
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": True,
        }
        try:
            stream = await client.chat.completions.create(**request_kwargs, stream_options={"include_usage": True})
        except Exception as exc:
            if not _stream_options_unsupported(exc):
                raise
            logger.warning(
                "Streaming include_usage unsupported; retrying without stream_options",
                exc_info=True,
                extra={"base_url": config["base_url"], "model": config["model"]},
            )
            stream = await client.chat.completions.create(**request_kwargs)

        prompt_tokens: int | None = None
        completion_tokens: int | None = None
        finish_reason: str | None = None
        async for chunk in stream:
            usage = getattr(chunk, "usage", None)
            if usage:
                try:
                    prompt_tokens = int(usage.prompt_tokens)
                    completion_tokens = int(usage.completion_tokens)
                except Exception:
                    pass
            if chunk.choices:
                finish_reason = getattr(chunk.choices[0], "finish_reason", None) or finish_reason
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
        if prompt_tokens is not None and completion_tokens is not None:
            _record_usage(
                config["model"],
                prompt_tokens,
                completion_tokens,
                node_name=role,
                user_id=user_id,
                billing_source=usage_billing_source,
            )
        if finish_reason == "length":
            logger.warning(
                "generate_stream truncated (max_tokens=%s, finish_reason=%s)",
                max_tokens,
                finish_reason,
                extra={"base_url": config["base_url"], "model": config["model"]},
            )

    async def generate_with_tools(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        max_tokens: int = 4000,
        temperature: float = 0.4,
        role: AgentRole = "default",
        base_url: str | None = None,
        api_key: str | None = None,
        model: str | None = None,
        billing_source_hint: str | None = None,
        user_id: int | None = None,
        tool_choice: str | None = None,
    ) -> ToolLLMResponse:
        usage_billing_source = _resolve_billing_source(
            billing_source_hint,
            using_request_override=bool(base_url and api_key and model),
        )
        ensure_ai_available_fresh_session(billing_source=usage_billing_source)
        config = self._resolve_config(base_url, api_key, model)
        client = AsyncOpenAI(base_url=config["base_url"], api_key=config["api_key"])

        try:
            response = await client.responses.create(
                model=config["model"],
                input=messages,
                tools=tools or None,
                tool_choice=tool_choice or "auto",
                max_output_tokens=max_tokens,
                temperature=temperature,
            )
            prompt_tokens, completion_tokens = _extract_usage_pair(getattr(response, "usage", None))
            if prompt_tokens or completion_tokens:
                _record_usage(
                    config["model"],
                    prompt_tokens,
                    completion_tokens,
                    node_name=role,
                    user_id=user_id,
                    billing_source=usage_billing_source,
                )
            return ToolLLMResponse(
                content=_extract_response_text(response),
                tool_calls=_extract_response_tool_calls(response),
                finish_reason=_response_finish_reason(response),
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
            )
        except Exception as exc:
            if _tool_call_unsupported(exc):
                raise ToolCallUnsupportedError(str(exc)) from exc
            if not _responses_unsupported(exc):
                raise

        request_kwargs: dict[str, Any] = {
            "model": config["model"],
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if tools:
            request_kwargs["tools"] = tools
        if tool_choice is not None:
            request_kwargs["tool_choice"] = tool_choice

        try:
            response = await client.chat.completions.create(**request_kwargs)
        except Exception as exc:
            if _tool_call_unsupported(exc):
                raise ToolCallUnsupportedError(str(exc)) from exc
            raise

        if response.usage:
            _record_usage(
                config["model"],
                response.usage.prompt_tokens,
                response.usage.completion_tokens,
                node_name=role,
                user_id=user_id,
                billing_source=usage_billing_source,
            )

        choice = response.choices[0] if response.choices else None
        content = choice.message.content if choice else None
        finish_reason = choice.finish_reason if choice else None

        tool_calls: list[ToolCall] = []
        if choice and choice.message.tool_calls:
            for tc in choice.message.tool_calls:
                tool_calls.append(
                    ToolCall(
                        id=tc.id,
                        name=tc.function.name,
                        arguments=tc.function.arguments,
                    )
                )

        return ToolLLMResponse(
            content=content,
            tool_calls=tool_calls,
            finish_reason=finish_reason,
            prompt_tokens=response.usage.prompt_tokens if response.usage else 0,
            completion_tokens=response.usage.completion_tokens if response.usage else 0,
        )

    async def generate_structured(
        self,
        prompt: str,
        response_model: Type[T],
        system_prompt: str = "You are a professional web novel writer.",
        max_tokens: int = 2000,
        temperature: float = 0.7,
        role: AgentRole = "default",
        max_retries: int = 3,
        base_url: str | None = None,
        api_key: str | None = None,
        model: str | None = None,
        billing_source_hint: str | None = None,
        user_id: int | None = None,
    ) -> T:
        usage_billing_source = _resolve_billing_source(
            billing_source_hint,
            using_request_override=bool(base_url and api_key and model),
        )
        ensure_ai_available_fresh_session(billing_source=usage_billing_source)
        config = self._resolve_config(base_url, api_key, model)
        client = AsyncOpenAI(base_url=config["base_url"], api_key=config["api_key"])

        schema_json = json.dumps(response_model.model_json_schema(), ensure_ascii=False)
        structured_system = (
            f"{system_prompt}\n\n"
            f"You MUST respond with valid JSON matching this schema:\n{schema_json}\n"
            "Return JSON only. No markdown fences."
        )

        last_request_error: Exception | None = None
        last_parse_error: Exception | None = None
        saw_response = False

        for attempt in range(max_retries):
            try:
                response = await client.responses.create(
                    model=config["model"],
                    instructions=structured_system,
                    input=prompt,
                    max_output_tokens=max_tokens,
                    temperature=temperature,
                )
                saw_response = True
                prompt_tokens, completion_tokens = _extract_usage_pair(getattr(response, "usage", None))
                if prompt_tokens or completion_tokens:
                    _record_usage(
                        config["model"],
                        prompt_tokens,
                        completion_tokens,
                        node_name=role,
                        user_id=user_id,
                        billing_source=usage_billing_source,
                    )
                raw = _extract_response_text(response) or ""
                finish_reason = _response_finish_reason(response)
                response_id = getattr(response, "id", None)
                if finish_reason == "max_output_tokens":
                    logger.warning(
                        "generate_structured truncated (max_tokens=%s, finish_reason=%s, content_len=%s, response_id=%s)",
                        max_tokens,
                        finish_reason,
                        len(raw),
                        response_id,
                        extra={"base_url": config["base_url"], "model": config["model"]},
                    )
                    raise StructuredOutputParseError(
                        max_retries=1,
                        last_error=ValueError(
                            f"LLM response truncated (finish_reason=max_output_tokens, max_tokens={max_tokens}). Increase max_tokens or reduce input."
                        ),
                    )
                return response_model.model_validate_json(raw)
            except StructuredOutputParseError:
                raise
            except Exception as exc:
                if not _responses_unsupported(exc):
                    last_request_error = exc
                    logger.warning(
                        "generate_structured request/parse failed (attempt %s/%s)",
                        attempt + 1,
                        max_retries,
                        exc_info=True,
                        extra={"base_url": config["base_url"], "model": config["model"]},
                    )
                    try:
                        response_model.model_validate_json(_extract_response_text(exc))
                    except Exception:
                        pass
                    continue
                break

        for attempt in range(max_retries):
            try:
                response = await client.chat.completions.create(
                    model=config["model"],
                    messages=[
                        {"role": "system", "content": structured_system},
                        {"role": "user", "content": prompt},
                    ],
                    max_tokens=max_tokens,
                    temperature=temperature,
                    response_format={"type": "json_object"},
                )
            except Exception as e:
                last_request_error = e
                logger.warning(
                    "generate_structured request failed (attempt %s/%s)",
                    attempt + 1,
                    max_retries,
                    exc_info=True,
                    extra={"base_url": config["base_url"], "model": config["model"]},
                )
                continue

            saw_response = True
            if response.usage:
                _record_usage(
                    config["model"],
                    response.usage.prompt_tokens,
                    response.usage.completion_tokens,
                    node_name=role,
                    user_id=user_id,
                    billing_source=usage_billing_source,
                )
            raw = response.choices[0].message.content or ""
            finish_reason = response.choices[0].finish_reason
            response_id = getattr(response, "id", None)

            if finish_reason == "length":
                logger.warning(
                    "generate_structured truncated (max_tokens=%s, finish_reason=%s, content_len=%s, response_id=%s)",
                    max_tokens,
                    finish_reason,
                    len(raw),
                    response_id,
                    extra={"base_url": config["base_url"], "model": config["model"]},
                )
                raise StructuredOutputParseError(
                    max_retries=1,
                    last_error=ValueError(
                        f"LLM response truncated (finish_reason=length, max_tokens={max_tokens}). Increase max_tokens or reduce input."
                    ),
                )

            try:
                return response_model.model_validate_json(raw)
            except Exception as e:
                last_parse_error = e
                logger.warning(
                    "generate_structured parse failed (attempt %s/%s, finish_reason=%s, content_len=%s, response_id=%s)",
                    attempt + 1,
                    max_retries,
                    finish_reason,
                    len(raw),
                    response_id,
                    exc_info=True,
                    extra={"base_url": config["base_url"], "model": config["model"]},
                )
                continue

        if saw_response and last_parse_error is not None:
            raise StructuredOutputParseError(max_retries=max_retries, last_error=last_parse_error) from last_parse_error

        err = last_request_error or last_parse_error
        raise LLMUnavailableError(f"LLM request failed after {max_retries} retries") from err


ai_client = AIClient()


def get_client(role: AgentRole = "default") -> AIClient:
    return ai_client
