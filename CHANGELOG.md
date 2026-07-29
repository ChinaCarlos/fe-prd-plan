# Changelog

## 0.2.2
- **路由**：活动仓实现场景让位 `fe-activity-agent`，避免与本 Skill 抢入口；description 同步
- **门①轻量**：调用方已指定 `outputDir` 且目录已确认时，一次复述确认，不重复问子包/活动名
- **截图路径统一**：一律 `{outputDir}/source/assets/`（`prd_screenshot` / `design_screenshot`）；禁止分裂的 `assets/` 裸路径
- 明确 `status: confirmed` 判定；门④后交还调用方，不重复开「是否开始实现」

## 0.2.1
- `flow-locate`：明确 `outputDir` 优先级与外部 Skill（如 fe-activity-agent）调用契约（`outputDir:` 行优先于默认 `docs/prd/`）
- `SKILL.md`：补充「被其它 Skill 调用」说明

## 0.2.0
- 可选 **spark-figma-mcp** 只读识别设计稿交互，与 PRD 合成 `requirements.md` + `interaction.md`
- 插件根新增 `.mcp.json`；`install.sh` 同步安装
- 明确 `outputDir`（默认 `docs/prd/<名>/`，可指定活动/页面下 `prd/`）与人工确认门 ①～④
- 新增流程：`flow-overview` / `flow-locate` / `flow-gates` / `flow-figma-interact` / `flow-merge`
- 新增骨架：`requirements` / `interaction` / `figma-excerpt` / `open-questions` / `meta.yaml`
- **禁止**切图（`save_screenshots`）与写业务代码；`fe-activity-agent` 等实现 Skill 保持独立

## 0.1.0
- 首个版本：CDP 通用文档拉取（改编自 web-access）+ 任务拆分/分型出 plan.md
- 打包为 Cursor 全局插件（`.cursor-plugin/plugin.json`），一键安装到 `~/.cursor/plugins/local/fe-prd-plan`
