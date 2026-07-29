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
| **用户直接粘贴/发送需求文档截图**（图片，无链接） | 跳过③ CDP 抓取，走「②a 截图输入」，直接门② |
| 模糊指代「之前那篇」 | 先定位确切 URL 再走③ |

`figma-only` 模式：跳过整个 fetch，门②改为确认「本次无 PRD 原文」。

### ②a 截图输入（强制 · 无链接时的替代来源）

**适用场景**：用户没有给可访问的文档链接（或链接需要额外权限、懒得开），而是直接在对话里贴了需求文档的截图（可能是完整页面截图，也可能是分几张贴的局部截图）。这种情况**不需要**、也**不能**走 CDP（没有 URL 可打开），直接用 Agent 自身的图像理解能力识别内容。

处理步骤：

1. 按用户发送顺序，对每张截图做**完整**转录：文字、表格数值、UI 标注、箭头/批注说明都要读出来，写成结构化 Markdown（标题层级、表格化），**不是**简单一句「这是一张需求截图，讲了 XX」的图片描述。
2. 原图按顺序另存到 `outputDir/source/assets/req_screenshot_1.png`（`_2`、`_3` …），正文里按需引用。
3. **完整性判断**：若截图明显只是局部（能看到滚动条不在顶/底、内容被截断、出现"更多内容见下页"之类提示、章节编号不连续等），**不能**假装已经拿到全文——在 `open-questions.md` / 门②里明确提示用户「当前只根据你发的 N 张截图转录，看起来可能不是全文，如果还有更多请补充或换成文档链接」。
4. 与 ③c 同样的红线：不能因为某段内容"看起来超出本次范围"就摘要/略写，截图里写了什么就转录什么，范围裁剪留给 `requirements.md`。
5. 落盘：写入 `outputDir/source/<归档文件名>.md`，`fetch_note` 里注明来源是"用户粘贴截图（N 张），非链接抓取，Agent 视觉转录"，供后续核对时知道可信度来源。

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

处理步骤（**只滚一趟**：文字和截图在同一次滚动里一起拿，不要分两个循环重复滚同一份文档）：

1.（可选）`GET /find-scroll-container?target=ID` 先探测确认一下真正可滚动的正文容器；不传也没关系，`/capture-scroll` 内部会自动做同样的探测。
   - 返回 `found:false` → 说明该页面其实是 document 级滚动，回退普通分支。
   - **不要**把某次探测到的 class 名（如 styled-components 生成的哈希 class）硬编码进站点经验或代码里，每次构建都可能变化；只信任临场探测 + 打标记的方式。
2. **一次调用拿全**：`POST /capture-scroll?target=ID`，body `{"outDir": "<outputDir>/source/assets/_capture_tmp"}`。它会自动定位容器后逐屏滚动，**每停一步同时**截图 + 读该容器当前渲染出的 `innerText`，返回 `manifest.json`：
   - `shots[].text`：每屏读到的文字
   - `mergedText`：对 `shots[].text` 做重叠去重后拼接的完整正文（虚拟滚动相邻两屏渲染常有缓冲区重叠，接口已处理，不需要再手动去重），同时落盘 `outDir/merged_text.txt`
   - 直接用 `mergedText` 作为归档正文的素材，整理成 Markdown 时**不能**再精简内容（见 ③c）。
3. **长图**：`python3 <本 skill 目录>/scripts/stitch-long-page.py <outDir>/manifest.json <outputDir>/source/assets/prd_full_page.png`（用的是第 2 步已经产出的同一份 `manifest.json`，不需要再滚一遍）。
   - 依赖 Pillow；`check-deps.mjs` 会预检，缺失时先 `pip3 install --quiet Pillow`。
   - 这一步只是为了产出一张人工核对/存证用的长图，**不是**为了拿文字——文字已经在第 2 步的 `mergedText` 里了。
4. 拼好后**删除**中间目录（`_capture_tmp` 下的切片、`manifest.json`、`merged_text.txt`），只保留最终的 `prd_full_page.png`，不落库中间产物。

### ③b 内嵌附件与外部链接边界（强制 · 禁止递归抓取）

**禁止**：为了"抓全"而对文档正文中出现的每一个外部超链接（其它钉钉/飞书/Confluence 文档、参考设计稿、历史需求链接等）逐个 `POST /new` 打开、递归解析——这类链接绝大多数只是「参考/背景资料」，逐个展开会显著拖慢流程且信息大多与当前需求无关。**默认只抓当前这一篇文档渲染出的内容**（含直接内嵌在页面里的图片/表格附件）。

例外（需同时满足，且仅限**当前文档内以「内嵌附件卡片」形式呈现**的资源，不含正文里的普通超链接）：

- 该附件是当前需求某个**关键数值/配置表**的唯一数据来源（例如奖励梯度、充值档位配置表），且 PRD 正文明确引用了它；
- 只打开这**一个**附件去读数据，**不**递归展开该附件内部可能再引用的其它文档/附件；
- 这类附件常是画布渲染的在线表格（如钉钉 axls），标准 DOM `click()` 往往打不开/翻不了页，需要 `POST /clickAt`（真实鼠标事件）点开，必要时用 `Input.dispatchMouseEvent` 模拟滚轮/翻页；
- 在门②展示给用户时，须**明确说明**「额外打开了 1 个内嵌附件《XX》，因为它是 XX 数据的唯一来源」，不要悄悄做掉。

若不确定某个链接是否需要打开，**先按不打开处理**，在 `open-questions.md` / 门②里列出该链接让用户决定，而不是默认展开。

### ③c 归档完整性（强制 · 禁止因「超出范围」摘要/略写）

**根因场景**：③/③a 已经完整采集到某节正文（比如判断为「本次不实现」的相邻功能），但写入 `source/*.md` 时因为觉得"反正超出范围/用不上"就写成「略」「详见截图」「摘录存档」等占位语，导致归档比实际文档缩水一大截——这不是采集能力问题，是**归档时手滑丢内容**，必须杜绝。

规则：

- `outputDir/source/<归档文件名>.md` 必须是对该文档正文的**完整转录**：允许整理成 Markdown 格式（标题层级、表格化、去掉「点赞/评论/文档关系图」等页面噪音页脚），**不允许**因为判断某节「超出本次范围」「暂不实现」而省略、摘要或用「略/详见截图」代替其正文内容。
- **范围裁剪只体现在下游文档**：某功能是否在本次实现范围内，应在 `requirements.md` 的「本次范围」章节里说明（如"3.2 节功能超出本次范围，仅记录不实现"），**不能**反过来影响 `source/` 归档的完整度——source 是「这篇文档原本写了什么」的忠实记录，requirements 才是「这次要做什么」的裁剪结果，两者不能混为一谈。
- 篇幅确实很大时，可将某节拆到 `source/<归档文件名>-appendix-<slug>.md` 并在主文件对应位置用相对链接引用，但**不能丢内容**，只是换个文件放。
- **归档后自检**：不少文档编辑器（如钉钉）会在页面角落显示全文字数（如「1707 个字」），可作为完整性的粗校验——归档 markdown 的正文字数明显少于该计数，视为归档不完整，需回头把被略写的段落补全，再进门②。若站点没有这类计数器，至少按章节标题逐条核对「原文有的小节，归档文件里都要有实质内容，而不是占位语」。

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
