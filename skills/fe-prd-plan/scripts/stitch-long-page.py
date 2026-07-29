#!/usr/bin/env python3
"""将 cdp-proxy `/capture-scroll` 产出的 manifest.json + 切片截图拼接为一张完整长图。

用于应对虚拟滚动/窗口化渲染的文档编辑器（如钉钉文档 /note/preview）：
document/body 本身不滚动，真实正文在内部 div 里滚动，因此没法用常规
fullPage 截图一次拿到完整长图，需要分段截图后按各自的 scrollTop 精确拼接。

用法：
    python3 stitch-long-page.py <manifest.json> <output.png>

依赖：Pillow（`pip3 install --quiet Pillow`）。check-deps.mjs 会预先检测，
缺失时本脚本会给出同样的安装提示并以非 0 退出，不会静默失败。
"""
import sys
import json


def main():
    if len(sys.argv) < 3:
        print("用法: python3 stitch-long-page.py <manifest.json> <output.png>")
        sys.exit(1)

    manifest_path, out_path = sys.argv[1], sys.argv[2]

    try:
        from PIL import Image
    except ImportError:
        print("缺少 Pillow，请先执行: pip3 install --quiet Pillow，然后重试本命令")
        sys.exit(2)

    with open(manifest_path, encoding="utf-8") as f:
        manifest = json.load(f)

    geo = manifest.get("geo") or {}
    shots = manifest.get("shots") or []
    if not shots:
        print("manifest 中没有截图切片（shots 为空），无法拼接")
        sys.exit(3)

    dpr = geo.get("dpr", 1) or 1
    # 容器相对视口顶部的偏移（通常是页面固定头部/工具栏），需要保留一次，
    # 后续每张切片只贴容器可视区域那一段，避免头部在长图中重复出现。
    container_top_px = int(round(geo.get("top", 0) * dpr))
    client_h_px = int(round(geo.get("height", 0) * dpr))

    first_img = Image.open(shots[0]["file"])
    width = first_img.width
    if client_h_px <= 0:
        client_h_px = first_img.height - container_top_px

    max_scroll_top = max(s.get("scrollTop", 0) for s in shots)
    canvas_height = container_top_px + int(round(max_scroll_top * dpr)) + client_h_px
    canvas = Image.new("RGB", (width, canvas_height), "white")

    # 头部（容器顶部以上的固定区域，如导航栏/标题）只贴一次
    if container_top_px > 0:
        header_crop = first_img.crop((0, 0, width, container_top_px))
        canvas.paste(header_crop, (0, 0))

    for shot in shots:
        img = Image.open(shot["file"])
        scroll_top_px = int(round(shot.get("scrollTop", 0) * dpr))
        body_crop = img.crop((0, container_top_px, width, container_top_px + client_h_px))
        canvas.paste(body_crop, (0, container_top_px + scroll_top_px))

    canvas.save(out_path)
    print(f"saved {out_path} size={canvas.size}")


if __name__ == "__main__":
    main()
