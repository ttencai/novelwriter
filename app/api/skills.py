from fastapi import APIRouter, Depends

from app.core.auth import get_current_user_or_default
from app.core.skills import count_common_skills, scan_common_skill_groups
from app.schemas import SkillGroupResponse, SkillItemResponse, SkillsResponse, SkillsSummaryResponse

router = APIRouter(prefix="/api/skills", tags=["skills"])


@router.get("", response_model=SkillsResponse)
def list_skills(_current_user=Depends(get_current_user_or_default)) -> SkillsResponse:
    groups = scan_common_skill_groups()
    total = sum(group.skill_count for group in groups)
    enabled = sum(group.enabled_count for group in groups)
    common = count_common_skills()

    return SkillsResponse(
        summary=SkillsSummaryResponse(
            total=total,
            common=common,
            user=0,
            enabled=enabled,
        ),
        groups=[
            SkillGroupResponse(
                name=group.name,
                path=group.path,
                skill_count=group.skill_count,
                enabled_count=group.enabled_count,
                skills=[
                    SkillItemResponse(
                        name=item.name,
                        enabled=item.enabled,
                        path=item.path,
                        has_readme=item.has_readme,
                        has_skill_file=item.has_skill_file,
                        source=item.source,
                    )
                    for item in group.skills
                ],
            )
            for group in groups
        ],
    )
