---
name: fe-prd-plan
description: >-
  Use when the user wants requirement docs fetched/planned in isolation (/prd-plan, or only PRD→plan with no activity-page implementation).
  Fetch login-walled docs via CDP; optional Figma read-only via spark-figma-mcp; output plan/requirements/interaction.
  IMPORTANT routing: If the workspace is an H5 activity monorepo (packages/partyActivity or packages/hh-active) AND the user
  also wants to build/restore an activity page (新建活动、还原 UI、fe-activity-agent), do NOT run this skill as the top-level
  entry — follow fe-activity-agent first; that skill will call this one with outputDir set.
  (拉取需求、拆任务、出 plan/requirements/interaction；活动仓实现场景须由 fe-activity-agent 编排后再调本 Skill。)
---

# fe-prd-plan：需求文档拉取 + 计划拆分 +（可选）Figma 交互合成

本 Skill 通过本机**已登录**的 Chrome/Edge（CDP）读取需求文档；可选地用 **spark-figma-mcp** 只读分析用户给出的 Figma `scopeNodeId` 子树，将 PRD 与设计识别结果合成为可给后续实现参考的文档。**不写业务代码、不切图落盘、不派发实现。**

CDP 抓取内核改编自 **web-access**（一泽Eze，MIT，<https://github.com/eze-is/web-access>），见仓库根 `LICENSE` Third-party notice。

## 沟通语言（强制 · 简体中文）

对用户可见的过程说明、门禁确认、任务总览、缺口表必须使用简体中文；代码、路径、命令、`nodeId` / `fileKey` 可保留英文。

## 路由优先级（防与实现 Skill 抢入口）

| 场景 | 谁先跑 |
|------|--------|
| 用户只要文档/计划（`/prd-plan`、明确「先别写代码」） | **本 Skill** |
| 工作区含 `packages/partyActivity` 或 `packages/hh-active`，且用户要**新建/改活动页、还原 UI、联调实现** | **先 `fe-activity-agent`**；由它定目录并调用本 Skill（带 `outputDir:`） |
| 上下文已有 `调用方：fe-activity-agent` | 本 Skill 作子流程，**勿**再建议用户「改去跑 activity-agent」打断当前文档门禁 |

## 触发条件

- `/prd-plan`
- 需要登录才能查看的需求文档链接，要求拉取或出计划（且**不属于**上表「须先 activity-agent」）
- 粘贴需求文本并要求「拆任务 / 出实现计划 / 出详细需求」
- 同时或单独提供 Figma 设计链接，要求「按稿补交互规格 / 合成 interaction 文档」
- **直接粘贴/发送需求文档截图或设计截图（没有链接）**：同样视为有效输入源，走截图直读支路（见 `flow-fetch.md`「②a 截图输入」、`flow-figma-interact.md`「设计截图直读」），不强制要求用户先去找链接
- 被 `fe-activity-agent` 等调用方 Read 后嵌入执行

## 必读流程（按顺序 Read）

| 文档 | 用途 |
|------|------|
| [`references/flow-overview.md`](references/flow-overview.md) | 阶段总览与模式 |
| [`references/flow-gates.md`](references/flow-gates.md) | 人工确认门 ①～④（含调用方轻量门①） |
| [`references/flow-locate.md`](references/flow-locate.md) | 定 `outputDir` / 输入源 / Figma scopes |
| [`references/flow-fetch.md`](references/flow-fetch.md) | CDP 拉取与归档 |
| [`references/flow-figma-interact.md`](references/flow-figma-interact.md) | Figma 只读识别（有链接才走） |
| [`references/flow-plan.md`](references/flow-plan.md) | 任务拆分与 plan |
| [`references/flow-merge.md`](references/flow-merge.md) | PRD × Figma 合成规则 |

## 模式

| 模式 | 条件 |
|------|------|
| `prd-only` | 仅有需求输入（链接 / 粘贴文本 / 需求截图，三选一或组合） |
| `prd+figma` | 需求输入 + 至少一个设计输入（Figma URL 或设计截图） |
| `figma-only` | 仅有设计输入（Figma URL 或设计截图，少见；`requirements.md` 以稿面推断并标「缺 PRD」） |

需求/设计输入不局限于链接：用户直接贴截图同样有效，只是**截图直读的还原精度低于链接/节点直读**（没有可解析的 DOM 文本或 Figma bounds 数据，靠视觉识别），产出文档须如实标注来源与置信度，不能包装成跟链接直读同等精度。

## 交付物（均在确认后的 `outputDir` 下）

| 文件 | 说明 |
|------|------|
| `source/` | 归档原文；**所有**截图/附件统一在 `source/assets/` |
| `plan.md` | 任务清单（tdd / ui-verify / build-verify / docs） |
| `requirements.md` | **定稿**：业务需求（做什么、校验、数据） |
| `interaction.md` | **定稿**：交互/UI 规格（有 Figma 时必出；无 Figma 时可由 PRD  alone 生成精简版） |
| `figma-excerpt.md` | 中间产物：设计识别摘录（有 Figma 时） |
| `open-questions.md` | 未关闭问题；全部关闭前不得标 `status: confirmed` |
| `meta.yaml` | 可选：来源 URL、`scopeNodeId`、模式、生成时间 |

