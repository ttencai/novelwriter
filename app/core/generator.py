# SPDX-FileCopyrightText: 2026 Isaac.X.Ω.Yuan
# SPDX-License-Identifier: AGPL-3.0-only

"""
Generator utilities for continuation and outline generation.

This module provides:
1. Lorebook context injection
2. Multi-model routing support
"""

from typing import AsyncGenerator, List, Literal
import asyncio
import math
import re
from sqlalchemy.orm import Session
import logging

from app.models import Novel, Chapter, Outline, Continuation
from app.core.ai_client import ai_client
from app.core.continuation_text import format_chapter_heading_for_prompt, format_next_chapter_reference
from app.core.lore_manager import LoreManager
from app.core.cache import cache_manager
from app.core.text import PromptKey, get_prompt
from app.core.text.snippets import SnippetKey, get_snippet
from app.config import get_settings, resolve_context_chapters
from app.core.chapter_numbering import get_next_missing_chapter_number
from app.language import resolve_prompt_locale
from app.language_policy import get_language_policy

logger = logging.getLogger(__name__)

GenerationMode = Literal["continue", "polish"]


_THINK_BLOCK_RE = re.compile(r"<think>.*?</think>", re.IGNORECASE | re.DOTALL)


def _sanitize_continuation_content(text: str) -> str:
    """Strip provider thinking/analysis blocks from creative-writing output.

    Some reasoning models emit chain-of-thought in <think>...</think> blocks.
    We never want to persist or display those in NovWr.
    """
    if not text:
        return ""

    cleaned = _THINK_BLOCK_RE.sub("", text)
    # A few gateways prefix with "Final:" when using reasoning models.
    cleaned = re.sub(r"^\s*(final|answer)\s*:\s*", "", cleaned, flags=re.IGNORECASE)
    return cleaned.strip()


def _compute_generation_target_chars(target_chars: int | None, overrun_ratio: float) -> int | None:
    if not target_chars:
        return None
    return max(target_chars, math.ceil(target_chars * max(1.0, overrun_ratio)))


def _build_length_guidance(
    target_chars: int | None,
    generation_target_chars: int | None,
    min_ratio: float,
    *,
    prompt_locale: str | None = None,
) -> str:
    if target_chars:
        min_chars = max(1, math.floor(target_chars * min_ratio))
        prompt_target = generation_target_chars or target_chars
        natural_ceiling = max(prompt_target, math.ceil(target_chars * 1.1))
        return get_snippet(SnippetKey.LENGTH_GUIDANCE_TARGET, prompt_locale).format(
            target=prompt_target, min_chars=min_chars, ceiling=natural_ceiling,
        )
    return get_snippet(SnippetKey.LENGTH_GUIDANCE_DEFAULT, prompt_locale)


def _normalize_generation_mode(value: str | None) -> GenerationMode:
    return "polish" if value == "polish" else "continue"


def _build_system_prompt(
    length_guidance: str,
    *,
    prompt_locale: str,
    generation_mode: GenerationMode = "continue",
) -> str:
    length_header = get_snippet(SnippetKey.SYSTEM_LENGTH_HEADER, prompt_locale)
    length_rules = get_snippet(SnippetKey.SYSTEM_LENGTH_RULES, prompt_locale)
    if generation_mode == "polish":
        base_prompt = get_prompt(PromptKey.DRAFT_POLISH_SYSTEM, locale=prompt_locale)
        if not length_guidance:
            return base_prompt
        return (
            f"{base_prompt}\n\n"
            f"{length_header}\n"
            f"- {length_guidance}\n"
            f"{length_rules}"
        )

    return (
        f"{get_prompt(PromptKey.SYSTEM, locale=prompt_locale)}\n\n"
        f"{length_header}\n"
        f"- {length_guidance}\n"
        f"{length_rules}"
    )


def _compute_max_tokens(
    target_chars: int | None,
    max_tokens: int | None,
    default_tokens: int,
    chars_to_tokens_ratio: float,
    token_buffer_ratio: float,
    cap: int = 16000,
) -> int:
    if target_chars:
        estimated = math.ceil(target_chars * chars_to_tokens_ratio)
        estimated = math.ceil(estimated * (1 + token_buffer_ratio))
        return min(cap, max(100, estimated))
    if max_tokens is not None:
        return max_tokens
    return default_tokens


