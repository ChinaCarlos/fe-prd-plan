# 人工确认门（强制）

对用户可见文案用简体中文。优先用可点选的确认交互（若环境提供 AskQuestion）；否则明确列出「请回复：确认 / 修改意见」。

## 门 ① — 范围与落盘

**时机**：`flow-locate.md` 复述完成后、任何抓取/读稿之前。

须确认：

- 模式：`prd-only` / `prd+figma` / `figma-only`
- `outputDir`（绝对或相对仓库根的路径）
- 需求输入：链接 / 粘贴 / 本地已有 md
- Figma：每个 URL 对应的 `scopeNodeId`（无则写「无」）
- 归档目录名（若使用默认 `docs/prd/<名>/`）

**通过前禁止**：`check-deps` 以外的 CDP 抓取、`list_files` 之外的 Figma 读写、写入定稿文件。  
（允许：为向用户说明而只读本 Skill 文档。）

## 门 ② — 原文是否正确

**时机**：CDP 归档完成，或用户粘贴文本已落盘/已在对话中固定之后。

须确认：

- 标题与核心章节是否对
- 是否缺页 / 缺附件（需要则刷新或补链）

**通过前禁止**：Figma `get_node` / `get_screenshot`（`list_files` 可在门①后预检连接）、合成定稿。

## 门 ③ — 设计摘录是否认账

**时机**：`figma-excerpt.md` 草稿写完后。无 Figma 则**跳过本门**。

须确认：

- 分区 / 控件列表是否有误判（装饰当按钮、漏弹窗等）
- 缺口表：哪些态稿面没有、是否要做
- TEXT 预归类是否要改

**通过前禁止**：把摘录当最终交互定稿写入 `interaction.md` 的 confirmed 状态。

## 门 ④ — 合成定稿

**时机**：`flow-merge.md` 产出 draft，且 `open-questions.md` 中冲突项已有用户抉择（或明确「暂不关闭、保持 draft」）。

须确认：

- 冲突项处理结果
- `requirements.md` / `interaction.md` / `plan.md` 可升为 `status: confirmed`

**通过后**：本 Skill 结束；提示路径与「不写代码」。

## 合并小问

单个文案归类、单字段用词等细节，并入门③或门④，避免超过 4 次主打断。
