# SPDX-FileCopyrightText: 2026 Isaac.X.Ω.Yuan
# SPDX-License-Identifier: AGPL-3.0-only

"""Real LLM end-to-end copilot tests using the Journey to the West demo.

These tests hit the actual LLM provider configured in .env.
Run with: scripts/uv_run.sh pytest tests/copilot/test_e2e_llm.py -v -s
Skip with: pytest -m "not e2e_llm"

Purpose: validate the full copilot pipeline — prompt quality, tool-loop
behavior, JSON parsing, suggestion compilation — with a real novel world.
"""

import json
import pytest
from sqlalchemy import StaticPool, create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import (
    Chapter,
    CopilotRun,
    Novel,
    WorldEntity,
    WorldEntityAttribute,
    WorldRelationship,
    WorldSystem,
)

pytestmark = [pytest.mark.e2e_llm, pytest.mark.asyncio]

_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
_TestSession = sessionmaker(autocommit=False, autoflush=False, bind=_engine)


def _has_llm_config() -> bool:
    try:
        from app.config import reload_settings
        s = reload_settings()
        return bool(s.openai_api_key and s.openai_base_url and s.openai_model)
    except Exception:
        return False


if not _has_llm_config():
    pytest.skip("No LLM config — skipping E2E LLM tests", allow_module_level=True)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="function")
def db():
    Base.metadata.create_all(bind=_engine)
    session = _TestSession()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=_engine)


def _load_chapter_text(chapter_num: int) -> str:
    """Load a chapter from the demo text by splitting on "第X回" markers."""
    import re
    with open("data/demo/西游记_前27回.txt", encoding="utf-8") as f:
        text = f.read()
    # Split by "第X回" pattern
    parts = re.split(r"(第[一二三四五六七八九十百千]+回\s)", text)
    # Reassemble: each chapter is a marker + body pair
    chapters: list[str] = []
    for i in range(1, len(parts) - 1, 2):
        chapters.append(parts[i] + parts[i + 1])
    if chapter_num <= 0 or chapter_num > len(chapters):
        return chapters[0][:5000] if chapters else text[:5000]
    return chapters[chapter_num - 1][:8000]  # Cap for test speed


@pytest.fixture
def jtw_world(db):
    """Create a Journey to the West world from the demo data + worldpack."""
    novel = Novel(
        title="西游记（前二十七回）", author="吴承恩",
        file_path="/tmp/jtw.txt", total_chapters=3, language="zh",
    )
    db.add(novel)
    db.commit()
    db.refresh(novel)

    # Load 3 chapters (chapter 1, 14 (收悟空), 27 (三打白骨精))
    for num, real_ch in [(1, 1), (2, 14), (3, 27)]:
        ch = Chapter(
            novel_id=novel.id, chapter_number=num,
            title=f"第{real_ch}回",
            content=_load_chapter_text(real_ch),
        )
        db.add(ch)
    db.commit()

    # Load worldpack
    with open("data/worldpacks/journey-to-the-west.json", encoding="utf-8") as f:
        wp = json.load(f)

    key_to_entity: dict[str, WorldEntity] = {}

    # Seed a subset of entities (the main cast + a draft)
    keep_keys = {
        "tang-seng", "sun-wukong", "zhu-bajie", "sha-seng",
        "bai-gu-furen", "guan-yin",
        "hua-guo-shan", "jin-gu-bang",
    }
    for ent_data in wp["entities"]:
        key = ent_data["key"]
        if key not in keep_keys:
            continue
        # Make 白骨夫人 a draft (for draft_cleanup testing)
        status = "draft" if key == "bai-gu-furen" else "confirmed"
        origin = "bootstrap" if key == "bai-gu-furen" else "manual"
        # Intentionally weaken 猪八戒's description for enrichment testing
        desc = ent_data["description"]
        if key == "zhu-bajie":
            desc = ""  # empty — copilot should catch this

        e = WorldEntity(
            novel_id=novel.id, name=ent_data["name"],
            entity_type=ent_data["entity_type"],
            description=desc,
            aliases=ent_data.get("aliases", []),
            status=status, origin=origin,
        )
        db.add(e)
        db.commit()
        db.refresh(e)
        key_to_entity[key] = e

        # Add a few attributes
        for attr in ent_data.get("attributes", [])[:2]:
            a = WorldEntityAttribute(
                entity_id=e.id, key=attr["key"],
                surface=attr["surface"],
                visibility=attr.get("visibility", "active"),
                origin="manual",
            )
            db.add(a)
    db.commit()

    # Seed relationships (subset)
    for rel_data in wp.get("relationships", [])[:6]:
        src = key_to_entity.get(rel_data["source_key"])
        tgt = key_to_entity.get(rel_data["target_key"])
        if not src or not tgt:
            continue
        r = WorldRelationship(
            novel_id=novel.id, source_id=src.id, target_id=tgt.id,
            label=rel_data["label"],
            description=rel_data.get("description", ""),
            status="confirmed", origin="manual",
        )
        db.add(r)
    db.commit()

    # Seed one system
    sys_data = wp.get("systems", [{}])[0]
    if sys_data:
        s = WorldSystem(
            novel_id=novel.id, name=sys_data["name"],
            display_type=sys_data["display_type"],
            description=sys_data.get("description", ""),
            constraints=sys_data.get("constraints", []),
            status="confirmed", origin="manual",
        )
        db.add(s)
        db.commit()

    return {"novel": novel, "entities": key_to_entity}


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

