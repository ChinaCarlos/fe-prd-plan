# PRD × Figma 合成规则

输入：

- 需求原文（`source/*.md` 或粘贴文本）
- （可选）门③通过后的 `figma-excerpt.md`
- `plan.md` 草稿（可在本阶段定稿）

输出（`outputDir`）：

- `requirements.md`
- `interaction.md`
- 更新 `plan.md`、`open-questions.md`、可选 `meta.yaml`

骨架：[`skeletons/requirements.md.skeleton`](skeletons/requirements.md.skeleton)、[`skeletons/interaction.md.skeleton`](skeletons/interaction.md.skeleton)。

## 资源路径（统一 · 禁止分裂）

所有本地图片/截图只放在 **`{outputDir}/source/assets/`**：

| 文件 | 用途 | Markdown 引用（相对 `outputDir` 根下的 md） |
|------|------|-----------------------------------------------|
| `source/assets/prd_screenshot.png` | 需求页/原型截图（拉文时若有） | `![需求原型](source/assets/prd_screenshot.png)` |
| `source/assets/design_screenshot.png` | Figma scope 主截图 | `![设计稿](source/assets/design_screenshot.png)` |
| `source/assets/design_screenshot_N.png` | 额外 Figma scope | 同上规则 |

**禁止**再使用 `outputDir/assets/`（无 `source` 前缀）或业务 `images/` 作为本 Skill 存证目录。无截图时：删掉对应 `![...]` 行，勿留死链。

## 优先级（写死）

| 维度 | 优先来源 |
|------|----------|
| 业务规则、权限、任务数值、接口字段含义 | **PRD** |
| 布局分区、控件外观与稿面文案、相对结构 | **Figma** |
| PRD 有、稿无 | 写入 `requirements.md`；`interaction.md` 标注「无稿，实现以 PRD/后续补稿为准」 |
| 稿有、PRD 无 | 写入 `interaction.md`；`requirements.md` 标注「稿面增补，待产品确认是否做」并列入 `open-questions.md`（除非用户已确认要做） |
| 两者冲突 | **禁止静默选取** → `open-questions.md`；门④关闭前定稿不得假装已决议 |

## `requirements.md` 侧重

- **视觉存证**：若有文件则文首嵌入 `![需求原型](source/assets/prd_screenshot.png)`
- 业务概述、功能模块、校验、数据/字段
- 与 `plan.md` 任务 id 映射
- UI 只保留与业务相关的说明；细交互以 `interaction.md` 为准

## `interaction.md` 侧重

- **视觉存证**：若有文件则文首嵌入 `![设计稿](source/assets/design_screenshot.png)`
- 按 Surface（主界面 / Tab / 弹窗）描述结构与交互流
- 状态：Normal / Loading / Empty / Error / Disabled（缺则写「未提供」）
- TEXT 策略表（与摘录归类对齐）
- Figma 索引：`scopeNodeId` + 关键分区 nodeId
- 明确声明：**本文不是切图清单**；切图由实现阶段 Skill 负责

## 无 Figma

仍生成 `interaction.md` 精简版（仅 PRD 中的界面与反馈描述），文首标注 `design: none`。

## 自审（门④前）

- 骨架占位符 `<...>` 已清空
- `open-questions.md` 无未决策冲突仍被写成肯定句
- 文内图片路径均指向 `source/assets/`，无 `assets/...` 裸路径、无死链
- frontmatter：`status: draft`；用户门④确认后改为 `status: confirmed` 并注明确认时间

## 门④ 通过后

对话给出路径列表 +「本 Skill 不写代码」。有调用方则交还；无则提示可用实现类 Skill 引用上述文档。
