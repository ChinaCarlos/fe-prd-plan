# CDP Proxy API 参考

改编自开源项目 web-access（作者：一泽Eze，MIT License），详见仓库根 `LICENSE` 的 Third-party notice。

## 基础信息

- 地址：`http://localhost:3456`
- 启动：`node <本 skill 目录>/scripts/check-deps.mjs`（会自动拉起 `cdp-proxy.mjs` 并常驻）
- 启动后持续运行，不建议主动停止（重启需浏览器重新授权 CDP 连接）
- 强制停止：`pkill -f cdp-proxy.mjs`

## API 端点

### GET /health
健康检查，返回连接状态。
```bash
curl -s http://localhost:3456/health
```

### GET /targets
列出所有已打开的页面 tab。返回数组，每项含 `targetId`、`title`、`url`。
```bash
curl -s http://localhost:3456/targets
```

### POST /new
创建新后台 tab，自动等待页面加载完成。**URL 通过 POST body 原样传入**，无需 URL-encode、不会因 query 中含 `&` 被切分。返回 `{ targetId }`。
```bash
curl -s -X POST --data-raw 'https://example.com' http://localhost:3456/new
```

### GET /close?target=ID
关闭指定 tab。
```bash
curl -s "http://localhost:3456/close?target=TARGET_ID"
```

### POST /navigate?target=ID
在已有 tab 中导航到新 URL，自动等待加载。**target 走 query（不带特殊字符的不透明 ID），URL 走 POST body**。
```bash
curl -s -X POST --data-raw 'https://example.com' "http://localhost:3456/navigate?target=ID"
```

### GET /back?target=ID
后退一页。
```bash
curl -s "http://localhost:3456/back?target=ID"
```

### GET /info?target=ID
获取页面基础信息（title、url、readyState）。
```bash
curl -s "http://localhost:3456/info?target=ID"
```

### POST /eval?target=ID
执行 JavaScript 表达式，POST body 为 JS 代码。
```bash
curl -s -X POST "http://localhost:3456/eval?target=ID" -d 'document.title'
```

### POST /click?target=ID
JS 层面点击（`el.click()`），POST body 为 CSS 选择器。自动 scrollIntoView 后点击。简单快速，覆盖大多数场景。
```bash
curl -s -X POST "http://localhost:3456/click?target=ID" -d 'button.submit'
```

### POST /clickAt?target=ID
CDP 浏览器级真实鼠标点击（`Input.dispatchMouseEvent`），POST body 为 CSS 选择器。先获取元素坐标，再模拟鼠标按下/释放。算真实用户手势，能触发文件对话框、绕过部分反自动化检测。
```bash
curl -s -X POST "http://localhost:3456/clickAt?target=ID" -d 'button.upload'
```

### POST /setFiles?target=ID
给 file input 设置本地文件路径（`DOM.setFileInputFiles`），完全绕过文件对话框。POST body 为 JSON。
```bash
curl -s -X POST "http://localhost:3456/setFiles?target=ID" -d '{"selector":"input[type=file]","files":["/path/to/file1.png"]}'
```

### GET /scroll?target=ID&y=3000&direction=down
滚动页面。`direction` 可选 `down`（默认）、`up`、`top`、`bottom`。滚动后自动等待 800ms 供懒加载触发。
```bash
curl -s "http://localhost:3456/scroll?target=ID&y=3000"
curl -s "http://localhost:3456/scroll?target=ID&direction=bottom"
```

### GET /screenshot?target=ID&file=/tmp/shot.png
截图。默认 `fullPage=true`（依赖 `Page.getLayoutMetrics` 读 `document` 布局高度撑视口截图）；指定 `file` 参数保存到本地文件，不指定则返回图片二进制；可选 `format=jpeg`。
```bash
curl -s "http://localhost:3456/screenshot?target=ID&file=/tmp/shot.png"
```

⚠️ **虚拟滚动/窗口化渲染的文档编辑器**（`document`/`body` 恒等于视口高度，真正正文在内部某个 `div` 里滚动，常见于钉钉文档 `/note/preview`）用这个接口会截不全——不是接口的 bug，是它读到的"页面高度"本身就是假的。这种情况改用下面两个接口，流程见 `flow-fetch.md`「③a 虚拟滚动分支」。

### GET /find-scroll-container?target=ID&selector=CSS(可选)
探测页面里真正可滚动的正文容器（应对上面提到的虚拟滚动场景）。不传 `selector` 时用启发式规则自动找 `overflow: auto/scroll` 且 `scrollHeight` 明显大于 `clientHeight` 的最大候选元素；找到后会给它打临时属性 `data-cdp-scroll-target="1"`，后续可直接拿 `[data-cdp-scroll-target="1"]` 当选择器，不依赖前端框架生成的哈希 class 名。
```bash
curl -s "http://localhost:3456/find-scroll-container?target=ID"
```
返回 `{found:false}` 说明该页面其实是 document 级滚动，直接用 `/scroll` + `/screenshot?fullPage=true` 即可。

### POST /capture-scroll?target=ID
对（自动探测或指定的）滚动容器按其可视高度为步长逐屏截图，直至滚到底，产出 `outDir/slice_N.png` + `outDir/manifest.json`（含容器几何信息 `geo` 与每张切片对应的 `scrollTop`）。**只截图，不提取文字**——正文文字仍需用 `/eval` 对同一容器分段读 `innerText`。
```bash
curl -s -X POST "http://localhost:3456/capture-scroll?target=ID" \
  -H 'Content-Type: application/json' \
  -d '{"outDir":"/abs/path/to/outputDir/source/assets/_capture_tmp"}'
```
Body 字段：`outDir`（必填，绝对路径）、`selector`（可选，跳过自动探测）、`step`（可选，滚动步长 px，默认用容器 `clientHeight`）、`maxSteps`（可选，默认 30，硬上限 60）、`settleMs`（可选，每步截图前的等待毫秒，默认 500，给虚拟滚动的懒渲染留时间）。

拿到 `manifest.json` 后用 Pillow 拼成一张完整长图：
```bash
python3 "<本 skill 目录>/scripts/stitch-long-page.py" outDir/manifest.json outputDir/source/assets/prd_full_page.png
```
`check-deps.mjs` 会预检 `python3` + `Pillow`，缺失时按提示 `pip3 install --quiet Pillow`。拼好后删除切片与 `manifest.json`，只保留最终长图。

## /eval 使用提示

- POST body 为任意 JS 表达式，返回 `{ value }` 或 `{ error }`
- 支持 `awaitPromise`：可以写 async 表达式
- 返回值必须是可序列化的（字符串、数字、对象），DOM 节点不能直接返回，需要提取属性
- 提取大量数据时用 `JSON.stringify()` 包裹，确保返回字符串
- 根据页面实际 DOM 结构编写选择器，不要套用固定模板

## 错误处理

| 错误 | 原因 | 解决 |
|------|------|------|
| `Chrome 未开启远程调试端口` | Chrome 未开启远程调试 | 提示用户打开 `chrome://inspect/#remote-debugging` 并勾选 Allow |
| `attach 失败` | targetId 无效或 tab 已关闭 | 用 `/targets` 获取最新列表 |
| `CDP 命令超时` | 页面长时间未响应 | 重试或检查 tab 状态 |
| `端口已被占用` | 另一个 proxy 已在运行 | 已有实例可直接复用 |