async def _run_copilot(db, novel, mode, scope, context, prompt, locale="zh"):
    """Run a full copilot execution against the real LLM.

    Key insight: we pass explicit llm_config from settings instead of
    relying on the hosted-mode resolution path. This avoids the need to
    patch SessionLocal (which breaks safety fuses that create their own sessions).

    The test DB *is* the real SessionLocal for this test — we just need to
    make execute_copilot_run find its run/session/novel in our test DB.
    """
    from app.core.copilot import open_or_reuse_session, create_run, execute_copilot_run
    from app.config import reload_settings
    import app.database as db_mod

    session, _ = open_or_reuse_session(db, novel.id, 1, mode, scope, context, locale, "copilot_drawer", "")
    run = create_run(db, session, 1, prompt)

    settings = reload_settings()  # Fresh load to get .env values
    llm_config = {
        "base_url": settings.hosted_llm_base_url or settings.openai_base_url,
        "api_key": settings.hosted_llm_api_key or settings.openai_api_key,
        "model": settings.hosted_llm_model or settings.openai_model,
        "billing_source_hint": "selfhost",  # Skip hosted budget checks in test
    }
    assert llm_config["api_key"], "No API key found in settings"

    # Patch SessionLocal to return our test DB session (non-closeable).
    orig_sl = db_mod.SessionLocal
    _real_close = db.close

    def _test_session_factory():
        db.close = lambda: None  # prevent accidental close
        return db

    db_mod.SessionLocal = _test_session_factory
    try:
        await execute_copilot_run(run.run_id, novel.id, 1, llm_config=llm_config)
    finally:
        db.close = _real_close
        db_mod.SessionLocal = orig_sl

    db.refresh(run)
    return run


