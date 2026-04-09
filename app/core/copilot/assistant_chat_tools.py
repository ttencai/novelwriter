# SPDX-FileCopyrightText: 2026 Isaac.X.惟.Yuan
# SPDX-License-Identifier: AGPL-3.0-only

"""Tool surface for the general-purpose assistant chat area."""

from __future__ import annotations

import html
import ipaddress
import json
import logging
import re
import socket
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlparse, unquote
from urllib.request import Request, urlopen

from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.copilot.scope import ScopeSnapshot
from app.core.copilot.workspace import Workspace

logger = logging.getLogger(__name__)

_SEARCH_HTML_ENDPOINT = "https://html.duckduckgo.com/html/"
_SEARCH_INSTANT_ENDPOINT = "https://api.duckduckgo.com/"
_DEFAULT_USER_AGENT = "NovelWriter AssistantChat/1.0 (+https://localhost)"
_MAX_FETCH_BYTES = 512_000
_RESULT_LINK_RE = re.compile(
    r'<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="(?P<href>[^"]+)"[^>]*>(?P<title>.*?)</a>',
    re.IGNORECASE | re.DOTALL,
)
_RESULT_SNIPPET_RE = re.compile(
    r'class="[^"]*result__snippet[^"]*"[^>]*>(?P<snippet>.*?)</',
    re.IGNORECASE | re.DOTALL,
)
_TITLE_RE = re.compile(r"<title[^>]*>(?P<title>.*?)</title>", re.IGNORECASE | re.DOTALL)
_SCRIPT_STYLE_RE = re.compile(r"<(script|style)\b.*?</\1>", re.IGNORECASE | re.DOTALL)
_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")

_TOOL_SCHEMAS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "Search the public web for live information, recent facts, and external references.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query"},
                    "max_results": {
                        "type": "integer",
                        "description": "Maximum number of search results to return (default 5, max 8)",
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "fetch_url",
            "description": "Fetch and read a public web page when a specific result URL needs more detail.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "Public HTTP(S) URL to read"},
                    "max_chars": {
                        "type": "integer",
                        "description": "Maximum characters to return from the page body",
                    },
                },
                "required": ["url"],
            },
        },
    },
]


def _localized_text(interaction_locale: str, zh: str, en: str) -> str:
    return en if interaction_locale == "en" else zh


def _error_payload(interaction_locale: str, message: str) -> str:
    return json.dumps({"error": message}, ensure_ascii=False)


def _validate_public_http_url(url: str) -> str:
    parsed = urlparse((url or "").strip())
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("Only public HTTP(S) URLs are allowed")
    if not parsed.hostname:
        raise ValueError("URL must include a hostname")

    try:
        infos = socket.getaddrinfo(parsed.hostname, parsed.port, socket.AF_UNSPEC, socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise ValueError(f"Cannot resolve hostname: {parsed.hostname}") from exc

    for family, _, _, _, sockaddr in infos:
        if family not in {socket.AF_INET, socket.AF_INET6}:
            continue
        ip = ipaddress.ip_address(sockaddr[0])
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
        ):
            raise ValueError(f"Blocked non-public address: {ip}")

    return url


def _read_text_url(
    url: str,
    *,
    timeout_seconds: int,
    validate_public: bool,
) -> tuple[str, str]:
    if validate_public:
        _validate_public_http_url(url)

    request = Request(url, headers={"User-Agent": _DEFAULT_USER_AGENT})
    with urlopen(request, timeout=timeout_seconds) as response:
        content_type = response.headers.get_content_type() or "text/plain"
        charset = response.headers.get_content_charset() or "utf-8"
        raw = response.read(_MAX_FETCH_BYTES + 1)
        if len(raw) > _MAX_FETCH_BYTES:
            raw = raw[:_MAX_FETCH_BYTES]
        return raw.decode(charset, errors="replace"), content_type


def _clean_text(raw: str) -> str:
    text = html.unescape(raw or "")
    text = _SCRIPT_STYLE_RE.sub(" ", text)
    text = _TAG_RE.sub(" ", text)
    return _WS_RE.sub(" ", text).strip()


def _extract_title(raw_html: str) -> str:
    match = _TITLE_RE.search(raw_html or "")
    if not match:
        return ""
    return _clean_text(match.group("title"))


def _normalize_result_url(raw_url: str) -> str:
    if not raw_url:
        return ""
    normalized = html.unescape(raw_url).strip()
    if normalized.startswith("//"):
        normalized = f"https:{normalized}"
    parsed = urlparse(normalized)
    if parsed.netloc.endswith("duckduckgo.com") and parsed.path.startswith("/l/"):
        uddg = parse_qs(parsed.query).get("uddg")
        if uddg:
            return unquote(uddg[0])
    return normalized


def _parse_duckduckgo_results(raw_html: str, *, limit: int) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    seen_urls: set[str] = set()

    for match in _RESULT_LINK_RE.finditer(raw_html or ""):
        url = _normalize_result_url(match.group("href"))
        if not url or url in seen_urls:
            continue
        seen_urls.add(url)

        title = _clean_text(match.group("title"))
        tail = raw_html[match.end(): match.end() + 1500]
        snippet_match = _RESULT_SNIPPET_RE.search(tail)
        snippet = _clean_text(snippet_match.group("snippet")) if snippet_match else ""

        results.append(
            {
                "title": title or url,
                "url": url,
                "snippet": snippet,
            }
        )
        if len(results) >= limit:
            break

    return results


