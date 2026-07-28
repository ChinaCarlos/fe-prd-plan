#!/usr/bin/env bash
# fe-prd-plan 一键安装脚本（oh-my-zsh / homebrew 风格）
#
# 用法：
#   curl -fsSL https://raw.githubusercontent.com/ChinaCarlos/fe-prd-plan/main/install.sh | bash
#
# 重复执行 = 更新到最新版本（幂等，会保留本机生成的 config.env / site-patterns）。
set -euo pipefail

REPO_URL="${FE_PRD_PLAN_REPO_URL:-https://github.com/ChinaCarlos/fe-prd-plan.git}"
BRANCH="${FE_PRD_PLAN_BRANCH:-main}"
INSTALL_DIR="${FE_PRD_PLAN_INSTALL_DIR:-$HOME/.cursor/plugins/local/fe-prd-plan}"
SKILL_REL="skills/fe-prd-plan"

info()  { echo "[fe-prd-plan] $*"; }
warn()  { echo "[fe-prd-plan] 警告: $*" >&2; }
error() { echo "[fe-prd-plan] 错误: $*" >&2; exit 1; }

# --- 环境检查 ---

command -v git >/dev/null 2>&1 || error "未找到 git，请先安装 git 后重试。"

if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  if [ "${NODE_MAJOR:-0}" -lt 22 ] 2>/dev/null; then
    warn "检测到 Node.js 版本 < 22（当前 $(node -v 2>/dev/null)）。文档抓取能力依赖 Node 22+ 原生 WebSocket，建议升级；不影响本次安装。"
  else
    info "node: ok ($(node -v))"
  fi
else
  warn "未检测到 Node.js（建议安装 22+ 版本）。当前仅安装 skill 文件，文档抓取能力需装好 Node 后才能使用。"
fi

if [ -L "$INSTALL_DIR" ]; then
  error "$INSTALL_DIR 是符号链接（可能是本地开发挂载），本脚本不会动它。如需正式安装，先手动删除该软链接再重跑。"
fi

# --- 下载最新版本到临时目录 ---

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

info "下载最新版本（分支 ${BRANCH}）..."
if ! git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$TMP_DIR/repo" >/dev/null 2>&1; then
  error "clone 失败，请检查网络或仓库地址：$REPO_URL"
fi

# --- 备份本机生成的文件（重装/升级时不能丢） ---

BACKUP_DIR="$(mktemp -d)"
CONFIG_ENV="$INSTALL_DIR/$SKILL_REL/scripts/config.env"
SITE_PATTERNS_DIR="$INSTALL_DIR/$SKILL_REL/references/site-patterns"

if [ -f "$CONFIG_ENV" ]; then
  cp "$CONFIG_ENV" "$BACKUP_DIR/config.env"
fi
if [ -d "$SITE_PATTERNS_DIR" ]; then
  mkdir -p "$BACKUP_DIR/site-patterns"
  cp -R "$SITE_PATTERNS_DIR"/. "$BACKUP_DIR/site-patterns/" 2>/dev/null || true
fi

# --- 安装（覆盖式） ---

info "安装到 $INSTALL_DIR ..."
mkdir -p "$INSTALL_DIR"
rm -rf "${INSTALL_DIR:?}/.cursor-plugin" "${INSTALL_DIR:?}/skills"
cp -R "$TMP_DIR/repo/.cursor-plugin" "$INSTALL_DIR/.cursor-plugin"
cp -R "$TMP_DIR/repo/skills" "$INSTALL_DIR/skills"

# --- 还原本机生成的文件 ---

if [ -f "$BACKUP_DIR/config.env" ]; then
  cp "$BACKUP_DIR/config.env" "$CONFIG_ENV"
  info "已保留原有浏览器偏好配置（config.env）"
fi
if [ -d "$BACKUP_DIR/site-patterns" ]; then
  mkdir -p "$SITE_PATTERNS_DIR"
  cp -R "$BACKUP_DIR/site-patterns"/. "$SITE_PATTERNS_DIR/" 2>/dev/null || true
  info "已保留原有站点经验（site-patterns）"
fi
rm -rf "$BACKUP_DIR"

# --- 清理：安装目录只保留运行时需要的文件，不留开发用文件 ---

rm -rf "$INSTALL_DIR/.git" 2>/dev/null || true
rm -f "$INSTALL_DIR/CHANGELOG.md" "$INSTALL_DIR/.gitignore" 2>/dev/null || true

# --- 一次性风险提示（首次安装展示，升级不重复刷屏） ---

MARKER="$INSTALL_DIR/.risk_notice_shown"
if [ ! -f "$MARKER" ]; then
  cat <<'EOF'

────────────────────────────────────────────────────────────
温馨提示：fe-prd-plan 的文档抓取能力基于浏览器自动化（CDP），
部分站点对自动化操作检测严格，存在账号被限制/封禁的风险。
已内置基础防护但无法完全避免，继续使用即视为知晓并接受该风险。
────────────────────────────────────────────────────────────

EOF
  touch "$MARKER"
fi

info "安装完成 ✅  安装目录：$INSTALL_DIR"
info "下一步：在 Cursor 命令面板执行 \"Developer: Reload Window\" 使其生效。"
info "再次运行本命令即可更新到最新版本（会保留你的浏览器偏好与站点经验）。"
