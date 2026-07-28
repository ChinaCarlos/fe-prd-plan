# 第一步：文档拉取（CDP 浏览器）流程

进入本流程前先读 `../SKILL.md` 确认触发条件已满足。核心机制改编自开源项目 web-access（作者：一泽Eze，MIT License），详见仓库根 `LICENSE` 的 Third-party notice。

## ① 前置检查

```bash
node "<本 skill 目录>/scripts/check-deps.mjs"
```

`<本 skill 目录>` = 当前 `SKILL.md` 所在目录的绝对路径（安装后固定为 `~/.cursor/plugins/local/fe-prd-plan/skills/fe-prd-plan`）。

按脚本输出处理：
- `exit 0` → 继续
- `exit 2` → 需询问用户偏好，写入 `<本 skill 目录>/scripts/config.env` 的 `FE_PRD_PLAN_BROWSER`
- `exit 1` → 按 stdout 错误信息处理；若提示包含「Agent 处理顺序」，按其步骤执行（如先用系统命令打开浏览器后重跑），自动可解则不打扰用户，仍失败再向用户求助

支持参数 `--browser <chrome|edge>` 表达本次临时覆盖（不写 `config.env`）。

切换浏览器时，proxy 是长驻进程，需先 `pkill -f cdp-proxy.mjs` 再重跑 `check-deps.mjs`。

检查通过后，**必须**在回复中向用户直接展示以下须知，再继续操作：

```
温馨提示：部分站点对浏览器自动化操作检测严格，存在账号封禁风险。已内置防护措施但无法完全避免，Agent 继续操作即视为接受。
```

## ② 判断输入形态

| 输入 | 处理 |
|---|---|
| Confluence / 钉钉文档 / 飞书文档等链接 | 走下方「③ CDP 抓取」 |
| 用户已粘贴需求文本 | 跳过本流程，直接进入 `flow-plan.md` |
| 用户说"打开我之前看的那篇 XX" / 内部系统模糊指代 | 先按站点经验或页面内搜索定位，找到确切 URL 后再走「③ CDP 抓取」 |

## ③ CDP 抓取

站点经验优先：确定目标域名后，检查 `<本 skill 目录>/references/site-patterns/<domain>.md` 是否存在，存在则先读取（平台特征、有效 DOM 结构、已知陷阱），当作"可能有效的提示"而非保证。

抓取步骤（完整 API 见 `cdp-api.md`）：

1. `POST /new`（body=目标 URL）新建后台 tab，保留完整 URL（含 query/token 等隐式必要参数，不裁剪）
2. `GET /info?target=ID` 确认页面标题/URL/加载状态
3. **登录判断**：目标内容拿到了吗？只有确认内容拿不到且判断是登录问题时，才告知用户："当前页面在未登录状态下无法获取 [具体内容]，请在你的浏览器中登录 [网站名]，完成后告诉我继续。" 登录完成后无需重启任何东西，直接刷新页面继续
4. 用 `POST /eval` 查询 DOM 结构，先了解页面组织方式（标题、正文容器、图片、附件列表等），再决定提取表达式；不要套用固定模板——不同文档系统/不同页面的 DOM 结构不同
5. 若正文分页/懒加载：`GET /scroll?target=ID&direction=bottom` 触发加载后再提取
6. 提取正文为结构化文本（标题层级、段落、列表、表格尽量保留），图片走 `/eval` 找 `<img>` 的 `src`，能公开访问的直接下载到本地；需要登录态才能访问的资源，走 `navigate` + `/screenshot` 采集
7. 完成后 `GET /close?target=ID` 关闭自己创建的 tab（不动用户已有 tab）

## ④ 归档落盘

- 落到**当前工作项目**（不是 `fe-prd-plan` 自身）的 `docs/prd/<归档目录名>/`；归档目录名须先与用户确认（建议 `vX.Y.Z` 或 `YYYY-MM-DD-<需求简称>`）
- 正文存为 `.md`，图片存到同目录 `assets/`
- 归档已存在（之前抓过同目录）时提示复用，不覆盖，除非用户要求刷新

## ⑤ Secret Scan

对新写入的 markdown 正文做一次密钥模式扫描（webhook / token / ak-sk 等常见泄露形态）。命中即向用户报告文件路径 + 命中模式名 + 脱敏片段，确认或脱敏后才继续进入 `flow-plan.md`。

## ⑥ 站点经验沉淀

抓取成功且发现了值得记录的新模式（URL 结构、正文容器选择器、平台特征、已知陷阱）时，写入/更新 `<本 skill 目录>/references/site-patterns/<domain>.md`：

```markdown
---
domain: example.com
aliases: [示例]
updated: 2026-07-28
---
## 平台特征
架构、登录需求、内容加载方式等事实

## 有效模式
已验证的正文容器选择器、URL 模式

## 已知陷阱
什么会失败以及为什么
```

只写经过验证的事实，不写未确认的猜测；本文件本机生成、不入库（见仓库 `.gitignore`）。
