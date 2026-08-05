"""Tests for chapter-sourced incremental character updates."""

from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import StaticPool, create_engine
from sqlalchemy.orm import sessionmaker

from app.core.ai_client import ai_client
from app.core.world.entity_change_application import (
    apply_entity_change_proposal,
    reject_entity_change_proposal,
)
from app.core.world.entity_change_detection import (
    ChapterCharacterChangeExtraction,
    DetectedAttributeChange,
    DetectedExistingCharacterChange,
    DetectedNewCharacter,
    _evidence_exists,
    detect_chapter_entity_changes,
)
from app.core.world.character_attributes import (
    MAX_AUTO_EXTENSION_ATTRIBUTES,
    MAX_HISTORY_ATTRIBUTE_CHARS,
    MAX_HISTORY_ATTRIBUTE_LINES,
    append_bounded_history,
    canonicalize_character_attribute_key,
)
from app.core.auth import get_current_user_or_default
from app.database import Base, get_db
from app.models import (
    Chapter,
    Novel,
    WorldEntity,
    WorldEntityAttribute,
    WorldEntityChangeProposal,
    User,
)


engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def test_evidence_matching_ignores_quote_style_changes():
    chapter = "张三这才压低声音：“我就是想问问，接下来咱们咋办？”"
    model_evidence = "“张三这才压低声音：‘我就是想问问，接下来咱们咋办？’”"

    assert _evidence_exists(chapter, model_evidence)


def test_character_attribute_synonyms_use_fixed_names():
    assert canonicalize_character_attribute_key("当前身份") == "身份"
    assert canonicalize_character_attribute_key("所在地点") == "位置"
    assert canonicalize_character_attribute_key("履历") == "经历记录"


def test_history_archive_keeps_recent_bounded_entries():
    content = ""
    for index in range(MAX_HISTORY_ATTRIBUTE_LINES + 20):
        content = append_bounded_history(content, f"第{index}章：发生了影响后续的重要事件")

    lines = content.splitlines()
    assert len(lines) == MAX_HISTORY_ATTRIBUTE_LINES
    assert len(content) <= MAX_HISTORY_ATTRIBUTE_CHARS
    assert lines[0].startswith("第20章")


@pytest.fixture
def db():
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def chapter_world(db):
    novel = Novel(title="测试小说", author="作者", file_path="/tmp/test.txt", total_chapters=1)
    db.add(novel)
    db.flush()
    chapter = Chapter(
        novel_id=novel.id,
        chapter_number=2,
        title="变化",
        content="林野赶到县城，正式成为调查组组长。新来的顾青递给他一份名单。",
    )
    entity = WorldEntity(
        novel_id=novel.id,
        name="林野",
        entity_type="Character",
        description="宣传委员",
        aliases=[],
        origin="manual",
        status="confirmed",
    )
    db.add_all([chapter, entity])
    db.flush()
    db.add(WorldEntityAttribute(
        entity_id=entity.id,
        key="身份",
        surface="宣传委员",
        visibility="active",
        origin="manual",
    ))
    db.commit()
    return novel, chapter, entity


@pytest.mark.asyncio
async def test_detection_creates_pending_change_and_new_draft(db, chapter_world, monkeypatch):
    novel, chapter, entity = chapter_world
    extraction = ChapterCharacterChangeExtraction(
        existing_changes=[DetectedExistingCharacterChange(
            entity_name="林野",
            summary="林野升任调查组组长",
            evidence="正式成为调查组组长",
            aliases=["林组长"],
            attributes=[DetectedAttributeChange(
                key="当前身份",
                new_value="调查组组长",
                evidence="正式成为调查组组长",
                mode="replace",
            )],
        )],
        new_characters=[DetectedNewCharacter(
            name="顾青",
            description="调查组新成员",
            evidence="新来的顾青递给他一份名单",
        )],
    )
    monkeypatch.setattr(ai_client, "generate_structured", AsyncMock(return_value=extraction))

    proposals, drafts = await detect_chapter_entity_changes(
        db,
        novel_id=novel.id,
        chapter_id=chapter.id,
        user_id=1,
    )

    assert (proposals, drafts) == (1, 1)
    proposal = db.query(WorldEntityChangeProposal).one()
    assert proposal.entity_id == entity.id
    assert proposal.status == "pending"
    assert proposal.delta["attributes"][0]["key"] == "身份"
    assert proposal.delta["attributes"][0]["old_value"] == "宣传委员"
    new_entity = db.query(WorldEntity).filter_by(novel_id=novel.id, name="顾青").one()
    assert new_entity.status == "draft"
    assert new_entity.entity_type == "Character"


