"""Incrementally detect chapter-sourced character changes for user approval."""

from __future__ import annotations

import hashlib
import json
import logging
from difflib import SequenceMatcher
from typing import Any, Literal

from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.ai_client import ai_client
from app.core.world.character_attributes import (
    CHARACTER_ATTRIBUTE_CONTENT_RULES,
    CORE_CHARACTER_ATTRIBUTE_ORDER,
    MAX_AUTO_CHARACTER_ATTRIBUTES,
    MAX_AUTO_EXTENSION_ATTRIBUTES,
    append_bounded_history,
    canonicalize_character_attribute_key,
    count_extension_character_attributes,
    is_core_character_attribute,
    is_history_character_attribute,
)
from app.database import SessionLocal
from app.models import (
    Chapter,
    WorldEntity,
    WorldEntityAttribute,
    WorldEntityChangeProposal,
)

logger = logging.getLogger(__name__)


class DetectedAttributeChange(BaseModel):
    key: str = Field(min_length=1, max_length=80)
    new_value: str = Field(min_length=1, max_length=1200)
    evidence: str = Field(min_length=1, max_length=600)
    mode: Literal["replace", "append"] = "replace"
    importance: Literal["major", "minor"] = "minor"
    future_impact: str = Field(default="", max_length=300)


class DetectedExistingCharacterChange(BaseModel):
    entity_name: str = Field(min_length=1, max_length=255)
    summary: str = Field(min_length=1, max_length=500)
    evidence: str = Field(min_length=1, max_length=600)
    aliases: list[str] = Field(default_factory=list, max_length=12)
    description_append: str = Field(default="", max_length=1200)
    attributes: list[DetectedAttributeChange] = Field(default_factory=list, max_length=12)


