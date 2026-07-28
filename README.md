# fe-prd-plan

通用需求文档拉取 + 实现计划拆分——面向 Cursor（及其它支持 `SKILL.md` 的 Agent 工具）的**全局插件**。

## 它是什么

- **文档拉取**：通过 CDP 协议操控你本机已登录的 Chrome/Edge 读取需求文档正文，不依赖任何平台专用 API/企业应用凭证。只要你在浏览器里能看到这份文档（Confluence、钉钉文档、飞书文档，或其它任意登录态站点），就能读到。
- **实现计划**：拉到文档后拆解为任务级实现计划，按 `tdd` / `ui-verify` / `build-verify` / `docs` 分型，产出 `plan.md`，在对话中渲染任务总览表供你确认。

不做需求分级、不建 hub/registry/meta.yaml 重型状态机、不派发实现——只解决「把文档变成一份可执行的任务清单」这一段。

完整能力说明见 [`skills/fe-prd-plan/SKILL.md`](skills/fe-prd-plan/SKILL.md)。

## 安装

```bash
curl -fsSL https://raw.githubusercontent.com/ChinaCarlos/fe-prd-plan/main/install.sh | bash
```

安装到 `~/.cursor/plugins/local/fe-prd-plan`（**全局**，不进任何项目仓库）。装完在 Cursor 命令面板执行 `Developer: Reload Window` 生效，之后**任意项目**都能用。

再次运行同一条命令 = 更新到最新版本（会保留你的浏览器偏好 `config.env` 与已积累的站点经验 `site-patterns/`）。

## 卸载

```bash
curl -fsSL https://raw.githubusercontent.com/ChinaCarlos/fe-prd-plan/main/uninstall.sh | bash -s -- -y
```

## 环境要求

- Node.js 22+（原生 WebSocket，无需 npm 依赖安装）
- 本机 Chrome 或 Edge，且已登录目标文档系统

## 风险提示

文档抓取基于浏览器自动化，部分站点对自动化操作检测严格，存在账号被限制/封禁的风险。已内置基础防护（拦截页面对本地调试端口的探测）但无法完全避免，使用即视为知晓并接受该风险。

## 出处与许可

MIT License，见 [`LICENSE`](LICENSE)。CDP 抓取内核改编自开源项目 [web-access](https://github.com/eze-is/web-access)（作者：一泽Eze，MIT License），详见 `LICENSE` 中的 Third-party notice。
