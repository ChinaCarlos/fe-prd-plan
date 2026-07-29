---
status: confirmed
generated_by: fe-prd-plan
design: figma
---

# [交互] 盛夏大狂欢 UI 规格

![设计稿](assets/design_screenshot.png)

## 1. 界面结构
*   **Frame**: 指尖逐浪 (375x812)
*   **Header**: 规则 (17:363), 攻略, 榜单。
*   **Board**: 4x4 棋盘 (`合成底 1`)。

## 2. 交互规范
### 2.1 技能激活 (Figma Spec)
*   **置灰逻辑**：激活技能 1 或 2 时，`Header` 和 `Footer` 非目标区域透明度降至 40%。
*   **动效**：合并时 Scale 1.2，分数抛物线飞入 Header。

### 2.2 按钮属性
*   **返回按钮**: 圆形 (R:17), 背景 #000000 (Opacity 0.35)。
