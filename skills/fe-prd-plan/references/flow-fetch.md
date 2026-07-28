# 第一步：文档拉取（CDP 浏览器）流程

进入前：已完成 `flow-locate.md` 且**门①已通过**；并已 Read `../SKILL.md`。  
核心机制改编自 web-access（一泽Eze，MIT），见仓库根 `LICENSE` Third-party notice。

## ① 前置检查

```bash
node "<本 skill 目录>/scripts/check-deps.mjs"
```

`<本 skill 目录>` = 当前 `SKILL.md` 所在目录的绝对路径（安装后一般为 `~/.cursor/plugins/local/fe-prd-plan/skills/fe-prd-plan`）。

按脚本输出处理：

- `exit 0` → 继续
- `exit 2` → 询问用户偏好，写入 `<本 skill 目录>/scripts/config.env` 的 `FE_PRD_PLAN_BROWSER`
- `exit 1` → 按 stdout 处理；含「Agent 处理顺序」则按其步骤执行，自动可解不打扰用户

支持 `--browser <chrome|edge>` 临时覆盖（不写 `config.env`）。

切换浏览器时先 `pkill -f cdp-proxy.mjs` 再重跑 `check-deps.mjs`。

检查通过后，**必须**展示：

```
温馨提示：部分站点对浏览器自动化操作检测严格，存在账号封禁风险。已内置防护措施但无法完全避免，Agent 继续操作即视为接受。
```

## ② 判断输入形态

| 输入 | 处理 |
|------|------|
| Confluence / 钉钉 / 飞书等链接 | 走「③ CDP 抓取」 |
| 用户已粘贴需求文本 | 将文本写入 `outputDir/source/pasted.md`（或用户指定文件名），跳过③，直接门② |
| 本地已有 md | 复制或引用到 `outputDir/source/`，跳过③，直接门② |
| 模糊指代「之前那篇」 | 先定位确切 URL 再走③ |

`figma-only` 模式：跳过整个 fetch，门②改为确认「本次无 PRD 原文」。

## ③ CDP 抓取

站点经验：若存在 `<本 skill 目录>/references/site-patterns/<domain>.md` 则先读（提示而非保证）。

步骤（API 见 `cdp-api.md`）：

1. `POST /new`（body=完整目标 URL）新建后台 tab
2. `GET /info?target=ID` 确认标题/URL/加载状态
3. **登录判断**：仅当确认拿不到目标内容且为登录问题时，请用户在本机浏览器登录后告知继续
4. `POST /eval` 探 DOM，再定提取表达式（不套固定模板）
5. 分页/懒加载：`GET /scroll?target=ID&direction=bottom`
6. 提取结构化正文；可公开图片下载到 `assets/`；需登录的资源用 navigate + `/screenshot`
7. `GET /close?target=ID` 关闭自建 tab

## ④ 归档落盘

- 根目录 = 门①确认的 **`outputDir`**
- 正文 → `outputDir/source/<归档文件名>.md`
- 图片 → `outputDir/source/assets/`
- 已存在则提示复用，不覆盖，除非用户要求刷新

（兼容说明：旧版默认 `docs/prd/<归档名>/` 等价于 `outputDir` 取该路径且可不建 `source/` 子目录；**新流程优先 `outputDir/source/`**，若用户明确要求扁平落在 `outputDir` 根下也可，须在门①写清。）

## ⑤ Secret Scan

对新写入 markdown 做密钥模式扫描。命中则报告路径 + 模式名 + 脱敏片段，确认或脱敏后再进门②。

## ⑥ 站点经验沉淀

成功且有新模式时更新 `site-patterns/<domain>.md`（本机生成、默认不入库，见仓库 `.gitignore`）。

## ⑦ 门②

按 `flow-gates.md` 展示摘要，确认原文无误后再进入 Figma 支路或 `flow-plan.md`。
