from __future__ import annotations

from typing import Literal

ContinuationWritingMode = Literal["default", "story_long_write"]

STORY_LONG_WRITE_CONSTRAINTS_ZH = """<story_long_write_mode>
【长篇网文写作模式】
- 每个场景必须服务一个明确情绪目标；如果用户指令没写清，就从上文冲突、角色关系和章尾钩子里推断。
- 续写要像日更正文，不要写设定说明、拆文分析、大纲、报告或作者旁白。
- 优先推进当前主线冲突；一章里至少形成“原因 → 行动 → 结果 → 新问题/钩子”的链条。
- 保留前文角色状态、信息差和错误认知；角色只能说出、想到自己在故事中知道的事。
- 对话要有潜台词和口语感，不要让角色把动机、设定、因果解释得过满。
- 爽点、反转、悬念必须从动作、对话、物件和局势变化里自然出现，不要用“这一刻”“他终于明白”“更大的风暴即将来临”这类总结升华句。
- 段落按镜头和动作变化自然断开；避免连续排比、模板化心理描写和通篇同长度段落。
- 心理活动尽量外化为动作、身体反应、停顿、错话或选择。
- 章尾用动作、对话、物件或未解决问题收束，留下下一章推动力。
</story_long_write_mode>"""

STORY_LONG_WRITE_CONSTRAINTS_EN = """<story_long_write_mode>
【Long-form web-novel mode】
- Every scene should deliver a clear emotional effect; infer it from the current conflict, relationships, and hook when the user does not specify one.
- Continue as publishable chapter prose. Do not output analysis, outline, reports, or author commentary.
- Push the current main conflict forward with a cause → action → result → new problem / hook chain.
- Preserve character state, information gaps, and mistaken beliefs. Characters may only think or say what they know in-story.
- Dialogue should feel spoken and carry subtext; do not over-explain motives, lore, or causality.
- Payoffs, reversals, and suspense must emerge through action, dialogue, objects, and situation changes, not summary lines.
- Break paragraphs by camera/action beats. Avoid serial parallelism, template psychology, and uniformly sized paragraphs.
- Externalize inner emotion through action, body response, hesitation, wrong words, or choices.
- End with an action, line, object, or unresolved problem that gives the next chapter momentum.
</story_long_write_mode>"""

STORY_DESLOP_PREVENTION_CONSTRAINTS_ZH = """<story_deslop_prevention>
【去 AI 味生成前约束】
- 这是生成前写作约束，不是生成后的润色任务；直接产出低 AI 味正文，不要输出检测报告、修改说明或去 AI 流程。
- 避免过度圆滑、工整、解释充分；优先写具体动作、物件变化、对话反应和场景内后果。
- 禁止使用高频 AI 句式：不是 A 而是 B、声音不大却带着、眼中闪过一丝、嘴角勾起一抹、心中涌起一股、他终于明白、她不知道的是、更大的风暴即将来临。
- 少用或不用：仿佛、犹如、宛若、如同、一丝、一抹、些许、几分、深吸一口气、缓缓、不禁、微微、轻轻、淡淡、不由自主、显而易见、毫无疑问、不容置疑。
- 情绪不要直接告诉读者；把紧张、愤怒、悲伤、害怕、失望写成手抖、停顿、错话、沉默、摔东西、退后、移开视线等可见反应。
- 对话要像人说话：可以答非所问、停顿、打断、含糊；不要让角色把动机、设定、因果解释得过满。
- 段落按动作、镜头和信息变化自然断开；避免连续三连排比、同长度段落、同一动作或情绪拆成多段反复写。
- 标点跟语气走；保留有功能的问号和少量感叹号，不用省略号、破折号或分隔线硬造停顿。
- 章尾用动作、对话、物件或悬念收束，不写总结、升华、哲理或上帝视角预告。
</story_deslop_prevention>"""

STORY_DESLOP_PREVENTION_CONSTRAINTS_EN = """<story_deslop_prevention>
【Anti-AI-slop prevention】
- This is a pre-generation prose constraint, not a post-editing task. Output natural chapter prose only, without reports, diagnostics, or revision notes.
- Avoid overly smooth, symmetrical, and over-explained prose. Prefer concrete actions, object changes, spoken reactions, and in-scene consequences.
- Avoid stock AI patterns: not A but B, quiet voice carrying power, eyes flashing with emotion, a slight smile curling, a surge in the heart, final realization, omniscient foreshadowing.
- Keep emotion shown through visible reactions: shaking hands, silence, wrong words, stepping back, breaking something, looking away.
- Dialogue should sound spoken, with subtext, interruptions, evasions, and partial answers. Do not let characters fully explain motives, lore, or causality.
- Break paragraphs by action, camera, and information changes. Avoid triple parallelism, uniformly sized paragraphs, and repeated descriptions of the same beat.
- Use punctuation for voice. Keep functional questions and rare exclamations; avoid ellipses, em dashes, and separator lines as artificial pauses.
- End with an action, line, object, or unresolved tension, not a summary, moral, philosophical lift, or omniscient teaser.
</story_deslop_prevention>"""


def normalize_continuation_writing_mode(value: object) -> ContinuationWritingMode:
    raw = str(value or "default").strip().lower()
    if raw in {"story_long_write", "story-long-write", "long", "webnovel"}:
        return "story_long_write"
    return "default"


def writing_mode_constraints(mode: str | None, *, locale: str | None = None) -> str:
    normalized = normalize_continuation_writing_mode(mode)
    if normalized != "story_long_write":
        return ""
    if (locale or "").lower().startswith("en"):
        return STORY_LONG_WRITE_CONSTRAINTS_EN
    return STORY_LONG_WRITE_CONSTRAINTS_ZH


def deslop_prevention_constraints(*, locale: str | None = None) -> str:
    if (locale or "").lower().startswith("en"):
        return STORY_DESLOP_PREVENTION_CONSTRAINTS_EN
    return STORY_DESLOP_PREVENTION_CONSTRAINTS_ZH
