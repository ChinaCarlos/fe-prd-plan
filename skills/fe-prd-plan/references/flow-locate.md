# 阶段：定位范围与 `outputDir`

在门①之前完成信息收集并**完整复述**给用户。

## 收集项

| 项 | 规则 |
|----|------|
| 模式 | 有需求无 Figma → `prd-only`；两者都有 → `prd+figma`；仅 Figma → `figma-only` |
| 需求输入 | URL / 粘贴正文 / 工作区内已有 md 路径 |
| Figma | 0～N 个 `figma.com/design/...` 或 `figma.com/file/...`；每个解析 `node-id=aaa-bbb` → `scopeNodeId=aaa:bbb` |
| `outputDir` | 见「优先级」与下方默认值 |
| 归档名 | 建议 `vX.Y.Z` 或 `YYYY-MM-DD-<需求简称>` |

## `outputDir` 优先级（写死）

1. **调用方契约**：上下文 / prompt 中出现明确行  
   `outputDir: <path>`  
   或「调用方：fe-activity-agent」且给出活动 `prd` 绝对/仓库相对路径 → **优先采用**，门①只做复述确认，**不要**改回默认 `docs/prd/`，除非用户在门①明确要求修改。
2. **用户本轮明确指定**的路径或「放到活动/页面目录 …」。
3. **默认**：`{workspace}/docs/prd/<归档名>/`。

## `outputDir` 默认与示例

| 用户意图 | `outputDir` |
|----------|-------------|
| 未指定且无调用方契约 | `{workspace}/docs/prd/<归档名>/` |
| 「放到活动目录 xxx」且给出包路径 | `{workspace}/packages/<pkg>/src/pages/<activity>/prd/` |
| 「放到这个页面目录」且给出路径 | `<该页面目录>/prd/` |
| 用户或调用方给出完整自定义路径 | 规范化后使用（相对路径相对当前工作项目根） |

**禁止**：在 Skill 或脚本里写死某个公司 monorepo 的固定包名作为唯一落盘点。  
**允许**：用户或调用方（如 `fe-activity-agent`）本轮明确说出包名与活动名后，按上表拼路径并请其确认。

## 调用方契约（外部 Skill）

无 IPC。外部 Skill（如活动页 **`fe-activity-agent`**）应 **Read** 本 Skill 后，在同一会话上下文中写入例如：

```markdown
调用方：fe-activity-agent
outputDir: /abs/path/to/packages/partyActivity/src/pages/foo_activity/prd
需求：<url 或说明>
Figma：<可选>
说明：outputDir 已由调用方指定；门①复述后等用户确认即可
```

完成后在对话中回报实际 `outputDir`，供调用方继续实现流程。

## 目录尚不存在

- 门①通过后可 `mkdir -p` 创建 `outputDir`（及 `source/`、`source/assets/`）。
- **不要**因此创建页面骨架（`index.tsx` 等）——那是实现 Skill 的事。

## 复述模板（门①）

```markdown
## 待确认范围（fe-prd-plan）

- 模式：prd-only | prd+figma | figma-only
- outputDir：`<path>`（来源：调用方指定 | 用户指定 | 默认 docs/prd）
- 调用方：无 | fe-activity-agent | …
- 需求来源：<url 或 粘贴或 本地路径>
- Figma scopes：
  - `<url>` → `scopeNodeId: a:b`
- 将生成：source/（若拉取）、plan.md、requirements.md、interaction.md、…
- 本 Skill **不写代码、不切图**

请确认后继续（确认 / 修改意见）。
```