def _trim_to_target_chars(text: str, target_chars: int, *, language: str | None = None) -> str:
    policy = get_language_policy(language, sample_text=text)
    return policy.trim_to_sentence_boundary(text, target_chars)


async def generate_outline(
    db: Session,
    novel_id: int,
    chapter_start: int,
    chapter_end: int,
) -> Outline:
    """Generate outline for specified chapter range."""
    chapters = (
        db.query(Chapter)
        .filter(
            Chapter.novel_id == novel_id,
            Chapter.chapter_number >= chapter_start,
            Chapter.chapter_number <= chapter_end,
        )
        .order_by(Chapter.chapter_number)
        .all()
    )

    if not chapters:
        raise ValueError(
            f"No chapters found for novel {novel_id} in range {chapter_start}-{chapter_end}. "
            f"Ensure the novel has been uploaded and chapters exist in this range."
        )

    novel = db.query(Novel).filter(Novel.id == novel_id).first()
    if not novel:
        raise ValueError(
            f"Novel {novel_id} not found. Please upload a novel first using POST /api/novels/upload."
        )
    prompt_locale = resolve_prompt_locale(novel_language=getattr(novel, "language", None))

    content = "\n\n".join(
        format_chapter_heading_for_prompt(
            ch.chapter_number,
            ch.title,
            locale=prompt_locale,
            source_chapter_label=getattr(ch, "source_chapter_label", None),
        ) + f"\n{ch.content[:1000]}..."
        for ch in chapters
    )

    prompt = get_prompt(PromptKey.OUTLINE, locale=prompt_locale).format(
        start=chapter_start,
        end=chapter_end,
        content=content,
    )

    outline_text = await ai_client.generate(
        prompt=prompt,
        system_prompt=get_prompt(PromptKey.SYSTEM, locale=prompt_locale),
        max_tokens=1000,
    )

    outline = Outline(
        novel_id=novel_id,
        chapter_start=chapter_start,
        chapter_end=chapter_end,
        outline_text=outline_text,
    )
    db.add(outline)
    db.commit()
    db.refresh(outline)

    return outline


