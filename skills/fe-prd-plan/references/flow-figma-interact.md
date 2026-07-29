# Figma 只读交互识别

**仅当模式含 Figma 且门①、门②已通过（`figma-only` 时门②可改为确认「无 PRD、仅凭稿」）后执行。**  
完整步骤见本文件；合并规则见 `flow-merge.md`。

> 用户没给 Figma **链接**、而是直接贴了设计**截图**时，不适用本文件的 `list_files`/`get_node` 流程（没有 URL 就没有 `fileKey`/`nodeId`），改走文末「设计截图直读（无 Figma 链接）」。

## 前置

1. 确认会话中 **spark-figma-mcp**（或 `user-spark-figma-mcp`）可用；优先用**已连接**实例，避免与插件 `.mcp.json` 重复拉起冲突。
2. 调用 **`list_files`**：拿到插件实际连接的 `fileKey`（常为 `unsaved-*`）。**禁止**只用 URL 里的永久 `fileKey` 导致误报未连接。
3. `list_files` 为空或失败 → 暂停：请用户用桌面 Figma 打开文件并 Run **Spark-Figma-Plugin**，完成后重试。可降级为「本次跳过 Figma，仅 PRD 出文档」。

## 范围（强制）

- 每个用户给出的 URL → **仅**其 `scopeNodeId` 子树。
- **禁止**：`get_document`、无明文时的 scope 外 `get_node`、按全文件尺寸筛 Frame、脚本全树 walk。
- 多个链接：逐个处理，摘录写入同一 `figma-excerpt.md` 的分节；汇总后一次走门③（避免每链打断，除非单链结果明显异常需先问）。

## 调用顺序（每个 scope）

1. `list_files`（每个会话至少一次；换文件再调）
2. `get_screenshot`（带 scope `nodeId` + connected `fileKey`）— 视觉基准；**可在对话展示**
3. **落盘存证（强制统一路径）**：将截图解码后写入  
   `{outputDir}/source/assets/design_screenshot.png`  
   （多 scope 时：主 scope 用此文件名；其余用 `design_screenshot_2.png`、`design_screenshot_3.png` …）  
   - 截图常以 Base64/临时文本返回：须解析解码后写入上述路径；**禁止**通配符拷贝覆盖错文件  
   - **禁止**写入业务活动 `images/`（那是实现 Skill 切图目录）  
   - **禁止** `save_screenshots`（分项切图）
4. `get_node(scopeNodeId)` — 层级、bounds、TEXT、明显控件 Frame
5. 可选 `get_design_context`（depth 适中）辅助分区语义

调用前用 `GetDynamicTools` 核对当前命名空间下工具 schema，再 `CallDynamicTool`。

## 识别产出（写入 `outputDir/figma-excerpt.md`）

按 [`skeletons/figma-excerpt.md.skeleton`](skeletons/figma-excerpt.md.skeleton) 填写，至少包含：

- Scope 元信息（url、scopeNodeId、connected fileKey）
- 页面分区表
- 控件清单（按钮 / Tab / 列表 / 输入等）+ 推测交互 + **置信度**
- TEXT 预归类：`whole-btn-text` / `jsx-fixed` / `dynamic` / `未知`
- 状态与缺口（稿面已见 vs PRD 提到但未见）
- 截图相对路径：`source/assets/design_screenshot.png`（或 `_2` …）

**置信度低或未见的态不得写成既定事实**——进缺口表，留给门③ / `open-questions.md`。

## 门③

展示分区摘要、控件表、缺口表，等用户确认或改正后再进入 `flow-merge.md`。

## 设计截图直读（无 Figma 链接）

**适用场景**：用户没给 Figma URL，而是直接在对话里贴了设计稿/交互稿的截图（高保真图、线框图、状态说明图等）。没有 `fileKey`/`nodeId`，spark-figma-mcp 的 `list_files`/`get_node`/`get_design_context` 全用不上，**不要**为了凑节点数据反过来问用户要 Figma 链接卡住流程——截图本身就是这次的设计输入，直接读。

处理步骤：

1. 按用户发送顺序，对每张设计截图做视觉识别：分区/组件边界、文案、状态（默认态/禁用态/选中态等，若图上有画出来）、明显的交互提示（箭头、批注文字）。
2. 原图按顺序另存到 `outputDir/source/assets/design_screenshot.png`（`_2`、`_3` …），与 Figma 支路的存证路径统一，不要另建目录。
3. 识别产出仍写入 `outputDir/figma-excerpt.md`（复用同一份骨架），但**必须**在文件开头注明来源差异：

   ```markdown
   > 来源：用户提供的设计截图（非 Figma 节点数据）。以下分区/间距/坐标为视觉估测，
   > 不是 Figma bounds 精确值；如需 1:1 走查级别的还原，建议后续补充 Figma 链接。
   ```

4. **精度降级是必须明说的事实，不是免责声明摆设**：控件清单的「置信度」列这种情况下整体上限为「中」，不能给「高」；稿面细节（如精确间距、字号、hex 色值）读不出来的，如实标「截图无法判断，需人工核对」，不得编造具体数值。
5. 门③展示时，除常规分区/控件/缺口表外，**额外提醒**用户一次「当前设计输入是截图不是 Figma 链接，还原精度有限，是否需要换成/补充 Figma 链接」，由用户决定是否继续。
