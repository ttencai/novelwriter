from app.core.indexing.builder import (
    ChapterText,
    build_window_index,
    compute_cooccurrence,
    detect_language,
    extract_candidates,
    load_common_words,
)
from app.core.indexing.window_index import NovelIndex


def test_detect_language_by_space_ratio():
    assert detect_language("Alice and Bob walked home.") == "en"
    assert detect_language("云澈看向远方，楚月仙站在雪中。") == "zh"
    assert detect_language("勇者は城へ向かった。") == "ja"
    assert detect_language("민수는 집으로 돌아갔다.") == "ko"


def test_extract_candidates_filters_short_tokens_and_stop_words():
    tokens = ["a", "the", "Alice", "Alice", "Bob", "and", "Bob", "city"]
    common_words = {"the", "and"}

    candidates = extract_candidates(tokens, common_words)
    assert candidates == {"Alice": 2, "Bob": 2, "city": 1}


def test_load_common_words_merges_primary_and_fallback_language_files(tmp_path):
    common_words_dir = tmp_path / "common_words"
    common_words_dir.mkdir(parents=True)
    (common_words_dir / "en.txt").write_text("the\nand\n", encoding="utf-8")
    (common_words_dir / "zh.txt").write_text("没有\n什么\n", encoding="utf-8")

    words_for_en = load_common_words("en", common_words_dir=str(common_words_dir))
    words_for_zh = load_common_words("zh", common_words_dir=str(common_words_dir))

    assert "the" in words_for_en
    assert "没有" in words_for_en
    assert "the" in words_for_zh
    assert "没有" in words_for_zh


def test_load_common_words_reuses_cjk_bucket_for_japanese(tmp_path):
    common_words_dir = tmp_path / "common_words"
    common_words_dir.mkdir(parents=True)
    (common_words_dir / "en.txt").write_text("the\nand\n", encoding="utf-8")
    (common_words_dir / "zh.txt").write_text("没有\n什么\n", encoding="utf-8")

    words_for_ja = load_common_words("ja", common_words_dir=str(common_words_dir))

    assert "the" in words_for_ja
    assert "没有" in words_for_ja


def test_build_window_index_filters_low_window_count_candidates():
    chapters = [
        ChapterText(chapter_id=1, text="alice bob"),
        ChapterText(chapter_id=2, text="alice city"),
        ChapterText(chapter_id=3, text="alice"),
    ]
    candidates = {"alice": 3, "bob": 1, "city": 1}

    index, importance = build_window_index(
        chapters,
        candidates,
        window_size=500,
        window_step=250,
        min_window_count=2,
        min_window_ratio=0.0,
    )

    assert importance == {"alice": 3}
    assert set(index.entity_windows.keys()) == {"alice"}
    assert len(index.find_entity_passages("alice", limit=10)) == 3


def test_compute_cooccurrence_from_window_entities():
    index = NovelIndex(
        entity_windows={},
        window_entities={
            1: {"alice", "bob", "carol"},
            2: {"alice", "bob"},
            3: {"alice", "carol"},
        },
    )

    pairs = compute_cooccurrence(index)
    assert pairs[0] == ("alice", "bob", 2)
    assert pairs[1] == ("alice", "carol", 2)
    assert ("bob", "carol", 1) in pairs
