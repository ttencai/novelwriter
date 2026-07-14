from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from app.config import get_settings


@dataclass(frozen=True)
class SkillItem:
    name: str
    enabled: bool
    path: str
    has_readme: bool
    has_skill_file: bool
    source: str = "common"


@dataclass(frozen=True)
class SkillGroup:
    name: str
    path: str
    skill_count: int
    enabled_count: int
    skills: list[SkillItem]


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _resolve_configured_dir(value: str) -> Path:
    raw = Path(value).expanduser()
    if raw.is_absolute():
        return raw.resolve()
    return (_repo_root() / raw).resolve()


def common_skills_dir() -> Path:
    return _resolve_configured_dir(get_settings().skills_common_dir)


def _is_skill_dir(path: Path) -> bool:
    if not path.is_dir():
        return False
    return (path / "SKILL.md").is_file() or (path / "skill.md").is_file() or (path / "README.md").is_file()


def _relative_display_path(path: Path) -> str:
    try:
        return path.resolve().relative_to(_repo_root()).as_posix()
    except ValueError:
        return path.resolve().as_posix()


def _skill_item(path: Path) -> SkillItem:
    disabled_marker = path / ".disabled"
    return SkillItem(
        name=path.name,
        enabled=not disabled_marker.exists(),
        path=_relative_display_path(path),
        has_readme=(path / "README.md").is_file(),
        has_skill_file=(path / "SKILL.md").is_file() or (path / "skill.md").is_file(),
    )


def scan_common_skill_groups() -> list[SkillGroup]:
    common_dir = common_skills_dir()
    common_dir.mkdir(parents=True, exist_ok=True)
    groups: list[SkillGroup] = []

    for group_dir in sorted((p for p in common_dir.iterdir() if p.is_dir()), key=lambda p: p.name.lower()):
        child_skill_dirs = [p for p in sorted(group_dir.iterdir(), key=lambda p: p.name.lower()) if _is_skill_dir(p)]
        if child_skill_dirs:
            skills = [_skill_item(p) for p in child_skill_dirs]
        elif _is_skill_dir(group_dir):
            skills = [_skill_item(group_dir)]
        else:
            skills = []

        if not skills:
            continue
        groups.append(
            SkillGroup(
                name=group_dir.name,
                path=_relative_display_path(group_dir),
                skill_count=len(skills),
                enabled_count=sum(1 for item in skills if item.enabled),
                skills=skills,
            )
        )

    return groups


def count_common_skills() -> int:
    return sum(group.skill_count for group in scan_common_skill_groups())


def _read_markdown_file(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig", errors="replace").strip()


def _skill_markdown_files(skill_dir: Path) -> list[Path]:
    files: list[Path] = []
    for name in ("SKILL.md", "skill.md", "README.md"):
        candidate = skill_dir / name
        if candidate.is_file():
            files.append(candidate)
            break

    references_dir = skill_dir / "references"
    if references_dir.is_dir():
        files.extend(
            sorted(
                (p for p in references_dir.rglob("*.md") if p.is_file()),
                key=lambda p: p.relative_to(references_dir).as_posix().lower(),
            )
        )
    return files



def _load_common_novel_writing_skill_dir(skill_dir: Path) -> str:
    if not _is_skill_dir(skill_dir) or (skill_dir / ".disabled").exists():
        return ""

    file_sections: list[str] = []
    for md_file in _skill_markdown_files(skill_dir):
        content = _read_markdown_file(md_file)
        if not content:
            continue
        relative_path = _relative_display_path(md_file)
        file_sections.append(f"## {relative_path}\n\n{content}")

    if not file_sections:
        return ""

    return (
        f"<skill name=\"{skill_dir.name}\">\n"
        + "\n\n".join(file_sections)
        + "\n</skill>"
    )


def load_common_novel_writing_skill(skill_name: str) -> str:
    """Load one enabled skill under common/novel-writing by folder name."""
    normalized = (skill_name or "").strip()
    if not normalized:
        return ""
    skill_dir = common_skills_dir() / "novel-writing" / normalized
    return _load_common_novel_writing_skill_dir(skill_dir)

def load_common_novel_writing_skills() -> str:
    """Load enabled skills under common/novel-writing for continuation prompts."""
    group_dir = common_skills_dir() / "novel-writing"
    if not group_dir.is_dir():
        return ""

    skill_dirs = [
        p
        for p in sorted(group_dir.iterdir(), key=lambda item: item.name.lower())
        if _is_skill_dir(p) and not (p / ".disabled").exists()
    ]
    if not skill_dirs and _is_skill_dir(group_dir) and not (group_dir / ".disabled").exists():
        skill_dirs = [group_dir]

    sections = [section for skill_dir in skill_dirs if (section := _load_common_novel_writing_skill_dir(skill_dir))]

    if not sections:
        return ""

    return (
        "<novel_writing_skills>\n"
        "以下是本项目 common/novel-writing 目录下的共用写作 skills。"
        "续写时必须把它们作为写作规则使用；如果多份规则同时存在，需要共同遵守。"
        "只学习写法和约束，不复用其中示例的人物、桥段、设定或原句。\n\n"
        + "\n\n".join(sections)
        + "\n</novel_writing_skills>"
    )