骨架见 `references/skeletons/`。

**`status: confirmed` 判定**：仅当 `requirements.md` / `interaction.md`（及通常 `plan.md`）YAML frontmatter 为 `status: confirmed` 时视为定稿完成；`draft` **不算**已确认。

### 默认 `outputDir`

- **调用方已传 `outputDir:`**（如 `fe-activity-agent`）：优先采用，见 [`flow-locate.md`](references/flow-locate.md)「优先级」与「调用方契约」
- 未指定：`docs/prd/<归档目录名>/`（归档名须门禁 ① 确认）
- 用户指定活动/页面目录时：落在该目录下的 `prd/`（例如 `packages/<pkg>/src/pages/<activity>/prd/`），**禁止**写死单一业务仓库路径

## 被其它 Skill 调用

外部 Skill 无 IPC：须 **Read** 本 `SKILL.md` 与 `references/`，并在上下文写明 `outputDir` / 需求 / Figma。本 Skill 仍跑完自身门禁（调用方已锁定路径时门①可走**轻量复述**，见 `flow-gates.md`）；定稿后回报路径，**不**自动写业务代码、**不**重复开启第二套「实现阶段 0」——交还调用方。

## 人工门禁（强制）

完整定义见 [`flow-gates.md`](references/flow-gates.md)。任一门未通过不得进入下一阶段；**禁止**隐性连跑。

| 门 | 时机 |
|----|------|
| ① | 定范围 / `outputDir` / 输入 / Figma scopes 之后（调用方已指定路径时可轻量） |
| ② | CDP 拉文（或确认粘贴文本）之后 |
| ③ | Figma 摘录之后（无 Figma 则跳过） |
| ④ | 合成定稿之前（冲突与缺口关闭） |

## MCP（spark-figma-mcp）

- 插件根 [`.mcp.json`](../../.mcp.json) 声明了 `spark-figma-mcp`（`npx -y spark-figma-mcp`），供未配置过的环境安装后可用。
- **若本机 `~/.cursor/mcp.json` 或项目已配置同名服务**：优先使用**已连接、可用**的那套；不要重复启动两套互相踩脚。命名空间可能是 `spark-figma-mcp` 或 `user-spark-figma-mcp`，以当前会话 `GetDynamicTools` / MCP 列表为准。
- 使用前须：Figma **桌面端**打开目标文件，并 Run **Spark-Figma-Plugin**；`list_files` 为空则暂停并提示用户。
- **只读工具**：`list_files` → `get_screenshot` / `get_node` / 可选 `get_design_context`。
- **禁止**：`save_screenshots`、向业务 `images/` 切图、改页面/reducer/路由源码。

## 明确不做的事

- 不做 PRD 完整度打分、需求分级、G-plan 重型状态机
- 不建 `hub` / `releases/registry.md` / `context-sources.yaml` / `changes/<id>/` 等重型目录（`outputDir` 下轻量 `meta.yaml` 除外）
- 不做多端职责分配文档
- **不写业务代码、不派发实现、不切图**
- 不为各文档平台申请企业 API；CDP 方案不需要这些
- 无用户明文多个 `node-id` / 多个 Figma 链接时，**禁止**扩扫其它 Frame / 全文件盘点 tab
- **禁止**为「抓全」而递归打开文档正文中提到的每个外部链接（其它文档/参考设计稿等）逐个解析；只抓当前这篇文档渲染出的内容，例外情形与流程见 `flow-fetch.md`「③b 内嵌附件与外部链接边界」

## 风险与边界

- 浏览器自动化有账号限制风险；继续即视为接受（拉文前须展示须知，见 `flow-fetch.md`）。
- 仅操作 Agent 自建后台 tab；结束关闭自建 tab。
- 未登录时等待用户自行登录，不代填账号密码。
- 抓取与定稿一律落到**当前工作项目**的 `outputDir`，不进本 Skill 安装目录。

## 环境要求

- Node.js 22+（`check-deps.mjs` 会检查；低于 22 会 warn 仍可尝试）
- 本机 Chrome 或 Edge，且已登录目标文档系统（拉链接时）
- 有 Figma 支路时：桌面 Figma + Spark-Figma-Plugin + 可用的 spark-figma-mcp
- `scripts/*.mjs` 无额外 npm 依赖

## 完成后交接

定稿确认后明确告知用户文档路径（含 `status: confirmed`），并说明：**本 Skill 不写代码**。

- 若由 **`fe-activity-agent` 调用**：交还调用方继续其「待确认执行计划 / 实现」；**不要**再要求用户另开一轮「请去跑 activity-agent」。
- 若用户独立跑本 Skill：提示可用活动页 `fe-activity-agent` 并指定「按 `requirements.md` / `interaction.md` 还原」。
