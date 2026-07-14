---
name: novel-anti-detection
description: 网文AI检测与反检测风控。当用户需要了解AIGC检测原理、平台AI政策、文本风险诊断、反检测策略或AI辅助创作合规流程时触发。只做检测/风控/策略建议，不做正文去AI味改写；正文去AI味使用 `novel-de-ai`。
license: MIT
compatibility: opencode
metadata:
  audience: novel-writers
  version: 3.1.0
---

# AI检测与反检测风控

## Purpose

解释AI检测原理、识别文本风险、整理平台风控注意点，并给出合规的混合创作建议。

## Scope

适合：
- 了解AI检测原理
- 判断文本是否有明显AI特征群
- 分析平台风控风险
- 设计AI辅助创作和人工修改流程
- 区分误报与真实AI痕迹

不处理：
- 直接重写正文去AI味，交给 `novel-de-ai`
- 普通文笔润色，交给 `novel-polishing`
- 承诺“保证过检测”

## Instructions

### 风险判断原则

只看“特征群”，不看孤立词。单个破折号、单个转折词、单句工整，都不能判定为AI味。

### 诊断输出

做文本风险诊断时，按以下结构输出：

1. 置信度：高/中/低。
2. 特征群证据：列具体原句和对应特征。
3. 误报检查：哪些地方像真人写作，应该保留。
4. 修改优先级：先改什么，后改什么。
5. 后续动作：如果要改写，建议转交 `novel-de-ai`。

### 平台风控

涉及平台政策时，区分三类：
- 已知规则
- 经验判断
- 需要用户复核的最新公告或编辑通知

不要伪造最新政策，不承诺检测结果。

## Execution Protocol

1. 判断用户要原理解释、风险诊断、平台政策，还是混合创作流程。
2. 文本诊断必须给具体证据，不泛泛列清单。
3. 给建议时以合规、人工复核、质量控制为主。
4. 如果用户要直接改正文，提示应使用 `novel-de-ai`。

## Bundled Resources

- `references/index.md` — AI检测与风控资源索引
- `references/detection-principles.md` — 检测技术原理与特征群
- `references/bypass-strategies.md` — 反检测与混合创作策略

## Checklist

- [ ] 没有承诺检测通过
- [ ] 没有单点误判
- [ ] 给出具体证据
- [ ] 做了误报检查
- [ ] 区分政策事实和经验判断
- [ ] 直接改写请求已转交 `novel-de-ai`
