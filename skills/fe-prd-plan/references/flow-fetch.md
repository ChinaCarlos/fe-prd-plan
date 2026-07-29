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
5. **判断是否虚拟滚动/窗口化渲染**（常见于钉钉文档 `/note/preview`、在线表格等富文本编辑器）：
   - 判据：`document.body.scrollHeight` / `document.documentElement.scrollHeight` **约等于** `window.innerHeight`，但页面明显还有更多正文（标题只出现一部分、滚动条视觉上挂在内部某个区域而非浏览器窗口）。
   - 若**不是**虚拟滚动 → 走普通分支：`GET /scroll?target=ID&direction=bottom` 分页/触发懒加载，正文用 `POST /eval` 读 `document.body.innerText` 或更精确的容器 `innerText`。
   - 若**是**虚拟滚动 → 走 ③a「虚拟滚动分支」。
6. 提取结构化正文；可公开图片下载到 `source/assets/`；**强制**抓取页面**全屏**截图存为 `source/assets/prd_screenshot.png`（普通分支用 `GET /screenshot?fullPage=true` 即可；虚拟滚动分支的长图见 ③a）；需登录的资源用 navigate + `/screenshot` 后同样落入 `source/assets/`
7. `GET /close?target=ID` 关闭自建 tab

### ③a 虚拟滚动分支（长文档/长图）

根因：这类编辑器的 `document`/`body` 本身固定为视口高度，真正的正文滚动发生在内部某个 `div` 容器里，因此常规 `fullPage` 截图（依赖 `Page.getLayoutMetrics` 读 document 布局高度）和 `/scroll`（只滚 `window`）都会失效——**不是截图逻辑错了，是它读到的"页面高度"本身就是假的**。

处理步骤：

1. `GET /find-scroll-container?target=ID`（可选传 `selector` 显式指定）：自动探测真正可滚动的正文容器，并给它打临时属性 `data-cdp-scroll-target="1"`。
   - 返回 `found:false` → 说明该页面其实是 document 级滚动，回退普通分支。
   - **不要**把某次探测到的 class 名（如 styled-components 生成的哈希 class）硬编码进站点经验或代码里，每次构建都可能变化；只信任这个探测结果 + 打标记的方式。
2. **正文文字**：对 `[data-cdp-scroll-target="1"]` 循环 `POST /eval` 设置 `scrollTop` 并读取该容器的 `innerText`，每步累加/去重后拼成完整正文（比截图更省 token、更利于后续编辑，**不要**指望用截图 OCR 替代文字提取）。
3. **长图**：`POST /capture-scroll?target=ID`，body `{"outDir": "<outputDir>/source/assets/_capture_tmp"}`（不传 `selector` 时自动复用第 1 步探测逻辑），产出 `manifest.json` + 分段截图切片。
4. 拼接：`python3 <本 skill 目录>/scripts/stitch-long-page.py <outDir>/manifest.json <outputDir>/source/assets/prd_full_page.png`。
   - 依赖 Pillow；`check-deps.mjs` 会预检，缺失时先 `pip3 install --quiet Pillow`。
5. 拼好后**删除**中间目录（`_capture_tmp` 下的切片与 `manifest.json`），只保留最终的 `prd_full_page.png`，不落库中间产物。

### ③b 内嵌附件与外部链接边界（强制 · 禁止递归抓取）

**禁止**：为了"抓全"而对文档正文中出现的每一个外部超链接（其它钉钉/飞书/Confluence 文档、参考设计稿、历史需求链接等）逐个 `POST /new` 打开、递归解析——这类链接绝大多数只是「参考/背景资料」，逐个展开会显著拖慢流程且信息大多与当前需求无关。**默认只抓当前这一篇文档渲染出的内容**（含直接内嵌在页面里的图片/表格附件）。

例外（需同时满足，且仅限**当前文档内以「内嵌附件卡片」形式呈现**的资源，不含正文里的普通超链接）：

- 该附件是当前需求某个**关键数值/配置表**的唯一数据来源（例如奖励梯度、充值档位配置表），且 PRD 正文明确引用了它；
- 只打开这**一个**附件去读数据，**不**递归展开该附件内部可能再引用的其它文档/附件；
- 这类附件常是画布渲染的在线表格（如钉钉 axls），标准 DOM `click()` 往往打不开/翻不了页，需要 `POST /clickAt`（真实鼠标事件）点开，必要时用 `Input.dispatchMouseEvent` 模拟滚轮/翻页；
- 在门②展示给用户时，须**明确说明**「额外打开了 1 个内嵌附件《XX》，因为它是 XX 数据的唯一来源」，不要悄悄做掉。

若不确定某个链接是否需要打开，**先按不打开处理**，在 `open-questions.md` / 门②里列出该链接让用户决定，而不是默认展开。

## ④ 归档落盘

- 根目录 = 门①确认的 **`outputDir`**
- 正文 → `outputDir/source/<归档文件名>.md`
- 图片 → **`outputDir/source/assets/`**（与 Figma 存证同一目录；**禁止**另建 `outputDir/assets/`）
- **归档注意事项（强制避免覆盖）**：
  - **禁止使用通配符**：严禁 `cp *.png`。必须根据工具返回的确切路径或 ID 进行操作。
  - **大文件解析**：截图可能以 Base64 JSON 形式存在临时文本文件中，必须通过脚本解析 `base64` 字段并解码后落盘，不可直接重命名。
- 已存在则提示复用，不覆盖，除非用户要求刷新

（兼容说明：旧版默认 `docs/prd/<归档名>/` 等价于 `outputDir` 取该路径且可不建 `source/` 子目录；**新流程优先 `outputDir/source/`**，若用户明确要求扁平落在 `outputDir` 根下也可，须在门①写清。）

## ⑤ Secret Scan

对新写入 markdown 做密钥模式扫描。命中则报告路径 + 模式名 + 脱敏片段，确认或脱敏后再进门②。

## ⑥ 站点经验沉淀

成功且有新模式时更新 `site-patterns/<domain>.md`（本机生成、默认不入库，见仓库 `.gitignore`）。

记录「该 URL 模式是否虚拟滚动」「是否有需要走 ③b 例外的内嵌附件类型」等**判定条件**，**不要**记录某次探测到的具体 class 名/DOM 结构细节（易随对方前端构建变化而失效）；真正的容器定位始终交给 `/find-scroll-container` 临场探测。

## ⑦ 门②

按 `flow-gates.md` 展示摘要，确认原文无误后再进入 Figma 支路或 `flow-plan.md`。