async def _build_continuation_prompt(
    db: Session,
    novel_id: int,
    use_core_memory: bool = True,
    use_lorebook: bool = True,
    prompt: str | None = None,
    max_tokens: int | None = None,
    target_chars: int | None = None,
    context_chapters: int | None = None,
    world_context: str | None = None,
    narrative_constraints: str | None = None,
    world_debug_summary: dict | None = None,
    generation_mode: str = "continue",
) -> tuple[str, int, dict]:
    """Build the continuation prompt and return (prompt, effective_max_tokens, build_info)."""
    settings = get_settings()
    normalized_mode = _normalize_generation_mode(generation_mode)
    polish_budget_chars = max(1000, len((prompt or "").strip())) if normalized_mode == "polish" else None
    generation_target_chars = _compute_generation_target_chars(
        target_chars,
        settings.continuation_prompt_target_overrun_ratio,
    )

    effective_max_tokens = _compute_max_tokens(
        target_chars=target_chars or polish_budget_chars,
        max_tokens=max_tokens,
        default_tokens=settings.default_continuation_tokens,
        chars_to_tokens_ratio=settings.continuation_chars_to_tokens_ratio,
        token_buffer_ratio=settings.continuation_token_buffer_ratio,
        cap=settings.max_continuation_tokens,
    )

    novel = db.query(Novel).filter(Novel.id == novel_id).first()
    if not novel:
        raise ValueError(
            f"Novel {novel_id} not found. Please upload a novel first using POST /api/novels/upload."
        )
    prompt_locale = resolve_prompt_locale(novel_language=getattr(novel, "language", None))

    length_guidance = ""
    if normalized_mode == "continue" or target_chars:
        length_guidance = _build_length_guidance(
            target_chars,
            generation_target_chars,
            settings.continuation_min_target_ratio,
            prompt_locale=prompt_locale,
        )

    effective_context_chapters = resolve_context_chapters(
        context_chapters,
        default=settings.max_context_chapters,
    )
    recent_chapters = (
        db.query(Chapter)
        .filter(Chapter.novel_id == novel_id)
        .order_by(Chapter.chapter_number.desc())
        .limit(effective_context_chapters)
        .all()
    )
    recent_chapters = list(reversed(recent_chapters))

    if not recent_chapters:
        raise ValueError(
            f"Novel {novel_id} has no chapters. Cannot generate continuation without existing content."
        )

    # Draft polishing must not inherit unrelated future plot beats from stored outlines.
    outlines = []
    if normalized_mode == "continue":
        outlines = (
            db.query(Outline)
            .filter(Outline.novel_id == novel_id)
            .order_by(Outline.chapter_end.desc())
            .limit(2)
            .all()
        )

    recent_content = "\n\n".join(
        format_chapter_heading_for_prompt(
            ch.chapter_number,
            ch.title,
            locale=prompt_locale,
            source_chapter_label=getattr(ch, "source_chapter_label", None),
        ) + f"\n{ch.content}"
        for ch in recent_chapters
    )

    outline_heading_fmt = get_snippet(SnippetKey.OUTLINE_HEADING_FMT, prompt_locale)
    outline_content = "\n\n".join(
        outline_heading_fmt.format(start=o.chapter_start, end=o.chapter_end) + f"\n{o.outline_text}"
        for o in outlines
    ) if outlines else get_snippet(SnippetKey.NO_OUTLINE, prompt_locale)

    next_chapter = get_next_missing_chapter_number(db, novel_id)
    latest_recent_chapter = recent_chapters[-1]
    next_chapter_reference = format_next_chapter_reference(
        next_chapter,
        latest_source_chapter_label=getattr(latest_recent_chapter, "source_chapter_label", None),
        latest_source_chapter_number=getattr(latest_recent_chapter, "source_chapter_number", None),
        locale=prompt_locale,
    )

    world_context_section = ""
    if use_core_memory and world_context and world_context.strip():
        world_context_section = f"\n<world_knowledge>\n{world_context.strip()}\n</world_knowledge>\n"
        try:
            systems = (world_debug_summary or {}).get("injected_systems") or []
            entities = (world_debug_summary or {}).get("injected_entities") or []
            rels = (world_debug_summary or {}).get("injected_relationships") or []
            logger.info(
                "Injecting WorldModel context for novel %s: %s systems, %s entities, %s relationships",
                novel_id,
                len(systems),
                len(entities),
                len(rels),
            )
        except Exception:
            logger.info("Injecting WorldModel context for novel %s", novel_id)

    lorebook_context = ""
    if use_lorebook:
        try:
            lore_manager = cache_manager.get_lore(novel_id)
            if not lore_manager:
                lore_manager = LoreManager(novel_id)
                lore_manager.build_automaton(db)
                cache_manager.set_lore(novel_id, lore_manager)
            context, matched_entries, total_tokens = lore_manager.get_injection_context(
                recent_content,
                max_tokens=settings.lore_max_total_tokens,
            )
            if context:
                lorebook_context = f"\n<supplementary_lore>\n{context}\n</supplementary_lore>"
                logger.info(
                    f"Injecting Lorebook context for novel {novel_id}: "
                    f"{len(matched_entries)} entries, {total_tokens} tokens"
                )
        except Exception as e:
            logger.warning(f"Failed to get Lorebook context for novel {novel_id}: {e}")

    combined_context = ""
    if world_context_section:
        combined_context += world_context_section
    if lorebook_context:
        combined_context += lorebook_context

    user_instruction = ""
    if normalized_mode == "continue" and prompt and prompt.strip():
        user_instruction = f"\n<user_instruction>\n{prompt.strip()}\n</user_instruction>\n"
        logger.info(f"User instruction provided for novel {novel_id}: {prompt[:50]}...")

    constraints_section = (narrative_constraints or "").strip()

    if normalized_mode == "polish":
        generation_prompt = get_prompt(PromptKey.DRAFT_POLISH, locale=prompt_locale).format(
            title=novel.title,
            next_chapter_reference=next_chapter_reference,
            world_context=combined_context,
            narrative_constraints=f"\n{constraints_section}\n" if constraints_section else "",
            recent_content=recent_content,
            draft=(prompt or "").strip(),
        )
        return generation_prompt, effective_max_tokens, {
            "next_chapter": next_chapter,
            "next_chapter_reference": next_chapter_reference,
            "novel_language": getattr(novel, "language", None),
            "generation_mode": normalized_mode,
            "trim_target_chars": target_chars,
            "system_prompt": _build_system_prompt(
                length_guidance,
                prompt_locale=prompt_locale,
                generation_mode=normalized_mode,
            ),
        }

    generation_prompt = get_prompt(PromptKey.CONTINUATION, locale=prompt_locale).format(
        title=novel.title,
        next_chapter=next_chapter,
        next_chapter_reference=next_chapter_reference,
        outline=outline_content,
        world_context=combined_context,
        narrative_constraints=f"\n{constraints_section}\n" if constraints_section else "",
    )

    if user_instruction:
        generation_prompt += user_instruction

    # Style anchor + recent chapters LAST: autoregressive generation continues
    # the style of the most recently seen text.  Placing the novel prose at the
    # tail of the prompt exploits this inertia so the model's first tokens
    # naturally match the original register.
    style_anchor = get_snippet(SnippetKey.STYLE_ANCHOR, prompt_locale)
    continue_instruction = get_snippet(SnippetKey.CONTINUE_INSTRUCTION, prompt_locale).format(
        n=next_chapter,
        reference=next_chapter_reference,
    )
    generation_prompt += (
        f"\n{style_anchor}\n\n"
        f"<recent_chapters>\n{recent_content}\n</recent_chapters>\n"
        f"{continue_instruction}"
    )

    return generation_prompt, effective_max_tokens, {
        "next_chapter": next_chapter,
        "next_chapter_reference": next_chapter_reference,
        "novel_language": getattr(novel, "language", None),
        "generation_mode": normalized_mode,
        "trim_target_chars": target_chars,
        "system_prompt": _build_system_prompt(
            length_guidance,
            prompt_locale=prompt_locale,
            generation_mode=normalized_mode,
        ),
    }


