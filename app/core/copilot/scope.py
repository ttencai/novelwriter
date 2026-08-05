# SPDX-FileCopyrightText: 2026 Isaac.X.Ω.Yuan
# SPDX-License-Identifier: AGPL-3.0-only

"""Scope loading and backend-sourced evidence helpers for copilot."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any, Literal

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.indexing import (
    WINDOW_INDEX_STATUS_FAILED,
    WINDOW_INDEX_STATUS_FRESH,
    WINDOW_INDEX_STATUS_MISSING,
    WINDOW_INDEX_STATUS_STALE,
    WindowIndexLifecycleSnapshot,
    inspect_window_index_lifecycle,
)
from app.core.copilot.messages import CopilotTextKey, get_copilot_text
from app.models import (
    Chapter,
    Novel,
    WorldEntity,
    WorldEntityAttribute,
    WorldRelationship,
    WorldSystem,
)

logger = logging.getLogger(__name__)

CopilotRuntimeProfile = Literal["focused_research", "draft_governance", "broad_exploration"]
CopilotFocusVariant = Literal["entity", "relationship", "draft", "whole_book"]

MAX_EVIDENCE_ITEMS = 15
MAX_SCOPE_ENTITIES = 80
MAX_SCOPE_RELATIONSHIPS = 60
MAX_SCOPE_SYSTEMS = 30
MAX_CHAPTER_EXCERPT_CHARS = 2000
MAX_EXPLICIT_QUERY_CHAPTERS = 6
MAX_EXPLICIT_CHAPTER_CHARS = 6000
MAX_EXPLICIT_ENTITY_CHAPTERS = 4

_CHAPTER_RANGE_RE = re.compile(
    r"(?:第\s*)?(\d{1,6})\s*(?:章\s*)?(?:-|—|~|～|至|到)\s*(?:第\s*)?(\d{1,6})\s*章",
    re.IGNORECASE,
)
_CHAPTER_NUMBER_RE = re.compile(r"(?:第\s*)?(\d{1,6})\s*章|chapters?\s*(\d{1,6})", re.IGNORECASE)
_WORKSPACE_QUERY_HINTS = (
    "这本书", "本书", "书里", "文中", "正文", "章节", "剧情", "角色", "人物",
    "主角", "女主", "男主", "关系", "设定", "世界模型",
    "chapter", "character", "relationship", "current novel", "the novel",
)


def _scope_text(
    interaction_locale: str,
    text_key: CopilotTextKey,
    **params: object,
) -> str:
    return get_copilot_text(text_key, locale=interaction_locale, **params)


def _append_scope_labeled_line(
    text: str,
    *,
    interaction_locale: str,
    label_key: CopilotTextKey,
    value: str,
) -> str:
    label = _scope_text(interaction_locale, label_key)
    return f"{text}\n{label}: {value}"


@dataclass
class ScopeSnapshot:
    """World-model state loaded by the backend for a copilot scope."""

    novel: Novel
    novel_language: str
    entities: list[WorldEntity]
    entities_by_id: dict[int, WorldEntity]
    relationships: list[WorldRelationship]
    systems: list[WorldSystem]
    attributes_by_entity: dict[int, list[WorldEntityAttribute]]
    draft_entities: list[WorldEntity]
    draft_relationships: list[WorldRelationship]
    draft_systems: list[WorldSystem]
    profile: str = "broad_exploration"
    focus_variant: str = "whole_book"
    focus_entity_id: int | None = None
    window_index_state: WindowIndexLifecycleSnapshot | None = None
    # 完整实体目录只用于重名识别和采纳校验，不会扩大传给模型的工作集。
    entity_catalog: list[WorldEntity] = field(default_factory=list)
    entity_catalog_by_id: dict[int, WorldEntity] = field(default_factory=dict)


@dataclass
class EvidenceItem:
    """A backend-sourced, verifiable evidence item."""

    evidence_id: str
    source_type: str
    source_ref: dict[str, Any]
    title: str
    excerpt: str
    why_relevant: str
    pack_id: str | None = None
    source_refs: list[dict[str, Any]] = field(default_factory=list)
    anchor_terms: list[str] = field(default_factory=list)
    support_count: int | None = None
    preview_excerpt: str | None = None
    expanded: bool = False


def derive_runtime_profile(mode: str, scope: str, context: dict | None) -> CopilotRuntimeProfile:
    """Derive the bounded runtime profile used for isolation and preload policy."""
    if mode == "draft_cleanup":
        return "draft_governance"
    if scope == "whole_book":
        return "broad_exploration"
    return "focused_research"


def derive_focus_variant(mode: str, scope: str, context: dict | None) -> CopilotFocusVariant:
    """Derive the detailed workbench focus within the runtime profile."""
    if mode == "draft_cleanup":
        return "draft"
    if scope == "whole_book":
        return "whole_book"
    if context and context.get("tab") == "relationships":
        return "relationship"
    return "entity"


def _load_attributes_for_entities(
    db: Session,
    entity_ids: list[int],
) -> dict[int, list[WorldEntityAttribute]]:
    if not entity_ids:
        return {}

    attrs = (
        db.query(WorldEntityAttribute)
        .filter(WorldEntityAttribute.entity_id.in_(entity_ids))
        .order_by(WorldEntityAttribute.sort_order)
        .all()
    )
    attrs_by_entity: dict[int, list[WorldEntityAttribute]] = {}
    for attr in attrs:
        attrs_by_entity.setdefault(attr.entity_id, []).append(attr)
    return attrs_by_entity


def _build_scope_snapshot(
    *,
    novel: Novel,
    profile: CopilotRuntimeProfile,
    focus_variant: CopilotFocusVariant,
    focus_entity_id: int | None,
    entities: list[WorldEntity],
    relationships: list[WorldRelationship],
    systems: list[WorldSystem],
    attributes_by_entity: dict[int, list[WorldEntityAttribute]],
    window_index_state: WindowIndexLifecycleSnapshot,
) -> ScopeSnapshot:
    entities_by_id = {entity.id: entity for entity in entities}
    return ScopeSnapshot(
        novel=novel,
        novel_language=novel.language or "zh",
        entities=entities,
        entities_by_id=entities_by_id,
        relationships=relationships,
        systems=systems,
        attributes_by_entity=attributes_by_entity,
        draft_entities=[entity for entity in entities if entity.status == "draft"],
        draft_relationships=[relationship for relationship in relationships if relationship.status == "draft"],
        draft_systems=[system for system in systems if system.status == "draft"],
        profile=profile,
        focus_variant=focus_variant,
        focus_entity_id=focus_entity_id,
        window_index_state=window_index_state,
    )


def _load_broad_exploration_snapshot(
    db: Session,
    novel: Novel,
    *,
    focus_variant: CopilotFocusVariant,
    window_index_state: WindowIndexLifecycleSnapshot,
) -> ScopeSnapshot:
    novel_id = novel.id
    entities = (
        db.query(WorldEntity)
        .filter(WorldEntity.novel_id == novel_id)
        .limit(MAX_SCOPE_ENTITIES)
        .all()
    )
    relationships = (
        db.query(WorldRelationship)
        .filter(WorldRelationship.novel_id == novel_id)
        .limit(MAX_SCOPE_RELATIONSHIPS)
        .all()
    )
    systems = (
        db.query(WorldSystem)
        .filter(WorldSystem.novel_id == novel_id)
        .limit(MAX_SCOPE_SYSTEMS)
        .all()
    )
    attributes_by_entity = _load_attributes_for_entities(db, [entity.id for entity in entities])
    return _build_scope_snapshot(
        novel=novel,
        profile="broad_exploration",
        focus_variant=focus_variant,
        focus_entity_id=None,
        entities=entities,
        relationships=relationships,
        systems=systems,
        attributes_by_entity=attributes_by_entity,
        window_index_state=window_index_state,
    )


def _load_focused_research_snapshot(
    db: Session,
    novel: Novel,
    *,
    focus_variant: CopilotFocusVariant,
    focus_entity_id: int | None,
    window_index_state: WindowIndexLifecycleSnapshot,
) -> ScopeSnapshot:
    novel_id = novel.id
    entity_query = db.query(WorldEntity).filter(WorldEntity.novel_id == novel_id)
    relationship_query = db.query(WorldRelationship).filter(WorldRelationship.novel_id == novel_id)

    if focus_entity_id is not None:
        relationships = relationship_query.filter(
            (WorldRelationship.source_id == focus_entity_id)
            | (WorldRelationship.target_id == focus_entity_id),
        ).limit(MAX_SCOPE_RELATIONSHIPS).all()

        entity_ids = {focus_entity_id}
        for relationship in relationships:
            entity_ids.add(relationship.source_id)
            entity_ids.add(relationship.target_id)

        entities = (
            entity_query
            .filter(WorldEntity.id.in_(entity_ids))
            .limit(MAX_SCOPE_ENTITIES)
            .all()
        )
    else:
        entities = entity_query.limit(min(MAX_SCOPE_ENTITIES, 16)).all()
        entity_ids = {entity.id for entity in entities}
        if entity_ids:
            relationships = relationship_query.filter(
                (WorldRelationship.source_id.in_(entity_ids))
                | (WorldRelationship.target_id.in_(entity_ids)),
            ).limit(min(MAX_SCOPE_RELATIONSHIPS, 20)).all()
        else:
            relationships = []

    attributes_by_entity = _load_attributes_for_entities(db, [entity.id for entity in entities])
    return _build_scope_snapshot(
        novel=novel,
        profile="focused_research",
        focus_variant=focus_variant,
        focus_entity_id=focus_entity_id,
        entities=entities,
        relationships=relationships,
        systems=[],
        attributes_by_entity=attributes_by_entity,
        window_index_state=window_index_state,
    )


def _load_draft_governance_snapshot(
    db: Session,
    novel: Novel,
    *,
    window_index_state: WindowIndexLifecycleSnapshot,
) -> ScopeSnapshot:
    novel_id = novel.id
    draft_entities = (
        db.query(WorldEntity)
        .filter(WorldEntity.novel_id == novel_id, WorldEntity.status == "draft")
        .limit(MAX_SCOPE_ENTITIES)
        .all()
    )
    draft_relationships = (
        db.query(WorldRelationship)
        .filter(WorldRelationship.novel_id == novel_id, WorldRelationship.status == "draft")
        .limit(MAX_SCOPE_RELATIONSHIPS)
        .all()
    )
    draft_systems = (
        db.query(WorldSystem)
        .filter(WorldSystem.novel_id == novel_id, WorldSystem.status == "draft")
        .limit(MAX_SCOPE_SYSTEMS)
        .all()
    )

    entity_ids = {entity.id for entity in draft_entities}
    for relationship in draft_relationships:
        entity_ids.add(relationship.source_id)
        entity_ids.add(relationship.target_id)

    entities = (
        db.query(WorldEntity)
        .filter(WorldEntity.novel_id == novel_id, WorldEntity.id.in_(entity_ids))
        .all()
        if entity_ids
        else []
    )
    attributes_by_entity = _load_attributes_for_entities(db, [entity.id for entity in entities])
    return _build_scope_snapshot(
        novel=novel,
        profile="draft_governance",
        focus_variant="draft",
        focus_entity_id=None,
        entities=entities,
        relationships=draft_relationships,
        systems=draft_systems,
        attributes_by_entity=attributes_by_entity,
        window_index_state=window_index_state,
    )


def load_scope_snapshot(db: Session, novel: Novel, mode: str, scope: str, context: dict | None) -> ScopeSnapshot:
    """Load world-model state relevant to the current copilot scope."""
    profile = derive_runtime_profile(mode, scope, context)
    focus_variant = derive_focus_variant(mode, scope, context)
    window_index_state = inspect_window_index_lifecycle(novel, db=db)
    focus_entity_id = (context or {}).get("entity_id")
    if not isinstance(focus_entity_id, int):
        focus_entity_id = None

    if profile == "draft_governance":
        snapshot = _load_draft_governance_snapshot(db, novel, window_index_state=window_index_state)
    elif profile == "focused_research":
        snapshot = _load_focused_research_snapshot(
            db,
            novel,
            focus_variant=focus_variant,
            focus_entity_id=focus_entity_id,
            window_index_state=window_index_state,
        )
    else:
        snapshot = _load_broad_exploration_snapshot(
            db,
            novel,
            focus_variant=focus_variant,
            window_index_state=window_index_state,
        )

    # 补充全书实体索引，防止局部研究时把工作集外的已有角色误判成新角色。
    snapshot.entity_catalog = (
        db.query(WorldEntity)
        .filter(WorldEntity.novel_id == novel.id)
        .all()
    )
    snapshot.entity_catalog_by_id = {
        entity.id: entity for entity in snapshot.entity_catalog
    }
    catalog_attributes = _load_attributes_for_entities(
        db,
        [entity.id for entity in snapshot.entity_catalog],
    )
    snapshot.attributes_by_entity.update(catalog_attributes)
    return snapshot


def gather_evidence(
    db: Session,
    novel: Novel,
    snapshot: ScopeSnapshot,
    context: dict | None,
    interaction_locale: str = "zh",
) -> list[EvidenceItem]:
    """Gather evidence from backend-known sources BEFORE the LLM call."""
    items: list[EvidenceItem] = []

    if snapshot.profile == "draft_governance":
        _gather_draft_row_evidence(snapshot, items, interaction_locale)
        if snapshot.focus_entity_id is not None:
            _gather_chapter_evidence(db, novel, context, snapshot, items, interaction_locale)
    else:
        _gather_chapter_evidence(db, novel, context, snapshot, items, interaction_locale)
        _gather_entity_evidence(snapshot, context, items, interaction_locale)
        _gather_relationship_evidence(snapshot, context, items, interaction_locale)

    return items[:MAX_EVIDENCE_ITEMS]


def prompt_may_reference_workspace(prompt: str) -> bool:
    """快速判断普通对话是否可能在查询当前小说。"""
    if _CHAPTER_RANGE_RE.search(prompt or "") or _CHAPTER_NUMBER_RE.search(prompt or ""):
        return True
    lowered = (prompt or "").casefold()
    if any(hint in lowered for hint in _WORKSPACE_QUERY_HINTS):
        return True
    # “角色名 + 状态/身份/是谁”等短问法通常省略“书里”二字。
    return bool(re.search(r"[\u4e00-\u9fff]{2,8}(?:是谁|什么身份|什么状态|现在怎么样|有何关系)", prompt or ""))


def prompt_mentions_known_entity(db: Session, novel_id: int, prompt: str) -> bool:
    """即使用户省略“书里”，明确出现实体名时也应读取小说资料。"""
    lowered = (prompt or "").casefold()
    entities = db.query(WorldEntity).filter(WorldEntity.novel_id == novel_id).all()
    for entity in entities:
        for name in [entity.name, *(entity.aliases or [])]:
            term = str(name or "").strip().casefold()
            if len(term) >= 2 and term in lowered:
                return True
    return False


def gather_explicit_query_evidence(
    db: Session,
    novel: Novel,
    snapshot: ScopeSnapshot,
    prompt: str,
    interaction_locale: str = "zh",
) -> list[EvidenceItem]:
    """按用户明确提到的章节或实体读取证据，不扩大到整部正文。"""
    items: list[EvidenceItem] = []
    chapter_numbers, chapter_range_truncated = _extract_requested_chapter_numbers(prompt)
    if chapter_numbers:
        found_chapters = _gather_requested_chapters(db, novel, chapter_numbers, items, interaction_locale)
        missing_chapters = [number for number in chapter_numbers if number not in found_chapters]
        if missing_chapters:
            items.append(EvidenceItem(
                evidence_id="explicit_chapter_missing",
                source_type="system_notice",
                source_ref={"missing_chapters": missing_chapters},
                title="章节缺失提示",
                excerpt=f"未找到这些章节：{', '.join(str(number) for number in missing_chapters)}。",
                why_relevant="避免把缺失章节当成已经读取",
            ))
        if chapter_range_truncated:
            items.append(EvidenceItem(
                evidence_id="explicit_chapter_limit",
                source_type="system_notice",
                source_ref={"chapter_limit": MAX_EXPLICIT_QUERY_CHAPTERS},
                title="章节读取范围提示",
                excerpt=f"本轮最多读取{MAX_EXPLICIT_QUERY_CHAPTERS}个明确指定章节，超出部分未加载。",
                why_relevant="避免一次请求载入过多正文",
            ))

    mentioned_entities = _find_prompt_entities(snapshot, prompt)
    for entity in mentioned_entities:
        _gather_entity_evidence(snapshot, {"entity_id": entity.id}, items, interaction_locale)
        _gather_relationship_evidence(snapshot, {"entity_id": entity.id}, items, interaction_locale)
    if mentioned_entities:
        _gather_entity_chapter_evidence(
            db,
            novel,
            mentioned_entities,
            items,
            excluded_chapter_numbers=set(chapter_numbers),
            interaction_locale=interaction_locale,
        )

    if not items and prompt_may_reference_workspace(prompt):
        overview = _build_query_overview(snapshot)
        if overview:
            items.append(EvidenceItem(
                evidence_id="explicit_world_overview",
                source_type="world_overview",
                source_ref={"novel_id": novel.id},
                title="当前小说概览",
                excerpt=overview,
                why_relevant="用户明确查询当前小说内容",
            ))
    for item in items:
        item.source_ref = {**item.source_ref, "explicit_query": True}
    return _dedupe_evidence(items)[:MAX_EVIDENCE_ITEMS]


def _extract_requested_chapter_numbers(prompt: str) -> tuple[list[int], bool]:
    requested: set[int] = set()
    truncated = False
    for match in _CHAPTER_RANGE_RE.finditer(prompt or ""):
        start = int(match.group(1))
        end = int(match.group(2))
        if start <= 0 or end <= 0:
            continue
        step = 1 if end >= start else -1
        values = list(range(start, end + step, step))
        if len(values) > MAX_EXPLICIT_QUERY_CHAPTERS:
            truncated = True
        requested.update(values[:MAX_EXPLICIT_QUERY_CHAPTERS])
    for match in _CHAPTER_NUMBER_RE.finditer(prompt or ""):
        value = int(match.group(1) or match.group(2))
        if value > 0:
            requested.add(value)
    ordered = sorted(requested)
    if len(ordered) > MAX_EXPLICIT_QUERY_CHAPTERS:
        truncated = True
        ordered = ordered[:MAX_EXPLICIT_QUERY_CHAPTERS]
    return ordered, truncated


def _gather_requested_chapters(
    db: Session,
    novel: Novel,
    chapter_numbers: list[int],
    items: list[EvidenceItem],
    interaction_locale: str,
) -> set[int]:
    chapters = (
        db.query(Chapter)
        .filter(Chapter.novel_id == novel.id, Chapter.chapter_number.in_(chapter_numbers))
        .order_by(Chapter.chapter_number.asc())
        .all()
    )
    found: set[int] = set()
    for chapter in chapters:
        if not (chapter.content or "").strip():
            continue
        found.add(chapter.chapter_number)
        content = _clip_explicit_chapter(chapter.content)
        items.append(EvidenceItem(
            evidence_id=f"explicit_chapter_{chapter.id}",
            source_type="chapter_excerpt",
            source_ref={
                "chapter_id": chapter.id,
                "chapter_number": chapter.chapter_number,
                "start_pos": 0,
                "end_pos": len(chapter.content),
                "explicit_query": True,
            },
            title=f"第{chapter.chapter_number}章 {chapter.title or ''}".strip(),
            excerpt=content,
            why_relevant=(
                "用户明确指定该章节" if interaction_locale != "en"
                else "The user explicitly requested this chapter"
            ),
        ))
    return found


def _clip_explicit_chapter(content: str) -> str:
    if len(content) <= MAX_EXPLICIT_CHAPTER_CHARS:
        return content
    half = MAX_EXPLICIT_CHAPTER_CHARS // 2
    return f"{content[:half]}\n\n……中段因长度限制省略……\n\n{content[-half:]}"


def _find_prompt_entities(snapshot: ScopeSnapshot, prompt: str) -> list[WorldEntity]:
    lowered = (prompt or "").casefold()
    catalog = snapshot.entity_catalog or snapshot.entities
    term_to_entities: dict[str, list[WorldEntity]] = {}
    for entity in catalog:
        for name in [entity.name, *(entity.aliases or [])]:
            term = str(name or "").strip().casefold()
            if len(term) >= 2 and term in lowered:
                term_to_entities.setdefault(term, []).append(entity)

    selected: list[WorldEntity] = []
    selected_ids: set[int] = set()
    for term in sorted(term_to_entities, key=lambda value: (-len(value), value)):
        matches = {entity.id: entity for entity in term_to_entities[term]}
        if len(matches) != 1:
            continue
        entity = next(iter(matches.values()))
        if entity.id not in selected_ids:
            selected.append(entity)
            selected_ids.add(entity.id)
        if len(selected) >= 3:
            break
    return selected


def _gather_entity_chapter_evidence(
    db: Session,
    novel: Novel,
    entities: list[WorldEntity],
    items: list[EvidenceItem],
    *,
    excluded_chapter_numbers: set[int],
    interaction_locale: str,
) -> None:
    terms = [entity.name for entity in entities if entity.name]
    if not terms:
        return
    chapters = (
        db.query(Chapter)
        .filter(Chapter.novel_id == novel.id, or_(*(Chapter.content.contains(term) for term in terms)))
        .order_by(Chapter.chapter_number.desc())
        .limit(30)
        .all()
    )
    scored = sorted(
        chapters,
        key=lambda chapter: (
            -sum(1 for term in terms if term in (chapter.content or "")),
            -chapter.chapter_number,
        ),
    )
    added = 0
    for chapter in scored:
        if chapter.chapter_number in excluded_chapter_numbers or not chapter.content:
            continue
        excerpt, start, end = _excerpt_around_terms(chapter.content, terms)
        items.append(EvidenceItem(
            evidence_id=f"entity_query_chapter_{chapter.id}_{start}",
            source_type="chapter_excerpt",
            source_ref={
                "chapter_id": chapter.id,
                "chapter_number": chapter.chapter_number,
                "start_pos": start,
                "end_pos": end,
                "explicit_query": True,
            },
            title=f"第{chapter.chapter_number}章相关片段",
            excerpt=excerpt,
            why_relevant=(
                "正文提到了用户查询的角色" if interaction_locale != "en"
                else "The prose mentions the queried character"
            ),
        ))
        added += 1
        if added >= MAX_EXPLICIT_ENTITY_CHAPTERS:
            break


def _excerpt_around_terms(content: str, terms: list[str]) -> tuple[str, int, int]:
    positions = [content.find(term) for term in terms if content.find(term) >= 0]
    center = min(positions) if positions else 0
    start = max(0, center - 1000)
    end = min(len(content), start + 3000)
    return content[start:end], start, end


def _build_query_overview(snapshot: ScopeSnapshot) -> str:
    entities = "、".join(entity.name for entity in snapshot.entities[:30])
    relationships: list[str] = []
    for relationship in snapshot.relationships[:20]:
        source = snapshot.entities_by_id.get(relationship.source_id)
        target = snapshot.entities_by_id.get(relationship.target_id)
        relationships.append(
            f"{source.name if source else '?'}—{relationship.label}→{target.name if target else '?'}"
        )
    parts = []
    if entities:
        parts.append(f"实体：{entities}")
    if relationships:
        parts.append(f"关系：{'；'.join(relationships)}")
    return "\n".join(parts)


def _dedupe_evidence(items: list[EvidenceItem]) -> list[EvidenceItem]:
    deduped: list[EvidenceItem] = []
    seen: set[str] = set()
    for item in items:
        if item.evidence_id in seen:
            continue
        seen.add(item.evidence_id)
        deduped.append(item)
    return deduped


def _gather_chapter_evidence(
    db: Session,
    novel: Novel,
    context: dict | None,
    snapshot: ScopeSnapshot,
    items: list[EvidenceItem],
    interaction_locale: str,
) -> None:
    """Gather chapter excerpts from window index or tail chapters."""
    from app.core.indexing.window_index import NovelIndex

    lifecycle = snapshot.window_index_state
    use_window_index = bool(
        lifecycle
        and lifecycle.status == WINDOW_INDEX_STATUS_FRESH
        and lifecycle.has_payload
        and novel.window_index
    )

    if context and context.get("entity_id") and use_window_index:
        entity = snapshot.entities_by_id.get(context["entity_id"])
        if entity:
            try:
                index = NovelIndex.from_msgpack(novel.window_index)
                windows = index.find_entity_passages(entity.name, limit=6)
                for window in windows:
                    chapter = db.get(Chapter, window.chapter_id)
                    if chapter and chapter.content:
                        start = max(0, window.start_pos)
                        end = min(len(chapter.content), window.end_pos)
                        text = chapter.content[start:end]
                        if text.strip():
                            items.append(EvidenceItem(
                                evidence_id=f"ch_{chapter.id}_{start}",
                                source_type="chapter_excerpt",
                                source_ref={
                                    "chapter_id": chapter.id,
                                    "chapter_number": chapter.chapter_number,
                                    "start_pos": start,
                                    "end_pos": end,
                                },
                                title=_scope_text(
                                    interaction_locale,
                                    CopilotTextKey.SCOPE_CHAPTER_WINDOW_TITLE,
                                    chapter_number=chapter.chapter_number,
                                    start=start,
                                    end=end,
                                ),
                                excerpt=text[:MAX_CHAPTER_EXCERPT_CHARS],
                                why_relevant=_scope_text(
                                    interaction_locale,
                                    CopilotTextKey.SCOPE_CHAPTER_MENTIONS_ENTITY,
                                    entity_name=entity.name,
                                ),
                            ))
            except Exception:
                logger.debug("Window index load failed, falling back to tail chapters", exc_info=True)

    if len(items) < 3 and snapshot.focus_variant != "whole_book":
        fallback_reason = _scope_text(interaction_locale, CopilotTextKey.SCOPE_RECENT_CHAPTER_CONTEXT)
        if lifecycle and lifecycle.status == WINDOW_INDEX_STATUS_STALE:
            fallback_reason = _scope_text(interaction_locale, CopilotTextKey.SCOPE_STALE_RECENT_CHAPTER_CONTEXT)
        elif lifecycle and lifecycle.status == WINDOW_INDEX_STATUS_MISSING:
            fallback_reason = _scope_text(interaction_locale, CopilotTextKey.SCOPE_MISSING_RECENT_CHAPTER_CONTEXT)
        elif lifecycle and lifecycle.status == WINDOW_INDEX_STATUS_FAILED:
            fallback_reason = _scope_text(interaction_locale, CopilotTextKey.SCOPE_FAILED_RECENT_CHAPTER_CONTEXT)
        chapters = (
            db.query(Chapter)
            .filter(Chapter.novel_id == novel.id)
            .order_by(Chapter.chapter_number.desc())
            .limit(3)
            .all()
        )
        seen_ch_ids = {item.source_ref.get("chapter_id") for item in items if item.source_type == "chapter_excerpt"}
        for chapter in chapters:
            if chapter.id in seen_ch_ids or not chapter.content or not chapter.content.strip():
                continue
            text = (
                chapter.content[-MAX_CHAPTER_EXCERPT_CHARS:]
                if len(chapter.content) > MAX_CHAPTER_EXCERPT_CHARS
                else chapter.content
            )
            items.append(EvidenceItem(
                evidence_id=f"ch_{chapter.id}_tail",
                source_type="chapter_excerpt",
                source_ref={
                    "chapter_id": chapter.id,
                    "chapter_number": chapter.chapter_number,
                    "start_pos": max(0, len(chapter.content) - MAX_CHAPTER_EXCERPT_CHARS),
                    "end_pos": len(chapter.content),
                },
                title=_scope_text(
                    interaction_locale,
                    CopilotTextKey.SCOPE_CHAPTER_TAIL_TITLE,
                    chapter_number=chapter.chapter_number,
                ),
                excerpt=text[:MAX_CHAPTER_EXCERPT_CHARS],
                why_relevant=fallback_reason,
            ))


def _gather_entity_evidence(
    snapshot: ScopeSnapshot,
    context: dict | None,
    items: list[EvidenceItem],
    interaction_locale: str,
) -> None:
    """Add world-model entity rows as evidence items."""
    target_id = (context or {}).get("entity_id")
    if target_id:
        entity = snapshot.entities_by_id.get(target_id)
        if entity:
            desc = entity.description[:500] if entity.description else _scope_text(
                interaction_locale,
                CopilotTextKey.TEXT_NO_DESCRIPTION,
            )
            attrs = snapshot.attributes_by_entity.get(entity.id, [])
            attr_text = "; ".join(f"{attr.key}={attr.surface[:80]}" for attr in attrs[:5])
            excerpt = f"{entity.name} ({entity.entity_type}): {desc}"
            if attr_text:
                excerpt = _append_scope_labeled_line(
                    excerpt,
                    interaction_locale=interaction_locale,
                    label_key=CopilotTextKey.TEXT_ATTRIBUTES_LABEL,
                    value=attr_text,
                )
            items.append(EvidenceItem(
                evidence_id=f"ent_{entity.id}",
                source_type="world_entity",
                source_ref={"entity_id": entity.id},
                title=_scope_text(
                    interaction_locale,
                    CopilotTextKey.SCOPE_ENTITY_TITLE,
                    entity_name=entity.name,
                ),
                excerpt=excerpt,
                why_relevant=_scope_text(interaction_locale, CopilotTextKey.SCOPE_ENTITY_TARGET_REASON),
            ))


def _gather_relationship_evidence(
    snapshot: ScopeSnapshot,
    context: dict | None,
    items: list[EvidenceItem],
    interaction_locale: str,
) -> None:
    """Add relationship rows as evidence for relationship-scoped work."""
    target_id = (context or {}).get("entity_id")
    if not target_id:
        return
    for relationship in snapshot.relationships[:10]:
        if relationship.source_id == target_id or relationship.target_id == target_id:
            source = snapshot.entities_by_id.get(relationship.source_id)
            target = snapshot.entities_by_id.get(relationship.target_id)
            source_name = source.name if source else f"#{relationship.source_id}"
            target_name = target.name if target else f"#{relationship.target_id}"
            description = relationship.description[:200] if relationship.description else ""
            items.append(EvidenceItem(
                evidence_id=f"rel_{relationship.id}",
                source_type="world_relationship",
                source_ref={
                    "relationship_id": relationship.id,
                    "source_id": relationship.source_id,
                    "target_id": relationship.target_id,
                },
                title=f"{source_name} --[{relationship.label}]--> {target_name}",
                excerpt=_scope_text(
                    interaction_locale,
                    CopilotTextKey.SCOPE_RELATIONSHIP_EXCERPT,
                    source_name=source_name,
                    label=relationship.label,
                    target_name=target_name,
                    description=description,
                ),
                why_relevant=_scope_text(interaction_locale, CopilotTextKey.SCOPE_RELATIONSHIP_TARGET_REASON),
            ))


def _gather_draft_row_evidence(snapshot: ScopeSnapshot, items: list[EvidenceItem], interaction_locale: str) -> None:
    """Surface draft rows themselves as first-class evidence in draft governance."""
    for entity in snapshot.draft_entities[:6]:
        attrs = snapshot.attributes_by_entity.get(entity.id, [])
        attr_text = "; ".join(f"{attr.key}={attr.surface[:60]}" for attr in attrs[:4])
        excerpt = _scope_text(
            interaction_locale,
            CopilotTextKey.SCOPE_DRAFT_ENTITY_EXCERPT,
            entity_name=entity.name,
            entity_type=entity.entity_type,
        )
        if entity.description:
            excerpt = _append_scope_labeled_line(
                excerpt,
                interaction_locale=interaction_locale,
                label_key=CopilotTextKey.TEXT_DESCRIPTION_LABEL,
                value=entity.description[:200],
            )
        else:
            excerpt = _append_scope_labeled_line(
                excerpt,
                interaction_locale=interaction_locale,
                label_key=CopilotTextKey.TEXT_DESCRIPTION_LABEL,
                value=_scope_text(interaction_locale, CopilotTextKey.TEXT_NO_DESCRIPTION),
            )
        if attr_text:
            excerpt = _append_scope_labeled_line(
                excerpt,
                interaction_locale=interaction_locale,
                label_key=CopilotTextKey.TEXT_ATTRIBUTES_LABEL,
                value=attr_text,
            )
        items.append(EvidenceItem(
            evidence_id=f"draft_ent_{entity.id}",
            source_type="world_entity",
            source_ref={"entity_id": entity.id},
            title=_scope_text(
                interaction_locale,
                CopilotTextKey.SCOPE_DRAFT_ENTITY_TITLE,
                entity_name=entity.name,
            ),
            excerpt=excerpt,
            why_relevant=_scope_text(interaction_locale, CopilotTextKey.SCOPE_DRAFT_ENTITY_REASON),
        ))

    for relationship in snapshot.draft_relationships[:6]:
        source = snapshot.entities_by_id.get(relationship.source_id)
        target = snapshot.entities_by_id.get(relationship.target_id)
        excerpt = _scope_text(
            interaction_locale,
            CopilotTextKey.SCOPE_DRAFT_RELATIONSHIP_EXCERPT,
            source_name=source.name if source else "?",
            label=relationship.label,
            target_name=target.name if target else "?",
        )
        if relationship.description:
            excerpt = _append_scope_labeled_line(
                excerpt,
                interaction_locale=interaction_locale,
                label_key=CopilotTextKey.TEXT_DESCRIPTION_LABEL,
                value=relationship.description[:200],
            )
        else:
            excerpt = _append_scope_labeled_line(
                excerpt,
                interaction_locale=interaction_locale,
                label_key=CopilotTextKey.TEXT_DESCRIPTION_LABEL,
                value=_scope_text(interaction_locale, CopilotTextKey.TEXT_NO_DESCRIPTION),
            )
        items.append(EvidenceItem(
            evidence_id=f"draft_rel_{relationship.id}",
            source_type="world_relationship",
            source_ref={
                "relationship_id": relationship.id,
                "source_id": relationship.source_id,
                "target_id": relationship.target_id,
            },
            title=_scope_text(
                interaction_locale,
                CopilotTextKey.SCOPE_DRAFT_RELATIONSHIP_TITLE,
                label=relationship.label,
            ),
            excerpt=excerpt,
            why_relevant=_scope_text(interaction_locale, CopilotTextKey.SCOPE_DRAFT_RELATIONSHIP_REASON),
        ))

    for system in snapshot.draft_systems[:4]:
        excerpt = _scope_text(
            interaction_locale,
            CopilotTextKey.SCOPE_DRAFT_SYSTEM_EXCERPT,
            system_name=system.name,
        )
        if system.description:
            excerpt = _append_scope_labeled_line(
                excerpt,
                interaction_locale=interaction_locale,
                label_key=CopilotTextKey.TEXT_DESCRIPTION_LABEL,
                value=system.description[:200],
            )
        items.append(EvidenceItem(
            evidence_id=f"draft_sys_{system.id}",
            source_type="world_system",
            source_ref={"system_id": system.id},
            title=_scope_text(
                interaction_locale,
                CopilotTextKey.SCOPE_DRAFT_SYSTEM_TITLE,
                system_name=system.name,
            ),
            excerpt=excerpt,
            why_relevant=_scope_text(interaction_locale, CopilotTextKey.SCOPE_DRAFT_SYSTEM_REASON),
        ))


def serialize_evidence(evidence: EvidenceItem) -> dict[str, Any]:
    return {
        "evidence_id": evidence.evidence_id,
        "source_type": evidence.source_type,
        "source_ref": evidence.source_ref,
        "title": evidence.title,
        "excerpt": evidence.excerpt,
        "why_relevant": evidence.why_relevant,
        "pack_id": evidence.pack_id,
        "source_refs": evidence.source_refs,
        "anchor_terms": evidence.anchor_terms,
        "support_count": evidence.support_count,
        "preview_excerpt": evidence.preview_excerpt,
        "expanded": evidence.expanded,
    }
