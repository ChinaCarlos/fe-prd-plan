# Changelog

## Unreleased
- MCP / 插件配置：`spark-figma-mcp` → **`xc-figma-mcp`**；配套插件文案与 Community 链接同步为 **Xc-Figma-Plugin** / `xc-figma-plugin`

## 0.4.0
- **支持截图作为输入源（无链接场景）**：需求文档没有可访问链接时，可直接粘贴/发送需求文档截图，走 `flow-fetch.md`「②a 截图输入」——不走 CDP，靠 Agent 视觉能力逐张完整转录，落盘规则与完整性红线（③c）同样适用；设计稿同理，没有 Figma 链接时可直接贴设计截图，走 `flow-figma-interact.md`「设计截图直读」，产出须如实标注「来源为截图、精度低于 Figma 节点数据」，不得包装成同等精度
- `SKILL.md` 模式表 / 触发条件、`flow-locate.md` 收集项、`flow-gates.md` 门①同步支持「链接或截图」两种输入描述

## 0.3.1
- **`/capture-scroll` 改为单趟滚动**：之前"读正文文字"和"分段截图"是两个独立的滚动循环，等于同一份虚拟滚动文档滚两遍；现在每停一步同时读该容器 `innerText` 并截图，返回 `shots[].text` 与去重合并后的 `mergedText`（`outDir/merged_text.txt`），`flow-fetch.md`「③a」同步简化为一次调用
- **归档完整性新规则（③c，强制）**：禁止因判断某节「超出本次范围」就在 `source/*.md` 里摘要/略写/用「详见截图」代替正文；范围裁剪只应体现在 `requirements.md`，不能影响 source 归档的完整度；门②新增「是否有章节被摘要/略写」检查项；钉钉站点经验补充用页面自带字数计数器做完整性粗校验

## 0.3.0
- **虚拟滚动长页面支持**：新增 `cdp-proxy` 接口 `GET /find-scroll-container`（自动探测/标记页面真实可滚动的正文容器，不依赖易变的哈希 class 名）与 `POST /capture-scroll`（对该容器分段截图，产出可拼接的 `manifest.json`）
- 新增 `scripts/stitch-long-page.py`（Pillow）将 `/capture-scroll` 产出的切片拼接为一张完整长图；`check-deps.mjs` 同步预检 `python3` + `Pillow`
- `flow-fetch.md` 新增「③a 虚拟滚动分支」「③b 内嵌附件与外部链接边界」；`cdp-api.md` / `site-patterns/alidocs.dingtalk.com.md` 同步补充用法与踩坑记录
- **强制新规则**：禁止为「抓全」递归打开文档正文中的外部链接逐个解析；仅当内嵌附件是关键数据唯一来源时才可单独打开，且需在门②说明

## 0.2.3
- 修正 `figma-excerpt.md.skeleton` 文首图路径为 `source/assets/design_screenshot.png`
- `flow-locate` 调用方契约示例与 agent 轻量门①文案对齐

## 0.2.2
- **路由**：活动仓实现场景让位 `fe-activity-agent`，避免与本 Skill 抢入口；description 同步
- **门①轻量**：调用方已指定 `outputDir` 且目录已确认时，一次复述确认，不重复问子包/活动名
- **截图路径统一**：一律 `{outputDir}/source/assets/`（`prd_screenshot` / `design_screenshot`）；禁止分裂的 `assets/` 裸路径
- 明确 `status: confirmed` 判定；门④后交还调用方，不重复开「是否开始实现」

## 0.2.1
- `flow-locate`：明确 `outputDir` 优先级与外部 Skill（如 fe-activity-agent）调用契约（`outputDir:` 行优先于默认 `docs/prd/`）
- `SKILL.md`：补充「被其它 Skill 调用」说明

## 0.2.0
- 可选 **xc-figma-mcp** 只读识别设计稿交互，与 PRD 合成 `requirements.md` + `interaction.md`
- 插件根新增 `.mcp.json`；`install.sh` 同步安装
- 明确 `outputDir`（默认 `docs/prd/<名>/`，可指定活动/页面下 `prd/`）与人工确认门 ①～④
- 新增流程：`flow-overview` / `flow-locate` / `flow-gates` / `flow-figma-interact` / `flow-merge`
- 新增骨架：`requirements` / `interaction` / `figma-excerpt` / `open-questions` / `meta.yaml`
- **禁止**切图（`save_screenshots`）与写业务代码；`fe-activity-agent` 等实现 Skill 保持独立

## 0.1.0
- 首个版本：CDP 通用文档拉取（改编自 web-access）+ 任务拆分/分型出 plan.md
- 打包为 Cursor 全局插件（`.cursor-plugin/plugin.json`），一键安装到 `~/.cursor/plugins/local/fe-prd-plan`