class DetectedNewCharacter(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str = Field(default="", max_length=1200)
    aliases: list[str] = Field(default_factory=list, max_length=12)
    evidence: str = Field(min_length=1, max_length=600)
    attributes: list[DetectedAttributeChange] = Field(default_factory=list, max_length=12)


class ChapterCharacterChangeExtraction(BaseModel):
    existing_changes: list[DetectedExistingCharacterChange] = Field(default_factory=list, max_length=24)
    new_characters: list[DetectedNewCharacter] = Field(default_factory=list, max_length=24)


class WorldEntityChangeError(RuntimeError):
    pass


MAX_AUTO_EXPERIENCES_PER_CHARACTER_CHAPTER = 2


def _is_character(entity: WorldEntity) -> bool:
    return (entity.entity_type or "").strip().casefold() in {"character", "角色", "人物"}


def _normalize_text(value: str) -> str:
    return "".join((value or "").split()).casefold()


def _normalize_evidence_text(value: str) -> str:
    # Models may replace Chinese dialogue quotes or add a wrapping quote around an exact sentence.
    quote_chars = str.maketrans("", "", "\"'“”‘’「」『』")
    return _normalize_text(value).translate(quote_chars)


def _attribute_mode(key: str) -> Literal["replace", "append"]:
    # 归档字段持续追加，其他字段只保存当前有效值。
    return "append" if is_history_character_attribute(key) else "replace"


def _evidence_exists(chapter_content: str, evidence: str) -> bool:
    normalized_evidence = _normalize_evidence_text(evidence)
    return (
        len(normalized_evidence) >= 4
        and normalized_evidence in _normalize_evidence_text(chapter_content)
    )


def _is_important_experience(item: DetectedAttributeChange) -> bool:
    """重要经历必须明确影响角色后续，而不能只是本章发生过的动作。"""
    return (
        canonicalize_character_attribute_key(item.key) == "经历记录"
        and item.importance == "major"
        and len(_normalize_text(item.future_impact)) >= 6
        and len(_normalize_text(item.new_value)) >= 6
    )


def _entity_lookup(entities: list[WorldEntity]) -> dict[str, WorldEntity]:
    lookup: dict[str, WorldEntity] = {}
    for entity in entities:
        for name in [entity.name, *(entity.aliases or [])]:
            normalized = _normalize_text(name)
            if normalized:
                lookup.setdefault(normalized, entity)
    return lookup


def _mentioned_character_context(
    entities: list[WorldEntity],
    attributes_by_entity: dict[int, list[WorldEntityAttribute]],
    chapter_content: str,
) -> list[dict[str, Any]]:
    normalized_content = _normalize_text(chapter_content)
    context: list[dict[str, Any]] = []
    for entity in entities:
        names = [entity.name, *(entity.aliases or [])]
        if not any(_normalize_text(name) in normalized_content for name in names if name):
            continue
        current_attributes = _canonical_attribute_values(attributes_by_entity.get(entity.id, []))
        context.append({
            "name": entity.name,
            "aliases": entity.aliases or [],
            "description": (entity.description or "")[-1600:],
            "attributes": {key: value[:800] for key, value in current_attributes.items()},
        })
    return context


def _canonical_attribute_values(attributes: list[WorldEntityAttribute]) -> dict[str, str]:
    """合并历史遗留的同义属性，只保留有限的特殊字段。"""
    values: dict[str, str] = {}
    extension_count = 0
    for attribute in sorted(attributes, key=lambda item: (item.sort_order or 0, item.id or 0)):
        key = canonicalize_character_attribute_key(attribute.key)
        if not key or is_history_character_attribute(key):
            continue
        if key in values:
            if attribute.key == key:
                values[key] = attribute.surface or ""
            continue
        if not is_core_character_attribute(key):
            if extension_count >= MAX_AUTO_EXTENSION_ATTRIBUTES:
                continue
            extension_count += 1
        values[key] = attribute.surface or ""
    return values


def _build_detection_prompt(
    chapter: Chapter,
    mentioned_context: list[dict[str, Any]],
    known_names: list[str],
) -> str:
    return f"""请分析刚刚确认的第{chapter.chapter_number}章，只提取本章明确发生的角色变化。

现有角色当前资料：
{json.dumps(mentioned_context, ensure_ascii=False)}

全书已有角色名称与别名（仅用于防止重复新增）：
{json.dumps(known_names[:400], ensure_ascii=False)}

本章正文：
{chapter.content[:16000]}

规则：
1. 只记录正文有直接证据的变化，不要把重复介绍、临时情绪或猜测当作变化。
2. 只能使用这些固定属性名：{json.dumps(CORE_CHARACTER_ATTRIBUTE_ORDER, ensure_ascii=False)}；字段规则：{json.dumps(CHARACTER_ATTRIBUTE_CONTENT_RULES, ensure_ascii=False)}。
3. 每个角色最多保留{MAX_AUTO_CHARACTER_ATTRIBUTES}个有效属性。人物关系写入关系数据；一次性动作、临时情绪、时代背景和简介重复内容不生成属性。
4. 本章经历只有满足“重要事件”时才写入 key="经历记录"，并填写 importance="major" 与 future_impact；每个角色本章最多2条。
5. “重要事件”必须至少满足一项：造成不可轻易恢复的身份/阵营/目标/关系/能力/持有物/身体/认知变化；形成或解决主要冲突、承诺、债务；改变后续选择条件。普通出行、吃饭、寒暄、重复介绍、短暂情绪和无后续影响的动作都不是重要事件。
6. 经历记录控制在100字以内；重大性格、价值观或底线转折写入 key="成长记录"，使用 mode="append"。
7. 普通事件不要写入 description_append；该字段只用于补充长期稳定且原资料缺失的人物背景。
8. 当前状态类字段使用 mode="replace"；经历记录和成长记录使用 mode="append"。
9. evidence 必须逐字引用本章中的短句。
10. new_characters 只收录有姓名且实际参与剧情的重要人物；不要把称谓、群体、地点、组织或物品当人物。
11. 如果没有可靠变化，返回空数组。"""


async def detect_chapter_entity_changes(
    db: Session,
    *,
    novel_id: int,
    chapter_id: int,
    llm_config: dict[str, Any] | None = None,
    user_id: int | None = None,
) -> tuple[int, int]:
    """Run one compact extraction call and persist pending updates plus new drafts."""
    chapter = db.get(Chapter, chapter_id)
    if not chapter or chapter.novel_id != novel_id or not (chapter.content or "").strip():
        return 0, 0

    entities = db.query(WorldEntity).filter(WorldEntity.novel_id == novel_id).all()
    characters = [entity for entity in entities if _is_character(entity)]
    entity_ids = [entity.id for entity in characters]
    attributes = (
        db.query(WorldEntityAttribute)
        .filter(WorldEntityAttribute.entity_id.in_(entity_ids))
        .all()
        if entity_ids
        else []
    )
    attributes_by_entity: dict[int, list[WorldEntityAttribute]] = {}
    for attribute in attributes:
        attributes_by_entity.setdefault(attribute.entity_id, []).append(attribute)

    mentioned_context = _mentioned_character_context(characters, attributes_by_entity, chapter.content)
    known_names = [name for entity in entities for name in [entity.name, *(entity.aliases or [])] if name]
    extraction = await ai_client.generate_structured(
        prompt=_build_detection_prompt(chapter, mentioned_context, known_names),
        response_model=ChapterCharacterChangeExtraction,
        system_prompt="你负责从已确认小说章节中提取增量人物变化。宁可遗漏，也不要编造或过度推断。",
        temperature=0.2,
        max_tokens=3500,
        role="summary",
        max_retries=2,
        user_id=user_id,
        **(llm_config or {}),
    )

    character_lookup = _entity_lookup(characters)
    all_entity_lookup = _entity_lookup(entities)
    proposal_count = _persist_existing_changes(
        db,
        chapter,
        extraction.existing_changes,
        character_lookup,
        attributes_by_entity,
    )
    draft_count = _persist_new_character_drafts(db, chapter, extraction.new_characters, all_entity_lookup)
    db.commit()
    return proposal_count, draft_count


def _persist_existing_changes(
    db: Session,
    chapter: Chapter,
    changes: list[DetectedExistingCharacterChange],
    lookup: dict[str, WorldEntity],
    attributes_by_entity: dict[int, list[WorldEntityAttribute]],
) -> int:
    persisted = 0
    for change in changes:
        entity = lookup.get(_normalize_text(change.entity_name))
        if not entity or not _evidence_exists(chapter.content, change.evidence):
            continue
        current_attrs = _canonical_attribute_values(attributes_by_entity.get(entity.id, []))
        extension_count = count_extension_character_attributes(current_attrs)
        active_count = sum(
            1 for key in current_attrs
            if not is_history_character_attribute(key)
        )
        auto_experience_count = 0
        seen_keys: set[str] = set()
        attribute_deltas: list[dict[str, str]] = []
        for item in change.attributes:
            if not _evidence_exists(chapter.content, item.evidence):
                continue
            key = canonicalize_character_attribute_key(item.key)
            if not key or key == "变更记录":
                continue
            if key == "经历记录":
                if (
                    auto_experience_count < MAX_AUTO_EXPERIENCES_PER_CHARACTER_CHAPTER
                    and _is_important_experience(item)
                ):
                    appended = _append_automatic_experience(
                        db,
                        entity,
                        chapter.chapter_number,
                        item.new_value,
                        attributes_by_entity,
                    )
                    if appended:
                        auto_experience_count += 1
                continue
            if key in seen_keys:
                continue
            seen_keys.add(key)
            if not is_core_character_attribute(key) and not is_history_character_attribute(key):
                if key not in current_attrs and extension_count >= MAX_AUTO_EXTENSION_ATTRIBUTES:
                    continue
                if key not in current_attrs:
                    extension_count += 1
            if key not in current_attrs and not is_history_character_attribute(key):
                if active_count >= MAX_AUTO_CHARACTER_ATTRIBUTES:
                    continue
                active_count += 1
            old_value = current_attrs.get(key, "")
            mode = _attribute_mode(key)
            if mode == "replace" and _normalize_text(old_value) == _normalize_text(item.new_value):
                continue
            attribute_deltas.append({
                "key": key,
                "old_value": old_value,
                "new_value": item.new_value.strip(),
                "mode": mode,
                "evidence": item.evidence.strip(),
            })

        normalized_content = _normalize_text(chapter.content)
        aliases = [
            alias.strip()
            for alias in change.aliases
            if alias.strip()
            and alias.strip() not in (entity.aliases or [])
            and _normalize_text(alias) in normalized_content
        ]
        description_append = change.description_append.strip()
        if description_append and description_append in (entity.description or ""):
            description_append = ""
        if not attribute_deltas and not aliases and not description_append:
            continue

        fingerprint = hashlib.sha256(f"{chapter.id}:{entity.id}".encode("utf-8")).hexdigest()
        proposal = (
            db.query(WorldEntityChangeProposal)
            .filter(
                WorldEntityChangeProposal.novel_id == chapter.novel_id,
                WorldEntityChangeProposal.fingerprint == fingerprint,
            )
            .first()
        )
        delta = {"aliases": aliases, "description_append": description_append, "attributes": attribute_deltas}
        if proposal and proposal.status == "pending":
            proposal.summary = change.summary.strip()
            proposal.evidence = change.evidence.strip()
            proposal.delta = delta
        elif proposal:
            continue
        else:
            db.add(WorldEntityChangeProposal(
                novel_id=chapter.novel_id,
                chapter_id=chapter.id,
                chapter_number=chapter.chapter_number,
                entity_id=entity.id,
                entity_name=entity.name,
                summary=change.summary.strip(),
                evidence=change.evidence.strip(),
                delta=delta,
                fingerprint=fingerprint,
                status="pending",
            ))
        persisted += 1
    return persisted


def _append_automatic_experience(
    db: Session,
    entity: WorldEntity,
    chapter_number: int,
    value: str,
    attributes_by_entity: dict[int, list[WorldEntityAttribute]],
) -> bool:
    """重要经历无需审核，直接写入受长度限制的归档字段。"""
    entity_attributes = attributes_by_entity.setdefault(entity.id, [])
    matches = [
        attribute
        for attribute in entity_attributes
        if canonicalize_character_attribute_key(attribute.key) == "经历记录"
    ]
    history = next((attribute for attribute in matches if attribute.key == "经历记录"), None)
    if history is None and matches:
        history = matches[0]

    line = f"第{chapter_number}章：{value.strip()}"
    if history:
        previous = history.surface or ""
        chapter_prefix = f"第{chapter_number}章："
        same_chapter_lines = [
            item
            for item in previous.splitlines()
            if item.strip().startswith(chapter_prefix)
        ]
        if len(same_chapter_lines) >= MAX_AUTO_EXPERIENCES_PER_CHARACTER_CHAPTER:
            return False
        if any(_is_duplicate_history_event(item, line, chapter_prefix) for item in same_chapter_lines):
            return False
        history.surface = append_bounded_history(previous, line)
        return history.surface != previous

    history = WorldEntityAttribute(
        entity_id=entity.id,
        key="经历记录",
        surface=append_bounded_history("", line),
        visibility="active",
        origin="bootstrap",
        sort_order=max((item.sort_order or 0 for item in entity_attributes), default=-1) + 1,
    )
    db.add(history)
    entity_attributes.append(history)
    return True


def _is_duplicate_history_event(existing: str, candidate: str, chapter_prefix: str) -> bool:
    """同一章节重复扫描时，避免把近似措辞再次写入经历。"""
    existing_text = _normalize_text(existing.removeprefix(chapter_prefix))
    candidate_text = _normalize_text(candidate.removeprefix(chapter_prefix))
    if not existing_text or not candidate_text:
        return False
    if min(len(existing_text), len(candidate_text)) >= 8 and (
        existing_text in candidate_text or candidate_text in existing_text
    ):
        return True
    return SequenceMatcher(None, existing_text, candidate_text).ratio() >= 0.72


def _persist_new_character_drafts(
    db: Session,
    chapter: Chapter,
    characters: list[DetectedNewCharacter],
    lookup: dict[str, WorldEntity],
) -> int:
    created = 0
    for candidate in characters:
        canonical_name = candidate.name.strip()
        normalized_content = _normalize_text(chapter.content)
        aliases = [
            alias.strip()
            for alias in candidate.aliases
            if alias.strip() and _normalize_text(alias) in normalized_content
        ]
        names = [canonical_name, *aliases]
        if not canonical_name:
            continue
        if any(_normalize_text(name) in lookup for name in names if name):
            continue
        if not _evidence_exists(chapter.content, candidate.evidence):
            continue
        if not any(_normalize_text(name) in _normalize_text(chapter.content) for name in names if name):
            continue
        entity = WorldEntity(
            novel_id=chapter.novel_id,
            name=canonical_name,
            entity_type="Character",
            description=candidate.description.strip(),
            aliases=aliases,
            origin="bootstrap",
            status="draft",
        )
        db.add(entity)
        db.flush()
        extension_count = 0
        active_count = 0
        seen_keys: set[str] = set()
        for index, item in enumerate(candidate.attributes):
            if not _evidence_exists(chapter.content, item.evidence):
                continue
            key = canonicalize_character_attribute_key(item.key)
            if not key or key == "变更记录" or key in seen_keys:
                continue
            seen_keys.add(key)
            if key == "经历记录" and not _is_important_experience(item):
                continue
            if not is_core_character_attribute(key) and not is_history_character_attribute(key):
                if extension_count >= MAX_AUTO_EXTENSION_ATTRIBUTES:
                    continue
                extension_count += 1
            if not is_history_character_attribute(key):
                if active_count >= MAX_AUTO_CHARACTER_ATTRIBUTES:
                    continue
                active_count += 1
            value = item.new_value.strip()
            if is_history_character_attribute(key):
                value = append_bounded_history("", f"第{chapter.chapter_number}章：{value}")
            db.add(WorldEntityAttribute(
                entity_id=entity.id,
                key=key,
                surface=value,
                visibility="active",
                origin="bootstrap",
                sort_order=index,
            ))
        for name in names:
            if name:
                lookup[_normalize_text(name)] = entity
        created += 1
    return created


async def run_entity_change_detection_background(
    novel_id: int,
    chapter_id: int,
    user_id: int | None,
    llm_config: dict[str, Any] | None,
) -> None:
    db = SessionLocal()
    try:
        await detect_chapter_entity_changes(
            db,
            novel_id=novel_id,
            chapter_id=chapter_id,
            llm_config=llm_config,
            user_id=user_id,
        )
    except Exception:
        db.rollback()
        logger.exception("Chapter entity change detection failed", extra={"novel_id": novel_id, "chapter_id": chapter_id})
    finally:
        db.close()