@pytest.mark.asyncio
async def test_detection_filters_missing_evidence_and_deduplicates_names(db, chapter_world, monkeypatch):
    novel, chapter, _entity = chapter_world
    db.add(WorldEntity(
        novel_id=novel.id,
        name="调查组",
        entity_type="Faction",
        aliases=["顾青"],
        origin="manual",
        status="confirmed",
    ))
    db.commit()
    extraction = ChapterCharacterChangeExtraction(
        existing_changes=[DetectedExistingCharacterChange(
            entity_name="林野",
            summary="无证据变化",
            evidence="正文里不存在的句子",
            attributes=[DetectedAttributeChange(
                key="位置",
                new_value="省城",
                evidence="正文里不存在的句子",
            )],
        )],
        new_characters=[DetectedNewCharacter(
            name="顾青",
            evidence="新来的顾青递给他一份名单",
        )],
    )
    monkeypatch.setattr(ai_client, "generate_structured", AsyncMock(return_value=extraction))

    result = await detect_chapter_entity_changes(db, novel_id=novel.id, chapter_id=chapter.id)

    assert result == (0, 0)
    assert db.query(WorldEntityChangeProposal).count() == 0
    assert db.query(WorldEntity).filter_by(novel_id=novel.id, name="顾青").count() == 0


@pytest.mark.asyncio
async def test_detection_keeps_core_change_when_extension_limit_is_reached(db, chapter_world, monkeypatch):
    novel, chapter, entity = chapter_world
    for index in range(MAX_AUTO_EXTENSION_ATTRIBUTES):
        db.add(WorldEntityAttribute(
            entity_id=entity.id,
            key=f"特殊字段{index}",
            surface=f"旧值{index}",
            visibility="active",
            origin="manual",
            sort_order=index + 1,
        ))
    db.commit()
    extraction = ChapterCharacterChangeExtraction(
        existing_changes=[DetectedExistingCharacterChange(
            entity_name="林野",
            summary="位置和特殊字段变化",
            evidence="林野赶到县城",
            attributes=[
                DetectedAttributeChange(key="额外特殊字段", new_value="不应新增", evidence="林野赶到县城"),
                DetectedAttributeChange(key="所在地点", new_value="县城", evidence="林野赶到县城"),
            ],
        )],
    )
    monkeypatch.setattr(ai_client, "generate_structured", AsyncMock(return_value=extraction))

    result = await detect_chapter_entity_changes(db, novel_id=novel.id, chapter_id=chapter.id)

    assert result == (1, 0)
    proposal = db.query(WorldEntityChangeProposal).one()
    assert [item["key"] for item in proposal.delta["attributes"]] == ["位置"]


@pytest.mark.asyncio
async def test_important_experience_is_archived_without_pending_review(db, chapter_world, monkeypatch):
    novel, chapter, entity = chapter_world
    extraction = ChapterCharacterChangeExtraction(
        existing_changes=[DetectedExistingCharacterChange(
            entity_name="林野",
            summary="林野接手县城调查",
            evidence="正式成为调查组组长",
            attributes=[
                DetectedAttributeChange(
                    key="经历",
                    new_value="正式接手县城调查并承担调查结果责任",
                    evidence="正式成为调查组组长",
                    mode="append",
                    importance="major",
                    future_impact="此后需要主导调查，并对调查结果负责",
                ),
                DetectedAttributeChange(
                    key="经历记录",
                    new_value="赶到县城",
                    evidence="林野赶到县城",
                    mode="append",
                    importance="minor",
                    future_impact="只是普通移动",
                ),
            ],
        )],
    )
    monkeypatch.setattr(ai_client, "generate_structured", AsyncMock(return_value=extraction))

    result = await detect_chapter_entity_changes(db, novel_id=novel.id, chapter_id=chapter.id)

    assert result == (0, 0)
    assert db.query(WorldEntityChangeProposal).count() == 0
    history = db.query(WorldEntityAttribute).filter_by(entity_id=entity.id, key="经历记录").one()
    assert history.surface == "第2章：正式接手县城调查并承担调查结果责任"

    repeated = ChapterCharacterChangeExtraction(
        existing_changes=[DetectedExistingCharacterChange(
            entity_name="林野",
            summary="重复扫描同一经历",
            evidence="正式成为调查组组长",
            attributes=[DetectedAttributeChange(
                key="经历记录",
                new_value="接手县城调查，并开始承担最终调查责任",
                evidence="正式成为调查组组长",
                importance="major",
                future_impact="后续调查都需要由林野负责推进和决断",
            )],
        )],
    )
    monkeypatch.setattr(ai_client, "generate_structured", AsyncMock(return_value=repeated))
    await detect_chapter_entity_changes(db, novel_id=novel.id, chapter_id=chapter.id)

    db.refresh(history)
    assert history.surface.count("第2章：") == 1


