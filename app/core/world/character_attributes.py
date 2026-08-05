"""角色属性的统一命名、数量控制与续写上下文筛选。"""

from __future__ import annotations

import re
from typing import Any, Iterable, Mapping


# 固定属性只保存会直接影响后续描写的稳定设定或当前状态。
CORE_CHARACTER_ATTRIBUTE_ORDER = (
    "身份",
    "性格",
    "价值观",
    "底线",
    "阵营",
    "位置",
    "当前状态",
    "身体状态",
    "目标",
    "动机",
    "能力",
    "持有物",
    "认知",
    "外貌",
    "秘密",
    "习惯",
)

# 生成内容必须回答“写下一段时有什么用”，避免把简介拆成大量重复字段。
CHARACTER_ATTRIBUTE_CONTENT_RULES: dict[str, str] = {
    "身份": "当前职业、称号、社会角色或稳定归属；人物关系写入关系数据，不在此重复",
    "性格": "跨场景稳定、会影响语言和决策方式的特征，不记录临时情绪",
    "价值观": "长期认可和优先维护的事物，不重复具体目标",
    "底线": "明确不会做、不能接受或必然反击的边界",
    "阵营": "当前明确所属或效忠的组织势力；身份已包含时不重复",
    "位置": "续写起点所需的当前地点，变化时直接替换",
    "当前状态": "正在持续的处境、任务或冲突，不写一次性动作",
    "身体状态": "会影响行动和描写的伤病、体力或异常状态",
    "目标": "当前阶段准备达成的结果，完成或改变后替换",
    "动机": "驱动目标的深层原因；与目标同义时只保留目标",
    "能力": "已掌握且可用于剧情的技能、力量及明确限制",
    "持有物": "后续可能使用的重要物品或稀缺资源，不记录普通随身物",
    "认知": "会影响判断的已知、误解或尚未知晓的信息",
    "外貌": "稳定且便于描写、辨认的特征，不重复身体状态",
    "秘密": "人物刻意隐瞒且可能影响剧情的信息",
    "习惯": "跨场景反复出现、能稳定影响动作或语言的习惯",
}

HISTORY_CHARACTER_ATTRIBUTE_KEYS = frozenset({"经历记录", "成长记录", "变更记录"})

# 自动识别只能使用固定字段，手工编辑仍保持自由。
MAX_AUTO_EXTENSION_ATTRIBUTES = 0
MAX_AUTO_CHARACTER_ATTRIBUTES = 12
MAX_WRITER_CHARACTER_ATTRIBUTES = 12
MAX_HISTORY_ATTRIBUTE_LINES = 80
MAX_HISTORY_ATTRIBUTE_CHARS = 8000
MAX_HISTORY_EVENT_CHARS = 160

_ATTRIBUTE_ALIASES: dict[str, tuple[str, ...]] = {
    "身份": ("当前身份", "职业", "职位", "职务", "社会身份", "角色身份", "称号", "identity", "role", "occupation"),
    "阵营": ("所属阵营", "所属势力", "势力", "立场", "政治立场", "门派", "组织归属", "faction", "affiliation"),
    "位置": ("当前位置", "所在位置", "所在地点", "地点", "去向", "location", "current location"),
    "当前状态": ("状态", "当前处境", "处境", "当前情况", "行动状态", "status", "current status"),
    "身体状态": ("伤势", "健康状态", "健康状况", "身体情况", "生理状态", "physical status", "health"),
    "目标": ("当前目标", "行动目标", "目的", "诉求", "当前诉求", "goal", "objective"),
    "动机": ("行动动机", "核心动机", "意图", "驱动力", "motivation"),
    "能力": (
        "技能", "本领", "特长", "功法", "招式", "特殊能力", "修为", "境界", "等级", "实力",
        "战力", "战力等级", "ability", "abilities", "skill", "skills", "power level", "rank",
    ),
    "持有物": ("物品", "持有物品", "装备", "道具", "随身物品", "资源", "inventory", "equipment"),
    "认知": ("已知信息", "知道的事", "认知状态", "掌握信息", "情报", "knowledge", "awareness"),
    "关系状态": ("关系", "人物关系", "人际关系", "感情状态", "婚姻状态", "relationship", "relationships"),
    "性格": ("性格特点", "性格特征", "人格特征", "脾气", "personality", "traits"),
    "价值观": ("价值取向", "观念", "信念", "核心信念", "values", "beliefs"),
    "底线": ("原则", "行为底线", "禁忌", "不可触碰之事", "principles", "boundaries"),
    "外貌": ("外貌特征", "容貌", "穿着", "衣着", "形象", "appearance"),
    "秘密": ("隐藏信息", "隐秘", "隐瞒事项", "个人秘密", "secret", "secrets"),
    "习惯": ("行为习惯", "生活习惯", "口头习惯", "习性", "habit", "habits"),
    "经历记录": ("经历", "履历", "重要经历", "重大事件", "长期记录", "事件记录", "experience", "history"),
    "成长记录": ("成长", "角色成长", "弧光变化", "角色弧光", "心理成长", "growth", "character arc"),
    "变更记录": ("属性变更", "状态变更记录", "修改记录"),
}


