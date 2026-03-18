"""Indexing primitives and services."""

from .builder import (
    ChapterText,
    build_window_index,
    compute_cooccurrence,
    detect_language,
    extract_candidates,
    get_tokenizer,
    load_common_words,
    tokenize_text,
)
from .window_index import NovelIndex, WindowRef

__all__ = [
    "ChapterText",
    "NovelIndex",
    "WindowRef",
    "build_window_index",
    "compute_cooccurrence",
    "detect_language",
    "extract_candidates",
    "get_tokenizer",
    "load_common_words",
    "tokenize_text",
]