def _extract_instant_answer(payload: dict[str, Any]) -> str:
    for key in ("Answer", "AbstractText"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()

    related_topics = payload.get("RelatedTopics")
    if not isinstance(related_topics, list):
        return ""

    for item in related_topics:
        if not isinstance(item, dict):
            continue
        text = item.get("Text")
        if isinstance(text, str) and text.strip():
            return text.strip()
        nested = item.get("Topics")
        if isinstance(nested, list):
            for nested_item in nested:
                if not isinstance(nested_item, dict):
                    continue
                text = nested_item.get("Text")
                if isinstance(text, str) and text.strip():
                    return text.strip()
    return ""


def _tool_web_search(query: str, max_results: int | None, interaction_locale: str) -> str:
    settings = get_settings()
    if not settings.assistant_chat_web_search_enabled:
        return _error_payload(
            interaction_locale,
            _localized_text(interaction_locale, "当前 AI 对话区未启用联网搜索。", "Web search is disabled for assistant chat."),
        )

    normalized_query = (query or "").strip()
    if not normalized_query:
        return _error_payload(
            interaction_locale,
            _localized_text(interaction_locale, "搜索词不能为空。", "Search query cannot be empty."),
        )

    result_limit = max_results or settings.assistant_chat_search_max_results
    result_limit = max(1, min(int(result_limit), 8))
    timeout_seconds = max(1, int(settings.assistant_chat_search_timeout_seconds))

    try:
        instant_query = urlencode(
            {"q": normalized_query, "format": "json", "no_html": "1", "skip_disambig": "1"},
        )
        instant_text, _ = _read_text_url(
            f"{_SEARCH_INSTANT_ENDPOINT}?{instant_query}",
            timeout_seconds=timeout_seconds,
            validate_public=False,
        )
        instant_payload = json.loads(instant_text or "{}")
        instant_answer = _extract_instant_answer(instant_payload) if isinstance(instant_payload, dict) else ""

        search_query = urlencode({"q": normalized_query})
        search_html, _ = _read_text_url(
            f"{_SEARCH_HTML_ENDPOINT}?{search_query}",
            timeout_seconds=timeout_seconds,
            validate_public=False,
        )
        results = _parse_duckduckgo_results(search_html, limit=result_limit)
    except (HTTPError, URLError, OSError, ValueError, json.JSONDecodeError) as exc:
        logger.warning("assistant chat web_search failed", exc_info=True)
        return _error_payload(
            interaction_locale,
            _localized_text(
                interaction_locale,
                f"联网搜索失败：{type(exc).__name__}",
                f"Web search failed: {type(exc).__name__}",
            ),
        )

    return json.dumps(
        {
            "query": normalized_query,
            "instant_answer": instant_answer,
            "results": results,
            "result_count": len(results),
        },
        ensure_ascii=False,
    )


def _tool_fetch_url(url: str, max_chars: int | None, interaction_locale: str) -> str:
    settings = get_settings()
    if not settings.assistant_chat_fetch_url_enabled:
        return _error_payload(
            interaction_locale,
            _localized_text(interaction_locale, "当前 AI 对话区未启用网页读取。", "URL fetching is disabled for assistant chat."),
        )

    normalized_url = (url or "").strip()
    if not normalized_url:
        return _error_payload(
            interaction_locale,
            _localized_text(interaction_locale, "URL 不能为空。", "URL cannot be empty."),
        )

    char_limit = max_chars or settings.assistant_chat_fetch_max_chars
    char_limit = max(500, min(int(char_limit), 20_000))
    timeout_seconds = max(1, int(settings.assistant_chat_search_timeout_seconds))

    try:
        raw_text, content_type = _read_text_url(
            normalized_url,
            timeout_seconds=timeout_seconds,
            validate_public=True,
        )
    except (HTTPError, URLError, OSError, ValueError) as exc:
        logger.warning("assistant chat fetch_url failed", exc_info=True)
        return _error_payload(
            interaction_locale,
            _localized_text(
                interaction_locale,
                f"网页读取失败：{type(exc).__name__}",
                f"URL fetch failed: {type(exc).__name__}",
            ),
        )

    if content_type not in {"text/html", "text/plain", "application/xhtml+xml"}:
        return _error_payload(
            interaction_locale,
            _localized_text(
                interaction_locale,
                f"暂不支持读取该内容类型：{content_type}",
                f"Unsupported content type: {content_type}",
            ),
        )

    page_title = _extract_title(raw_text) if content_type != "text/plain" else ""
    content = _clean_text(raw_text)[:char_limit]
    return json.dumps(
        {
            "url": normalized_url,
            "title": page_title,
            "content_type": content_type,
            "content": content,
        },
        ensure_ascii=False,
    )


def dispatch_tool(
    tool_name: str,
    tool_args: dict[str, Any],
    _db: Session,
    _novel_id: int,
    _snapshot: ScopeSnapshot,
    _workspace: Workspace,
    interaction_locale: str = "zh",
) -> str:
    if tool_name == "web_search":
        return _tool_web_search(
            str(tool_args.get("query", "")),
            tool_args.get("max_results"),
            interaction_locale,
        )
    if tool_name == "fetch_url":
        return _tool_fetch_url(
            str(tool_args.get("url", "")),
            tool_args.get("max_chars"),
            interaction_locale,
        )
    return _error_payload(
        interaction_locale,
        _localized_text(
            interaction_locale,
            f"未知工具：{tool_name}",
            f"Unknown tool: {tool_name}",
        ),
    )


def tool_load_scope_snapshot(snapshot: ScopeSnapshot) -> str:
    return json.dumps(
        {
            "profile": snapshot.profile,
            "focus_variant": snapshot.focus_variant,
            "focus_entity_id": snapshot.focus_entity_id,
        },
        ensure_ascii=False,
    )
