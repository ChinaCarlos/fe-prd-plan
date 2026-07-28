# 流程总览

进入本 Skill 后按下列阶段执行；细节见各 `flow-*.md`。任一门禁未通过不得跳阶段。

```text
① flow-locate（定范围）──确认门①──►
② flow-fetch（有链接）或确认粘贴文本──确认门②──►
③ flow-figma-interact（有 Figma）──确认门③──►
④ flow-plan（拆任务，可与③并行草稿，但定稿在合并后）──►
⑤ flow-merge（合成 requirements + interaction）──确认门④──► 完成
```

## 阶段要点

| 阶段 | 输入 | 输出 | 门禁 |
|------|------|------|------|
| locate | 用户 prompt | `outputDir`、模式、scopes 清单 | ① |
| fetch | 需求 URL | `source/*.md`、assets | ② |
| figma | Figma URL(s) | `figma-excerpt.md`（draft） | ③ |
| plan | 原文 / 粘贴文本 | `plan.md`（可先 draft） | — |
| merge | PRD + excerpt + plan | `requirements.md`、`interaction.md` | ④ |

## 并行说明

- **禁止**在门①前调用 CDP 或 `get_node`。
- plan 的草稿可在门②后基于 PRD 先写；若存在 Figma，**定稿**的 `requirements.md` / `interaction.md` 必须经过 `flow-merge.md` 与门④。
- 无 Figma：跳过阶段③与门③；`interaction.md` 仅从 PRD 的 UI 描述生成，并标注「无设计稿」。
