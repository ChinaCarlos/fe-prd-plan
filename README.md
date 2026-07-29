# fe-prd-plan

通用需求文档拉取 + 实现计划拆分 +（可选）Figma 交互合成——面向 Cursor 的**全局插件**。

## 它是什么

- **文档拉取**：通过 CDP 操控本机已登录的 Chrome/Edge 读取需求正文（Confluence、钉钉、飞书等），无需平台专用 API。
- **实现计划**：拆解为任务级 `plan.md`，分型 `tdd` / `ui-verify` / `build-verify` / `docs`。
- **详细需求**：产出 `requirements.md`（业务）与 `interaction.md`（交互/UI）。
- **可选 Figma**：用户提供设计链接时，用 **spark-figma-mcp** 只读分析 `scopeNodeId` 子树，与 PRD 合成交互文档（**不切图、不写业务代码**）。

不做需求分级、不建 hub/registry 重型状态机、不派发实现。

完整能力见 [`skills/fe-prd-plan/SKILL.md`](skills/fe-prd-plan/SKILL.md)。

## 安装

```bash
curl -fsSL https://raw.githubusercontent.com/ChinaCarlos/fe-prd-plan/main/install.sh | bash
```

安装到 `~/.cursor/plugins/local/fe-prd-plan`（**全局**）。装完在 Cursor 执行 `Developer: Reload Window`。

再次运行同一命令 = 更新（保留 `config.env` 与 `site-patterns/`）。

### MCP（spark-figma-mcp）

插件根目录含 [`.mcp.json`](.mcp.json)，声明：

```json
{
  "mcpServers": {
    "spark-figma-mcp": {
      "command": "npx",
      "args": ["-y", "spark-figma-mcp"]
    }
  }
}
```

若你**已经**在 `~/.cursor/mcp.json` 或项目里配置了同名服务，以已连接实例为准，无需刻意再开一套。使用 Figma 支路前请在桌面端打开文件并 Run [**Spark-Figma-Plugin**](https://www.figma.com/community/plugin/1663788039337307446/spark-figma-plugin) 配套使用。

## 卸载

```bash
curl -fsSL https://raw.githubusercontent.com/ChinaCarlos/fe-prd-plan/main/uninstall.sh | bash -s -- -y
```

## 落盘

默认：`docs/prd/<归档名>/`（其下含 `source/`、`plan.md`、`requirements.md`、`interaction.md` 等）。  
也可在对话中指定活动/页面目录下的 `prd/`（门禁确认后生效）。

**被其它 Skill 调用**（如活动仓 `fe-activity-agent`）：在上下文写明 `outputDir: <path>`，优先于默认路径；见 `skills/fe-prd-plan/references/flow-locate.md`。  
活动仓若还要**实现/还原页面**：应由 `fe-activity-agent` 编排后再调本插件（本 Skill description 已写路由优先级）。

截图与附件统一落在 `{outputDir}/source/assets/`。

## 环境要求

- Node.js 22+（原生 WebSocket；拉文档用）
- 本机 Chrome 或 Edge，且已登录目标文档系统
- 可选 Figma 支路：桌面 Figma + Spark-Figma-Plugin + spark-figma-mcp

## 风险提示

文档抓取基于浏览器自动化，部分站点检测严格，存在账号限制风险。已内置基础防护但无法完全避免，使用即视为接受。

## 出处与许可

MIT License，见 [`LICENSE`](LICENSE)。CDP 内核改编自 [web-access](https://github.com/eze-is/web-access)（一泽Eze，MIT）。
