# 任务拆分与 plan.md

输入 = 门②通过后的需求原文（及可选的已确认 Figma 摘录）。  
完整度评估 / 需求分级 / hub 目录：**不做**。

可在门②后先出 **draft** `plan.md`；若存在 Figma，建议在门③后根据控件/分区微调 task，再与 `flow-merge.md` 一并定稿。

## ① 详细需求下钻（为 plan 与 requirements 做准备）

从原文提取：

- **业务逻辑**：核心流程、权限、身份互斥
- **UI 交互**：Loading / Error / Empty、异常引导、动效（有 Figma 时以摘录补全，冲突进 open-questions）

## ② task 拆分

每个 task = **最小可独立验证单元**。粒度标准是可独立验收，不是文件数或工时。

## ③ 分型判定（写死）

| 判定条件 | type |
|----------|------|
| 业务逻辑 / 数据处理 / 接口 / 状态管理 | `tdd` |
| 纯布局 / 动效 / 平台 UI 适配 | `ui-verify` |
| 纯文档 / 流程文本（无可测运行时行为） | `docs` |
| 无测试基建、仅能验证构建产物 | `build-verify` |

**可测逻辑混进 `ui-verify` = 拆分失败**，必须拆出独立 `tdd` task。

## ④ 生成 `plan.md`

按 [`skeletons/plan.md.skeleton`](skeletons/plan.md.skeleton) 写入 **`outputDir/plan.md`**。

`requirements.md` / `interaction.md` **不在本文件单独定稿**——走 `flow-merge.md`（无 Figma 时 merge 仍负责从 PRD 生成两份文档）。

## ⑤ 自审

- 无残留 `<...>` 占位
- 分型一致
- 任务总览表将在对话中完整渲染（见下）

## ⑥ 对话渲染

任务总览表必须完整进对话。业务/交互细节的完整渲染放在 merge 后的门④。

## ⑦ 与门禁关系

- 本阶段不单独设「plan 专用门」；plan 与 requirements / interaction 在**门④**一并确认。
- 用户若只要 plan、明确跳过详细 requirements：可在门①声明，仍建议最少产出 `plan.md` + 精简 `requirements.md`。
