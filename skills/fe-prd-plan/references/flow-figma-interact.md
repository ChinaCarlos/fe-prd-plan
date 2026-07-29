# Figma 只读交互识别

**仅当模式含 Figma 且门①、门②已通过（`figma-only` 时门②可改为确认「无 PRD、仅凭稿」）后执行。**  
完整步骤见本文件；合并规则见 `flow-merge.md`。

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
2. `get_screenshot`（带 scope `nodeId` + connected `fileKey`）— 视觉基准；可在对话展示，**不要**写入业务 `images/`
   - **注意**：截图通常以 Base64 JSON 形式输出至临时文本文件，须解析后解码保存，严禁使用通配符拷贝导致文件覆盖。
3. `get_node(scopeNodeId)` — 层级、bounds、TEXT、明显控件 Frame
4. 可选 `get_design_context`（depth 适中）辅助分区语义
5. **禁止** `save_screenshots` 以及任何切图落盘

调用前用 `GetDynamicTools` 核对当前命名空间下工具 schema，再 `CallDynamicTool`。

## 识别产出（写入 `outputDir/figma-excerpt.md`）

按 [`skeletons/figma-excerpt.md.skeleton`](skeletons/figma-excerpt.md.skeleton) 填写，至少包含：

- Scope 元信息（url、scopeNodeId、connected fileKey）
- 页面分区表
- 控件清单（按钮 / Tab / 列表 / 输入等）+ 推测交互 + **置信度**
- TEXT 预归类：`whole-btn-text` / `jsx-fixed` / `dynamic` / `未知`
- 状态与缺口（稿面已见 vs PRD 提到但未见）

**置信度低或未见的态不得写成既定事实**——进缺口表，留给门③ / `open-questions.md`。

## 门③

展示分区摘要、控件表、缺口表，等用户确认或改正后再进入 `flow-merge.md`。