async def continue_novel(
    db: Session,
    novel_id: int,
    num_versions: int = 1,
    use_core_memory: bool = True,
    use_lorebook: bool = True,
    prompt: str | None = None,
    max_tokens: int | None = None,
    target_chars: int | None = None,
    context_chapters: int | None = None,
    world_context: str | None = None,
    narrative_constraints: str | None = None,
    world_debug_summary: dict | None = None,
    llm_config: dict | None = None,
    temperature: float | None = None,
    user_id: int | None = None,
    generation_mode: str = "continue",
) -> List[Continuation]:
    """
    Generate continuation for a novel.

    Args:
        db: Database session
        novel_id: ID of the novel to continue
        num_versions: Number of continuation versions to generate
        use_lorebook: Whether to inject Lorebook context
        prompt: Optional user instruction for guiding the continuation
        max_tokens: Optional max tokens for generation (defaults to settings.default_continuation_tokens)
        target_chars: Optional target length in characters for the continuation
        context_chapters: Override for settings.max_context_chapters
        world_context: Injected WorldModel context (already visibility-filtered)
        narrative_constraints: Extracted narrative constraints from WorldSystem (injected as dedicated prompt section)
        world_debug_summary: Optional debug summary (used for logging/traceability)
        generation_mode: Continue from context or polish the supplied draft

    Returns:
        List of generated Continuation objects
    """
    generation_prompt, effective_max_tokens, build_info = await _build_continuation_prompt(
        db=db,
        novel_id=novel_id,
        use_core_memory=use_core_memory,
        use_lorebook=use_lorebook,
        prompt=prompt,
        max_tokens=max_tokens,
        target_chars=target_chars,
        context_chapters=context_chapters,
        world_context=world_context,
        narrative_constraints=narrative_constraints,
        world_debug_summary=world_debug_summary,
        generation_mode=generation_mode,
    )
    next_chapter = build_info["next_chapter"]
    novel_language = build_info.get("novel_language")
    system_prompt = build_info["system_prompt"]
    trim_target_chars = build_info.get("trim_target_chars")

    # Generate continuations
    continuations = []
    llm_kwargs = llm_config or {}
    if temperature is not None:
        llm_kwargs["temperature"] = temperature
    for i in range(num_versions):
        logger.info(f"Generating continuation {i+1}/{num_versions} for novel {novel_id}")

        content = await ai_client.generate(
            prompt=generation_prompt,
            system_prompt=system_prompt,
            max_tokens=effective_max_tokens,
            user_id=user_id,
            **llm_kwargs,
        )

        content = _sanitize_continuation_content(content)

        if trim_target_chars:
            content = _trim_to_target_chars(content, trim_target_chars, language=novel_language)

        continuation = Continuation(
            novel_id=novel_id,
            chapter_number=next_chapter,
            content=content,
            prompt_used=generation_prompt,
        )
        db.add(continuation)
        db.commit()
        db.refresh(continuation)
        continuations.append(continuation)

    return continuations