def test_apply_change_replaces_appends_and_preserves_history(db, chapter_world):
    novel, chapter, entity = chapter_world
    proposal = WorldEntityChangeProposal(
        novel_id=novel.id,
        chapter_id=chapter.id,
        chapter_number=chapter.chapter_number,
        entity_id=entity.id,
        entity_name=entity.name,
        summary="身份和经历发生变化",
        evidence="正式成为调查组组长",
        delta={
            "aliases": ["林组长"],
            "description_append": "开始负责县城调查",
            "attributes": [
                {"key": "身份", "old_value": "宣传委员", "new_value": "调查组组长", "mode": "replace", "evidence": "正式成为调查组组长"},
                {"key": "经历", "old_value": "", "new_value": "接手县城调查", "mode": "append", "evidence": "林野赶到县城"},
            ],
        },
        fingerprint="apply-test",
        status="pending",
    )
    db.add(proposal)
    db.commit()

    applied = apply_entity_change_proposal(novel.id, proposal.id, user_id=1, db=db)

    assert applied.status == "applied"
    db.refresh(entity)
    assert "林组长" in entity.aliases
    assert "第2章：开始负责县城调查" in entity.description
    attributes = {item.key: item.surface for item in db.query(WorldEntityAttribute).filter_by(entity_id=entity.id)}
    assert attributes["身份"] == "调查组组长"
    assert attributes["经历记录"] == "第2章：接手县城调查"
    assert "第2章：身份：宣传委员 → 调查组组长" in attributes["变更记录"]


def test_apply_change_limits_automatic_extension_attributes(db, chapter_world):
    novel, chapter, entity = chapter_world
    for index in range(MAX_AUTO_EXTENSION_ATTRIBUTES):
        db.add(WorldEntityAttribute(
            entity_id=entity.id,
            key=f"特殊字段{index}",
            surface=f"旧值{index}",
            visibility="active",
            origin="manual",
            sort_order=index + 1,
        ))
    proposal = WorldEntityChangeProposal(
        novel_id=novel.id,
        chapter_id=chapter.id,
        chapter_number=chapter.chapter_number,
        entity_id=entity.id,
        entity_name=entity.name,
        summary="尝试增加过多特殊属性",
        evidence="正式成为调查组组长",
        delta={"attributes": [
            {"key": "额外特殊字段", "new_value": "不应新增", "mode": "replace"},
            {"key": "当前位置", "new_value": "县城", "mode": "replace"},
        ]},
        fingerprint="extension-limit-test",
        status="pending",
    )
    db.add(proposal)
    db.commit()

    apply_entity_change_proposal(novel.id, proposal.id, user_id=1, db=db)

    attributes = {item.key: item.surface for item in db.query(WorldEntityAttribute).filter_by(entity_id=entity.id)}
    assert "额外特殊字段" not in attributes
    assert attributes["位置"] == "县城"


def test_reject_change_keeps_entity_unchanged(db, chapter_world):
    novel, chapter, entity = chapter_world
    proposal = WorldEntityChangeProposal(
        novel_id=novel.id,
        chapter_id=chapter.id,
        chapter_number=chapter.chapter_number,
        entity_id=entity.id,
        entity_name=entity.name,
        summary="身份变化",
        evidence="正式成为调查组组长",
        delta={"attributes": [{"key": "身份", "new_value": "调查组组长", "mode": "replace"}]},
        fingerprint="reject-test",
        status="pending",
    )
    db.add(proposal)
    db.commit()

    rejected = reject_entity_change_proposal(novel.id, proposal.id, user_id=1, db=db)

    assert rejected.status == "rejected"
    identity = db.query(WorldEntityAttribute).filter_by(entity_id=entity.id, key="身份").one()
    assert identity.surface == "宣传委员"


def test_entity_change_api_lists_and_applies_pending_change(db, chapter_world):
    from app.api import world

    novel, chapter, entity = chapter_world
    proposal = WorldEntityChangeProposal(
        novel_id=novel.id,
        chapter_id=chapter.id,
        chapter_number=chapter.chapter_number,
        entity_id=entity.id,
        entity_name=entity.name,
        summary="身份变化",
        evidence="正式成为调查组组长",
        delta={"attributes": [{"key": "身份", "new_value": "调查组组长", "mode": "replace"}]},
        fingerprint="api-test",
        status="pending",
    )
    db.add(proposal)
    db.commit()

    app = FastAPI()
    app.include_router(world.router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user_or_default] = lambda: User(
        id=1,
        username="testuser",
        hashed_password="x",
        role="admin",
        is_active=True,
    )

    with TestClient(app) as client:
        listed = client.get(f"/api/novels/{novel.id}/world/entity-changes")
        applied = client.post(f"/api/novels/{novel.id}/world/entity-changes/{proposal.id}/apply")

    assert listed.status_code == 200
    assert listed.json()[0]["summary"] == "身份变化"
    assert applied.status_code == 200
    assert applied.json()["status"] == "applied"
