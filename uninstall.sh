#!/usr/bin/env bash
# fe-prd-plan 卸载脚本
#
# 用法：
#   交互式（本机已 clone 仓库）：  bash uninstall.sh
#   非交互式（curl | bash 管道）： curl -fsSL <uninstall_url> | bash -s -- -y
set -euo pipefail

INSTALL_DIR="${FE_PRD_PLAN_INSTALL_DIR:-$HOME/.cursor/plugins/local/fe-prd-plan}"

AUTO_YES=0
for arg in "$@"; do
  case "$arg" in
    -y|--yes) AUTO_YES=1 ;;
  esac
done

if [ ! -e "$INSTALL_DIR" ]; then
  echo "[fe-prd-plan] 未检测到已安装（$INSTALL_DIR 不存在），无需卸载。"
  exit 0
fi

if [ "$AUTO_YES" -ne 1 ]; then
  if [ -t 0 ]; then
    read -r -p "[fe-prd-plan] 即将删除 $INSTALL_DIR，确认？(y/N) " ans
    case "$ans" in
      y|Y) ;;
      *) echo "[fe-prd-plan] 已取消。"; exit 0 ;;
    esac
  else
    echo "[fe-prd-plan] 非交互环境，请加 -y 确认：curl -fsSL <uninstall_url> | bash -s -- -y"
    exit 1
  fi
fi

rm -rf "$INSTALL_DIR"
echo "[fe-prd-plan] 已卸载，请在 Cursor 执行 \"Developer: Reload Window\"。"