def _normalize_key(value: str) -> str:
    """生成仅用于属性名比较的稳定形式。"""
    return re.sub(r"[\s_\-—:：/\\（）()【】\[\]]+", "", (value or "").strip()).casefold()


_CANONICAL_BY_NORMALIZED = {
    _normalize_key(alias): canonical
    for canonical, aliases in _ATTRIBUTE_ALIASES.items()
    for alias in (canonical, *aliases)
}


def canonicalize_character_attribute_key(key: str) -> str:
    """将常见同义属性归并到固定字段，未知字段保留原名。"""
    stripped = (key or "").strip()
    return _CANONICAL_BY_NORMALIZED.get(_normalize_key(stripped), stripped)


def is_core_character_attribute(key: str) -> bool:
    return canonicalize_character_attribute_key(key) in CORE_CHARACTER_ATTRIBUTE_ORDER


def is_history_character_attribute(key: str) -> bool:
    return canonicalize_character_attribute_key(key) in HISTORY_CHARACTER_ATTRIBUTE_KEYS


def count_extension_character_attributes(keys: Iterable[str]) -> int:
    """统计去重后的特殊属性数量。"""
    extensions = {
        canonicalize_character_attribute_key(key)
        for key in keys
        if key
        and not is_core_character_attribute(key)
        and not is_history_character_attribute(key)
    }
    return len(extensions)


def append_bounded_history(current: str, line: str) -> str:
    """追加一条历史记录，并保留最近的有限条目和字符数。"""
    normalized_line = " ".join((line or "").split()).strip()[:MAX_HISTORY_EVENT_CHARS]
    lines = [item.strip() for item in (current or "").splitlines() if item.strip()]
    if not normalized_line or normalized_line in lines:
        return "\n".join(lines)

    lines.append(normalized_line)
    lines = lines[-MAX_HISTORY_ATTRIBUTE_LINES:]
    while lines and len("\n".join(lines)) > MAX_HISTORY_ATTRIBUTE_CHARS:
        lines.pop(0)
    return "\n".join(lines)


def filter_character_attributes_for_writer(
    attributes: Iterable[Mapping[str, Any]],
    *,
    chapter_text: str,
    limit: int = MAX_WRITER_CHARACTER_ATTRIBUTES,
) -> list[dict[str, Any]]:
    """去掉历史字段、合并同义字段，并限制写作上下文中的属性数量。"""
    if limit <= 0:
        return []

    grouped: dict[str, dict[str, Any]] = {}
    for raw in attributes:
        item = dict(raw)
        original_key = str(item.get("key") or "").strip()
        canonical_key = canonicalize_character_attribute_key(original_key)
        if not canonical_key or is_history_character_attribute(canonical_key):
            continue

        current = grouped.get(canonical_key)
        if current is None or _prefer_attribute(item, current, canonical_key):
            grouped[canonical_key] = item

    normalized_text = _normalize_key(chapter_text)
    core_order = {key: index for index, key in enumerate(CORE_CHARACTER_ATTRIBUTE_ORDER)}

    def sort_key(entry: tuple[str, dict[str, Any]]) -> tuple[int, int, int, str]:
        canonical_key, item = entry
        surface = str(item.get("surface") or "")
        mentioned = _normalize_key(canonical_key) in normalized_text
        if not mentioned and 2 <= len(_normalize_key(surface)) <= 40:
            mentioned = _normalize_key(surface) in normalized_text
        is_extension = canonical_key not in core_order
        return (
            0 if mentioned else 1,
            1 if is_extension else 0,
            core_order.get(canonical_key, int(item.get("sort_order") or 0)),
            canonical_key,
        )

    selected = sorted(grouped.items(), key=sort_key)[:limit]
    return [item for _canonical_key, item in selected]


def _prefer_attribute(candidate: Mapping[str, Any], current: Mapping[str, Any], canonical_key: str) -> bool:
    """同义字段冲突时优先保留标准名和可直接写作的字段。"""
    candidate_key = str(candidate.get("key") or "").strip()
    current_key = str(current.get("key") or "").strip()
    candidate_rank = (
        0 if candidate_key == canonical_key else 1,
        0 if candidate.get("visibility") == "active" else 1,
        int(candidate.get("sort_order") or 0),
    )
    current_rank = (
        0 if current_key == canonical_key else 1,
        0 if current.get("visibility") == "active" else 1,
        int(current.get("sort_order") or 0),
    )
    return candidate_rank < current_rank
