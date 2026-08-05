"""Apply or reject chapter-sourced entity changes after user review."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.core.events import record_event
from app.core.world.character_attributes import (
    MAX_AUTO_EXTENSION_ATTRIBUTES,
    MAX_AUTO_CHARACTER_ATTRIBUTES,
    append_bounded_history,
    canonicalize_character_attribute_key,
    count_extension_character_attributes,
    is_core_character_attribute,
    is_history_character_attribute,
)
from app.models import WorldEntity, WorldEntityAttribute, WorldEntityChangeProposal


class EntityChangeProposalError(RuntimeError):
    """Raised when a proposal cannot be processed in its current state."""


def apply_entity_change_proposal(
    novel_id: int,
    proposal_id: int,
    *,
    user_id: int,
    db: Session,
) -> WorldEntityChangeProposal:
    """Apply one pending proposal and preserve replace-field history."""
    proposal = _load_pending_proposal(db, novel_id, proposal_id)
    entity = db.get(WorldEntity, proposal.entity_id)
    if not entity or entity.novel_id != novel_id:
        raise EntityChangeProposalError("entity_not_found")

    delta = proposal.delta if isinstance(proposal.delta, dict) else {}
    _merge_aliases(entity, delta.get("aliases"))
    _append_description(entity, delta.get("description_append"), proposal.chapter_number)
    _apply_attributes(db, entity, proposal.chapter_number, delta.get("attributes"))

    proposal.status = "applied"
    record_event(
        db,
        user_id,
        "world_edit",
        novel_id=novel_id,
        meta={"action": "apply_entity_change", "proposal_id": proposal.id},
    )
    db.commit()
    db.refresh(proposal)
    return proposal


def reject_entity_change_proposal(
    novel_id: int,
    proposal_id: int,
    *,
    user_id: int,
    db: Session,
) -> WorldEntityChangeProposal:
    """Reject one pending proposal without changing the entity."""
    proposal = _load_pending_proposal(db, novel_id, proposal_id)
    proposal.status = "rejected"
    record_event(
        db,
        user_id,
        "world_edit",
        novel_id=novel_id,
        meta={"action": "reject_entity_change", "proposal_id": proposal.id},
    )
    db.commit()
    db.refresh(proposal)
    return proposal


def _load_pending_proposal(
    db: Session,
    novel_id: int,
    proposal_id: int,
) -> WorldEntityChangeProposal:
    proposal = (
        db.query(WorldEntityChangeProposal)
        .filter(
            WorldEntityChangeProposal.id == proposal_id,
            WorldEntityChangeProposal.novel_id == novel_id,
        )
        .first()
    )
    if not proposal:
        raise EntityChangeProposalError("proposal_not_found")
    if proposal.status != "pending":
        raise EntityChangeProposalError("proposal_not_pending")
    return proposal


def _merge_aliases(entity: WorldEntity, aliases: Any) -> None:
    current = [str(item).strip() for item in (entity.aliases or []) if str(item).strip()]
    normalized = {item.casefold() for item in current}
    for item in aliases if isinstance(aliases, list) else []:
        value = str(item).strip()
        if value and value.casefold() not in normalized:
            current.append(value)
            normalized.add(value.casefold())
    entity.aliases = current


def _append_description(entity: WorldEntity, value: Any, chapter_number: int) -> None:
    text = str(value or "").strip()
    if not text:
        return
    line = f"第{chapter_number}章：{text}"
    current = (entity.description or "").strip()
    if line not in current:
        entity.description = f"{current}\n{line}".strip()


def _apply_attributes(
    db: Session,
    entity: WorldEntity,
    chapter_number: int,
    items: Any,
) -> None:
    if not isinstance(items, list):
        return
    loaded_attributes = (
        db.query(WorldEntityAttribute)
        .filter(WorldEntityAttribute.entity_id == entity.id)
        .all()
    )
    attributes = _index_attributes(loaded_attributes)
    next_sort_order = max((item.sort_order or 0 for item in loaded_attributes), default=-1) + 1
    extension_count = count_extension_character_attributes(attributes)
    active_count = sum(
        1 for key in attributes
        if not is_history_character_attribute(key)
    )
    seen_keys: set[str] = set()
    history_lines: list[str] = []

    for raw_item in items:
        if not isinstance(raw_item, dict):
            continue
        key = canonicalize_character_attribute_key(str(raw_item.get("key") or ""))
        new_value = str(raw_item.get("new_value") or "").strip()
        if not key or not new_value or key in seen_keys:
            continue
        seen_keys.add(key)

        if not is_core_character_attribute(key) and not is_history_character_attribute(key):
            if key not in attributes and extension_count >= MAX_AUTO_EXTENSION_ATTRIBUTES:
                continue
            if key not in attributes:
                extension_count += 1
        if key not in attributes and not is_history_character_attribute(key):
            if active_count >= MAX_AUTO_CHARACTER_ATTRIBUTES:
                continue
            active_count += 1

        attribute = attributes.get(key)
        if attribute and attribute.key != key:
            # 仅在用户采纳变化时把历史同义字段改成标准名。
            attribute.key = key
        mode = "append" if is_history_character_attribute(key) else "replace"
        if mode == "append":
            line = f"第{chapter_number}章：{new_value}"
            if attribute:
                attribute.surface = append_bounded_history(attribute.surface or "", line)
            else:
                attribute = _new_attribute(
                    entity.id,
                    key,
                    append_bounded_history("", line),
                    next_sort_order,
                )
                db.add(attribute)
                attributes[key] = attribute
                next_sort_order += 1
            continue

        old_value = (attribute.surface or "").strip() if attribute else ""
        if old_value == new_value:
            continue
        if attribute:
            attribute.surface = new_value
        else:
            attribute = _new_attribute(entity.id, key, new_value, next_sort_order)
            db.add(attribute)
            attributes[key] = attribute
            next_sort_order += 1
        previous = old_value or "未记录"
        history_lines.append(f"第{chapter_number}章：{key}：{previous} → {new_value}")

    if history_lines:
        _append_history(db, entity.id, attributes, history_lines, next_sort_order)


def _index_attributes(attributes: list[WorldEntityAttribute]) -> dict[str, WorldEntityAttribute]:
    """按标准属性名建立索引，并优先使用已经采用标准名的字段。"""
    indexed: dict[str, WorldEntityAttribute] = {}
    for attribute in sorted(attributes, key=lambda item: (item.sort_order or 0, item.id or 0)):
        key = canonicalize_character_attribute_key(attribute.key)
        current = indexed.get(key)
        if current is None or (attribute.key == key and current.key != key):
            indexed[key] = attribute
    return indexed


def _new_attribute(entity_id: int, key: str, surface: str, sort_order: int) -> WorldEntityAttribute:
    # User approval turns the model suggestion into a manually confirmed world-model value.
    return WorldEntityAttribute(
        entity_id=entity_id,
        key=key,
        surface=surface,
        visibility="active",
        origin="manual",
        sort_order=sort_order,
    )


def _append_history(
    db: Session,
    entity_id: int,
    attributes: dict[str, WorldEntityAttribute],
    lines: list[str],
    sort_order: int,
) -> None:
    history = attributes.get("变更记录")
    if not history:
        history = _new_attribute(entity_id, "变更记录", "", sort_order)
        db.add(history)
    bounded = history.surface or ""
    for line in lines:
        bounded = append_bounded_history(bounded, line)
    history.surface = bounded
