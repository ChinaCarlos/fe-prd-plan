---
name: fe-prd-plan
description: Use when the user gives a requirement-document link that needs login (Confluence, DingTalk doc, Feishu doc, or similar internal doc systems), or pastes requirement text directly, and wants it fetched and turned into a task-based implementation plan (拉取需求文档、拆任务、出实现计划). Fetching relies on the user's own already-logged-in local Chrome/Edge via CDP — no platform-specific API/OAuth app is required, so it generalizes across any doc system the user can already see in their browser. Output is lightweight: a task list with type classification (tdd/ui-verify/build-verify/docs), no heavy state machine (no hub/registry/meta.yaml/change directories).
---

# fe-prd-plan：通用需求文档拉取 + 实现计划拆分

本 Skill 通过操控用户本机**已登录**的 Chrome/Edge（CDP 协议）读取需求文档正文，不依赖任何平台专用 REST API/企业应用凭证——只要你在浏览器里能看到这份文档，本 Skill 原则上就能读到，因此天然覆盖 Confluence、钉钉文档、飞书文档等任意登录态站点，而不局限于某几个预先适配好的平台。拉取到文档后，进一步拆解为任务级实现计划（分型 `tdd`/`ui-verify`/`build-verify`/`docs`），产出 `plan.md`，人工确认后即完成——不引入需求分级、hub/registry、meta.yaml 状态机等重型机制。

CDP 抓取内核改编自开源项目 **web-access**（作者：一泽Eze，MIT License，<https://github.com/eze-is/web-access>），详见仓库根 `LICENSE` 的 Third-party notice。

## 沟通语言（强制 · 简体中文）

过程说明、追问清单、任务总览表、确认请求等对用户可见的内容必须使用简体中文；代码、路径、命令、变量名可保留英文。

## 触发条件

- 用户输入 `/prd-plan`
- 用户给了一个需要登录才能查看的需求文档链接（Confluence、钉钉文档、飞书文档等），要求拉取或据此出计划
- 用户直接粘贴需求文本，明确要求「拆任务」「出实现计划」「按这个需求排期」

## 两步流程

1. **文档拉取**（仅当输入是链接时；用户已粘贴文本则跳过）：完整步骤见 [`references/flow-fetch.md`](references/flow-fetch.md)——前置环境检查、CDP 抓取、归档落盘、Secret Scan、站点经验沉淀。
2. **任务拆分 + 生成 plan.md**：完整步骤见 [`references/flow-plan.md`](references/flow-plan.md)——task 拆分、分型判定、生成骨架、对话渲染确认。

两步任一步骤完成后都不自动进入下一步的"隐性推进"——文档拉取完成后需向用户确认已拉到正确内容，再进入拆分；plan 经用户确认后本 Skill 即完成职责，不写代码。

## 明确不做的事

- 不做 PRD 完整度评估、追问清单、需求分级
- 不建 `hub`、`releases/registry.md`、`context-sources.yaml`、`meta.yaml`、`changes/<change-id>/` 目录
- 不做多端职责分配（`platform-ownership.md`）
- 不做 G-plan 状态机式门禁、`dev_mode`（subagent/inline）拍定；用户在对话中确认计划即视为通过
- 不写代码、不派发实现——仅产出「拉取归档」与「plan.md」两个交付物
- 不为了"能抓所有平台"而去申请各平台的企业应用/开放平台凭证——CDP 方案的价值就是不需要这些

## 风险与边界须知

- 浏览器自动化存在被目标站点判定为异常行为、进而限制/封禁账号的风险；已内置基础防护（拦截页面对本地调试端口的探测）但无法完全避免，继续使用即视为知晓并接受。
- 仅操作 Agent 自己创建的后台 tab，不动用户已打开的 tab；任务结束主动关闭自建的 tab。
- 需要登录态的内容，若当前未登录，向用户说明后等待其在自己浏览器登录，不代为输入账号密码。
- 抓取内容不进本 Skill 自身目录，落到用户当前工作项目内，便于该项目后续版本管理与团队协作。

## 环境要求

- Node.js 22+（`check-deps.mjs` 会做版本检查，不满足会 warn 但仍尝试继续）
- 本机已安装 Chrome 或 Edge，且已在其中登录目标文档系统
- 无需 npm 依赖安装——`scripts/*.mjs` 全部基于 Node 原生 API