async def continue_novel_stream(
    db: Session,
    novel_id: int,
    num_versions: int = 1,
    use_core_memory: bool = True,
    use_lorebook: bool = True,
    prompt: str | None = None,
    max_tokens: int | None = None,
    target_chars: int | None = None,
    context_chapters: int | None = None,
    world_context: str | None = None,
    narrative_constraints: str | None = None,
    world_debug_summary: dict | None = None,
    llm_config: dict | None = None,
    request_id: str | None = None,
    temperature: float | None = None,
    user_id: int | None = None,
    generation_mode: str = "continue",
) -> AsyncGenerator[dict, None]:
    """Yield NDJSON events for streaming continuation generation."""
    generation_prompt, effective_max_tokens, build_info = await _build_continuation_prompt(
        db=db,
        novel_id=novel_id,
        use_core_memory=use_core_memory,
        use_lorebook=use_lorebook,
        prompt=prompt,
        max_tokens=max_tokens,
        target_chars=target_chars,
        context_chapters=context_chapters,
        world_context=world_context,
        narrative_constraints=narrative_constraints,
        world_debug_summary=world_debug_summary,
        generation_mode=generation_mode,
    )
    next_chapter = build_info["next_chapter"]
    novel_language = build_info.get("novel_language")
    system_prompt = build_info["system_prompt"]
    trim_target_chars = build_info.get("trim_target_chars")
    llm_kwargs = llm_config or {}
    if temperature is not None:
        llm_kwargs["temperature"] = temperature

    def _error_event(*, code: str, message: str, message_key: str | None = None, variant: int | None = None) -> dict:
        event: dict = {"type": "error", "code": code, "message": message}
        if message_key is not None:
            event["message_key"] = message_key
        if variant is not None:
            event["variant"] = int(variant)
        if request_id:
            event["request_id"] = request_id
        return event

    yield {
        "type": "start",
        "variant": 0,
        "total_variants": num_versions,
        "debug": world_debug_summary or None,
    }

    # Stream variant 0
    full_content = ""
    continuation_ids: list[int] = []
    try:
        async for chunk in ai_client.generate_stream(
            prompt=generation_prompt,
            system_prompt=system_prompt,
            max_tokens=effective_max_tokens,
            user_id=user_id,
            **llm_kwargs,
        ):
            full_content += chunk
            yield {"type": "token", "variant": 0, "content": chunk}
    except Exception:
        logger.exception(
            "continue_novel_stream: variant 0 streaming failed (request_id=%s, novel_id=%s)",
            request_id,
            novel_id,
        )
        yield _error_event(code="llm_stream_failed", message="续写生成失败，请重试", message_key="continuation.error.llm_stream_failed", variant=0)
    else:
        full_content = _sanitize_continuation_content(full_content)
        if trim_target_chars:
            full_content = _trim_to_target_chars(full_content, trim_target_chars, language=novel_language)

        continuation = Continuation(
            novel_id=novel_id,
            chapter_number=next_chapter,
            content=full_content,
            prompt_used=generation_prompt,
        )
        db.add(continuation)
        try:
            db.commit()
            db.refresh(continuation)
        except Exception:
            db.rollback()
            try:
                db.expunge(continuation)
            except Exception:
                pass
            logger.exception(
                "continue_novel_stream: variant 0 DB persist failed (request_id=%s, novel_id=%s)",
                request_id,
                novel_id,
            )
            yield _error_event(code="db_persist_failed", message="保存续写结果失败，请重试", message_key="continuation.error.db_persist_failed", variant=0)
        else:
            continuation_ids.append(int(continuation.id))
            # Include final content so the client can reconcile any trimming/normalization.
            yield {
                "type": "variant_done",
                "variant": 0,
                "continuation_id": continuation.id,
                "content": continuation.content,
            }

    # Generate remaining variants in parallel (non-streaming generation, sequential DB writes)
    if num_versions > 1:
        async def _generate_variant_content(variant_idx: int) -> dict:
            try:
                content = await ai_client.generate(
                    prompt=generation_prompt,
                    system_prompt=system_prompt,
                    max_tokens=effective_max_tokens,
                    user_id=user_id,
                    **llm_kwargs,
                )

                content = _sanitize_continuation_content(content)
                if trim_target_chars:
                    content = _trim_to_target_chars(content, trim_target_chars, language=novel_language)
                return {"variant": variant_idx, "ok": True, "content": content}
            except Exception:
                logger.exception(
                    "continue_novel_stream: variant %s generate failed (request_id=%s, novel_id=%s)",
                    variant_idx,
                    request_id,
                    novel_id,
                )
                return {"variant": variant_idx, "ok": False}

        results = await asyncio.gather(
            *[_generate_variant_content(i) for i in range(1, num_versions)]
        )

        for result in results:
            variant_idx = int(result["variant"])
            if not result.get("ok"):
                yield _error_event(code="llm_generate_failed", message="续写生成失败，请重试", message_key="continuation.error.llm_generate_failed", variant=variant_idx)
                continue

            content = str(result["content"])
            c = Continuation(
                novel_id=novel_id,
                chapter_number=next_chapter,
                content=content,
                prompt_used=generation_prompt,
            )
            db.add(c)
            try:
                db.commit()
                db.refresh(c)
            except Exception:
                db.rollback()
                try:
                    db.expunge(c)
                except Exception:
                    pass
                logger.exception(
                    "continue_novel_stream: variant %s DB persist failed (request_id=%s, novel_id=%s)",
                    variant_idx,
                    request_id,
                    novel_id,
                )
                yield _error_event(code="db_persist_failed", message="保存续写结果失败，请重试", message_key="continuation.error.db_persist_failed", variant=variant_idx)
            else:
                continuation_ids.append(int(c.id))
                yield {
                    "type": "variant_done",
                    "variant": variant_idx,
                    "continuation_id": c.id,
                    "content": c.content,
                }

    yield {"type": "done", "continuation_ids": continuation_ids}


async def generate_all_outlines(db: Session, novel_id: int) -> List[Outline]:
    """Generate outlines for entire novel (one per 100 chapters)."""
    settings = get_settings()

    novel = db.query(Novel).filter(Novel.id == novel_id).first()
    if not novel:
        raise ValueError(
            f"Novel {novel_id} not found. Please upload a novel first."
        )

    outlines = []
    chunk_size = settings.outline_chunk_size

    chapter_numbers = [
        n
        for (n,) in (
            db.query(Chapter.chapter_number)
            .filter(Chapter.novel_id == novel_id)
            .order_by(Chapter.chapter_number)
            .all()
        )
        if n is not None
    ]
    if not chapter_numbers:
        return outlines

    for idx in range(0, len(chapter_numbers), chunk_size):
        chunk = chapter_numbers[idx : idx + chunk_size]
        start = chunk[0]
        end = chunk[-1]

        # Check if outline already exists
        existing = (
            db.query(Outline)
            .filter(
                Outline.novel_id == novel_id,
                Outline.chapter_start == start,
                Outline.chapter_end == end,
            )
            .first()
        )

        if existing:
            outlines.append(existing)
        else:
            outline = await generate_outline(db, novel_id, start, end)
            outlines.append(outline)

    return outlines
