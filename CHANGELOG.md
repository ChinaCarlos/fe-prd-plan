# Changelog

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