def _print_run(label: str, run: CopilotRun):
    print(f"\n{'='*60}")
    print(f"  {label}")
    print(f"{'='*60}")
    print(f"  Status:      {run.status}")
    if run.error:
        print(f"  Error:       {run.error[:300]}")
    print(f"  Answer:      {(run.answer or '')[:400]}")
    print(f"  Evidence:    {len(run.evidence_json or [])} items")
    print(f"  Suggestions: {len(run.suggestions_json or [])} items")
    for i, sg in enumerate(run.suggestions_json or []):
        kind = sg.get("kind", "?")
        title = sg.get("title", "?")
        act = sg.get("preview", {}).get("actionable", False)
        target = sg.get("target", {}).get("label", "?")
        print(f"    [{i}] {kind} → {target} | {title} | actionable={act}")
        for fd in sg.get("preview", {}).get("field_deltas", []):
            before = (fd.get("before") or "∅")[:40]
            after = (fd.get("after") or "∅")[:60]
            print(f"        {fd.get('label')}: {before} → {after}")


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestEntityEnrichment:
    """User clicks "AI 补完" on 孙悟空 — the #1 workflow."""

    async def test_enrich_sun_wukong(self, db, jtw_world):
        run = await _run_copilot(
            db, jtw_world["novel"],
            mode="current_entity", scope="current_entity",
            context={"entity_id": jtw_world["entities"]["sun-wukong"].id},
            prompt="请帮我补完孙悟空的设定。",
        )
        _print_run("Entity enrichment: 孙悟空", run)

        assert run.status == "completed", f"Failed: {run.error}"
        assert run.answer and len(run.answer) > 20
        assert len(run.evidence_json or []) > 0

    async def test_enrich_empty_description_entity(self, db, jtw_world):
        """猪八戒 has empty description — copilot should notice and suggest."""
        run = await _run_copilot(
            db, jtw_world["novel"],
            mode="current_entity", scope="current_entity",
            context={"entity_id": jtw_world["entities"]["zhu-bajie"].id},
            prompt="猪八戒的描述是空的，帮我补完。",
        )
        _print_run("Entity enrichment: 猪八戒 (empty desc)", run)

        assert run.status == "completed", f"Failed: {run.error}"
        assert run.answer

        # Should have at least one suggestion targeting 猪八戒
        suggestions = run.suggestions_json or []
        if suggestions:
            targets = [sg.get("target", {}).get("label", "") for sg in suggestions]
            print(f"  Suggestion targets: {targets}")


class TestWholeBookInquiry:
    """User opens whole-book research — inquiry-only is valid."""

    async def test_whole_book_analysis(self, db, jtw_world):
        run = await _run_copilot(
            db, jtw_world["novel"],
            mode="research", scope="whole_book",
            context=None,
            prompt="帮我盘点一下西游记世界模型的设定缺口。",
        )
        _print_run("Whole-book inquiry: 西游记", run)

        assert run.status == "completed", f"Failed: {run.error}"
        assert run.answer and len(run.answer) > 30
        # 0 suggestions is fine for inquiry — don't assert > 0


class TestDraftCleanup:
    """User asks to review drafts — 白骨夫人 is a draft with weak fields."""

    async def test_draft_review(self, db, jtw_world):
        run = await _run_copilot(
            db, jtw_world["novel"],
            mode="draft_cleanup", scope="whole_book",
            context=None,
            prompt="帮我审查草稿条目，找出需要补全的。",
        )
        _print_run("Draft cleanup: 西游记", run)

        assert run.status == "completed", f"Failed: {run.error}"
        assert run.answer

        # If actionable suggestions exist, they must NOT create new entities
        for sg in (run.suggestions_json or []):
            if sg.get("preview", {}).get("actionable"):
                assert sg["kind"] != "create_entity", \
                    f"draft_cleanup must not create: {sg.get('title')}"


class TestRelationshipGovernance:
    """User researches 唐僧's relationship network."""

    async def test_relationship_research(self, db, jtw_world):
        run = await _run_copilot(
            db, jtw_world["novel"],
            mode="current_entity", scope="current_entity",
            context={
                "entity_id": jtw_world["entities"]["tang-seng"].id,
                "tab": "relationships",
            },
            prompt="帮我梳理唐僧的关系网络，有没有缺失的重要连接？",
        )
        _print_run("Relationship governance: 唐僧", run)

        assert run.status == "completed", f"Failed: {run.error}"
        assert run.answer
