#!/usr/bin/env node
// CDP Proxy - 通过 HTTP API 操控用户日常浏览器（Chrome / Edge / Chromium 等）
// 要求：浏览器已开启 remote debugging（chrome://inspect#remote-debugging toggle）
// Node.js 22+（使用原生 WebSocket）
// 改编自开源项目 web-access（作者：一泽Eze，MIT License，https://github.com/eze-is/web-access），
// 详见仓库根 LICENSE 的 Third-party notice。

import http from 'node:http';
import { URL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { selectBrowser, findFallbackPort } from './browser-discovery.mjs';

// --- 解析命令行 --browser 参数（本次启动用哪个浏览器）---
function parseBrowserArg() {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--browser' && argv[i + 1]) return argv[i + 1];
    if (argv[i].startsWith('--browser=')) return argv[i].slice('--browser='.length);
  }
  return null;
}
const BROWSER_OVERRIDE = parseBrowserArg();

const PORT = parseInt(process.env.CDP_PROXY_PORT || '3456');
let ws = null;
let cmdId = 0;
const pending = new Map(); // id -> {resolve, timer}
const sessions = new Map(); // targetId -> sessionId
const managedTabs = new Map(); // targetId -> { lastAccessed: number }
const TAB_IDLE_TIMEOUT = parseInt(process.env.CDP_TAB_IDLE_TIMEOUT || '900000'); // 15 min default
const CLEANUP_INTERVAL = 60000; // sweep every 60s

// --- WebSocket 兼容层 ---
let WS;
if (typeof globalThis.WebSocket !== 'undefined') {
  // Node 22+ 原生 WebSocket（浏览器兼容 API）
  WS = globalThis.WebSocket;
} else {
  // 回退到 ws 模块
  try {
    WS = (await import('ws')).default;
  } catch {
    console.error('[CDP Proxy] 错误：Node.js 版本 < 22 且未安装 ws 模块');
    console.error('  解决方案：升级到 Node.js 22+ 或执行 npm install -g ws');
    process.exit(1);
  }
}

// proxy 启动时连接到的浏览器（用于 /health 暴露给 check-deps 比较）
let connectedBrowser = null; // { id, label, source }

// pin 首次成功连接的浏览器 id。重连时只接受同一 id，避免悄悄降级到别的浏览器。
let pinnedBrowserId = null;

// --- 自动发现浏览器调试端口 ---
// 决策完全委派给 browser-discovery.selectBrowser；此处只做日志和返回结构包装。
async function discoverChromePort() {
  const result = await selectBrowser(BROWSER_OVERRIDE);
  if (result.kind === 'ok') {
    if (pinnedBrowserId && pinnedBrowserId !== result.browser.id) {
      throw new Error(
        `本次连接的浏览器已经是 ${pinnedBrowserId}，不会自动切到 ${result.browser.id}。` +
        `如果想换成 ${result.browser.id}，请先在终端运行 pkill -f cdp-proxy.mjs 重置。`
      );
    }
    pinnedBrowserId = result.browser.id;
    connectedBrowser = { id: result.browser.id, label: result.browser.label, source: result.source };
    const tag = result.source === 'override' ? '[--browser 指定]' : '[config.env 偏好]';
    console.log(`[CDP Proxy] 选用 ${result.browser.label} (端口 ${result.browser.port}${result.browser.wsPath ? '，带 wsPath' : ''}) ${tag}`);
    return { port: result.browser.port, wsPath: result.browser.wsPath };
  }
  // mismatch：有显式偏好但未检测到 —— 硬错，绝不降级
  if (result.kind === 'mismatch') {
    const expected = result.override || result.configured;
    const src = result.source === 'override' ? '本次指定' : '默认偏好';
    throw new Error(
      `${src}的浏览器是 "${expected}"，但没连上。Agent 处理顺序：` +
      `(1) 先用系统命令打开 ${expected}（按平台选择，如 macOS 的 open -a），稍等后重试请求；` +
      `(2) 若仍失败，说明远程调试开关没启用 —— 告知用户在地址栏访问 ${expected}://inspect/#remote-debugging 勾选 "Allow remote debugging for this browser instance"。`
    );
  }
  // 已 pin 过浏览器（如首次连上 edge 后 edge 退出）：拒绝任何 fallback
  if (pinnedBrowserId) {
    throw new Error(
      `本次连接的浏览器是 ${pinnedBrowserId}，但现在没连上。Agent 处理顺序：` +
      `(1) 先用系统命令打开 ${pinnedBrowserId}（按平台选择），稍等后重试请求；` +
      `(2) 若仍失败，告知用户在地址栏访问 ${pinnedBrowserId}://inspect/#remote-debugging 重新勾选允许。` +
      `若想换成其他浏览器，请先在终端运行 pkill -f cdp-proxy.mjs 重置。`
    );
  }
  // 仅在「从未成功连接 + 无偏好/override」时允许固定端口兜底（手动 --remote-debugging-port 启动场景）
  const fallbackPort = await findFallbackPort();
  if (fallbackPort !== null) {
    connectedBrowser = { id: 'unknown', label: '未知（通过手动调试端口连接）', source: 'fallback' };
    console.log(`[CDP Proxy] 通过手动调试端口连接: ${fallbackPort}`);
    return { port: fallbackPort, wsPath: null };
  }
  return null;
}

function getWebSocketUrl(port, wsPath) {
  if (wsPath) return `ws://127.0.0.1:${port}${wsPath}`;
  return `ws://127.0.0.1:${port}/devtools/browser`;
}

// --- WebSocket 连接管理 ---
let chromePort = null;
let chromeWsPath = null;

let connectingPromise = null;
async function connect() {
  if (ws && (ws.readyState === WS.OPEN || ws.readyState === 1)) return;
  if (connectingPromise) return connectingPromise;  // 复用进行中的连接

  if (!chromePort) {
    const discovered = await discoverChromePort();
    if (!discovered) {
      throw new Error(
        'Chrome 未开启远程调试端口。请用以下方式启动 Chrome：\n' +
        '  macOS: /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222\n' +
        '  Linux: google-chrome --remote-debugging-port=9222\n' +
        '  或在 chrome://flags 中搜索 "remote debugging" 并启用'
      );
    }
    chromePort = discovered.port;
    chromeWsPath = discovered.wsPath;
  }

  const wsUrl = getWebSocketUrl(chromePort, chromeWsPath);
  if (!wsUrl) throw new Error('无法获取 Chrome WebSocket URL');

  return connectingPromise = new Promise((resolve, reject) => {
    ws = new WS(wsUrl);

    const onOpen = () => {
      cleanup();
      connectingPromise = null;
      console.log(`[CDP Proxy] 已连接浏览器 (端口 ${chromePort})`);
      resolve();
    };
    const onError = (e) => {
      cleanup();
      connectingPromise = null;
      ws = null;
      chromePort = null;
      chromeWsPath = null;
      const msg = e.message || e.error?.message || '连接失败';
      console.error('[CDP Proxy] 连接错误:', msg, '（端口缓存已清除，下次将重新发现）');
      reject(new Error(msg));
    };
    const onClose = () => {
      console.log('[CDP Proxy] 连接断开');
      ws = null;
      chromePort = null; // 重置端口缓存，下次连接重新发现
      chromeWsPath = null;
      sessions.clear();
      managedTabs.clear();
    };
    const onMessage = (evt) => {
      const data = typeof evt === 'string' ? evt : (evt.data || evt);
      const msg = JSON.parse(typeof data === 'string' ? data : data.toString());

      if (msg.method === 'Target.attachedToTarget') {
        const { sessionId, targetInfo } = msg.params;
        sessions.set(targetInfo.targetId, sessionId);
      }
      // 拦截页面对 Chrome 调试端口的探测请求（反风控）
      if (msg.method === 'Fetch.requestPaused') {
        const { requestId, sessionId: sid } = msg.params;
        sendCDP('Fetch.failRequest', { requestId, errorReason: 'ConnectionRefused' }, sid).catch(() => {});
      }
      if (msg.id && pending.has(msg.id)) {
        const { resolve, timer } = pending.get(msg.id);
        clearTimeout(timer);
        pending.delete(msg.id);
        resolve(msg);
      }
    };

    function cleanup() {
      ws.removeEventListener?.('open', onOpen);
      ws.removeEventListener?.('error', onError);
    }

    // 兼容 Node 原生 WebSocket 和 ws 模块的事件 API
    if (ws.on) {
      ws.on('open', onOpen);
      ws.on('error', onError);
      ws.on('close', onClose);
      ws.on('message', onMessage);
    } else {
      ws.addEventListener('open', onOpen);
      ws.addEventListener('error', onError);
      ws.addEventListener('close', onClose);
      ws.addEventListener('message', onMessage);
    }
  });
}

function sendCDP(method, params = {}, sessionId = null) {
  return new Promise((resolve, reject) => {
    if (!ws || (ws.readyState !== WS.OPEN && ws.readyState !== 1)) {
      return reject(new Error('WebSocket 未连接'));
    }
    const id = ++cmdId;
    const msg = { id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('CDP 命令超时: ' + method));
    }, 30000);
    pending.set(id, { resolve, timer });
    ws.send(JSON.stringify(msg));
  });
}

// 已启用端口拦截的 session 集合（避免重复启用）
const portGuardedSessions = new Set();

async function ensureSession(targetId) {
  if (sessions.has(targetId)) return sessions.get(targetId);
  const resp = await sendCDP('Target.attachToTarget', { targetId, flatten: true });
  if (resp.result?.sessionId) {
    const sid = resp.result.sessionId;
    sessions.set(targetId, sid);
    // 启用调试端口探测拦截
    await enablePortGuard(sid);
    return sid;
  }
  throw new Error('attach 失败: ' + JSON.stringify(resp.error));
}

// 拦截页面对 Chrome 调试端口的探测（反风控）
// 只拦截 127.0.0.1:{chromePort} 的请求，不影响其他任何本地服务
async function enablePortGuard(sessionId) {
  if (!chromePort || portGuardedSessions.has(sessionId)) return;
  try {
    await sendCDP('Fetch.enable', {
      patterns: [
        { urlPattern: `http://127.0.0.1:${chromePort}/*`, requestStage: 'Request' },
        { urlPattern: `http://localhost:${chromePort}/*`, requestStage: 'Request' },
      ]
    }, sessionId);
    portGuardedSessions.add(sessionId);
  } catch { /* Fetch 域启用失败不影响主流程 */ }
}

// --- 闲置 Tab 自动清理 ---
function touchTab(targetId) {
  const entry = managedTabs.get(targetId);
  if (entry) entry.lastAccessed = Date.now();
}

async function cleanupIdleTabs() {
  if (!ws || (ws.readyState !== WS.OPEN && ws.readyState !== 1)) return;
  const now = Date.now();
  for (const [targetId, info] of managedTabs) {
    if (now - info.lastAccessed < TAB_IDLE_TIMEOUT) continue;
    try { await sendCDP('Target.closeTarget', { targetId }); } catch { /* tab may already be closed */ }
    sessions.delete(targetId);
    managedTabs.delete(targetId);
    console.log(`[CDP Proxy] Auto-closed idle tab: ${targetId}`);
  }
}

async function closeAllManagedTabs() {
  if (!ws || (ws.readyState !== WS.OPEN && ws.readyState !== 1)) return;
  const targets = [...managedTabs.keys()];
  for (const targetId of targets) {
    try { await sendCDP('Target.closeTarget', { targetId }); } catch { /* ignore */ }
    sessions.delete(targetId);
    managedTabs.delete(targetId);
  }
  if (targets.length) console.log(`[CDP Proxy] Shutdown: closed ${targets.length} managed tab(s)`);
}

// --- 等待页面加载 ---
async function waitForLoad(sessionId, timeoutMs = 15000) {
  // 启用 Page 域
  await sendCDP('Page.enable', {}, sessionId);

  return new Promise((resolve) => {
    let resolved = false;
    const done = (result) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      clearInterval(checkInterval);
      resolve(result);
    };

    const timer = setTimeout(() => done('timeout'), timeoutMs);
    const checkInterval = setInterval(async () => {
      try {
        const resp = await sendCDP('Runtime.evaluate', {
          expression: 'document.readyState',
          returnByValue: true,
        }, sessionId);
        if (resp.result?.result?.value === 'complete') {
          done('complete');
        }
      } catch { /* 忽略 */ }
    }, 500);
  });
}

// --- 读取 POST body ---
async function readBody(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  return body;
}

// --- 合并有重叠的文本片段（虚拟滚动容器分段截取时，相邻片段常有重叠的渲染缓冲区）---
// 用「找最长后缀=前缀重叠」的方式去重拼接，避免虚拟滚动分段读取到的正文重复。
// 限制单次比较长度，避免长文档下 O(n^2) 比较拖慢响应。
function mergeOverlappingText(chunks) {
  const MAX_OVERLAP_CHECK = 4000;
  let merged = '';
  for (const chunk of chunks) {
    if (!chunk) continue;
    if (!merged) { merged = chunk; continue; }
    const maxOverlap = Math.min(merged.length, chunk.length, MAX_OVERLAP_CHECK);
    let overlapLen = 0;
    for (let len = maxOverlap; len > 0; len--) {
      if (merged.slice(-len) === chunk.slice(0, len)) { overlapLen = len; break; }
    }
    merged += chunk.slice(overlapLen);
  }
  return merged;
}

// --- HTTP API ---
const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsed.pathname;
  const q = Object.fromEntries(parsed.searchParams);
  if (q.target) touchTab(q.target);

  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  try {
    // /health 不需要连接浏览器
    if (pathname === '/health') {
      const connected = ws && (ws.readyState === WS.OPEN || ws.readyState === 1);
      res.end(JSON.stringify({
        status: 'ok',
        connected,
        browser: connectedBrowser,
        sessions: sessions.size,
        managedTabs: managedTabs.size,
        chromePort,
      }));
      return;
    }

    await connect();

    // GET /targets - 列出所有页面
    if (pathname === '/targets') {
      const resp = await sendCDP('Target.getTargets');
      const pages = resp.result.targetInfos.filter(t => t.type === 'page');
      res.end(JSON.stringify(pages, null, 2));
    }

    // POST /new (body=URL) - 创建新后台 tab
    else if (pathname === '/new') {
      if (req.method !== 'POST') {
        res.statusCode = 400;
        res.end(JSON.stringify({
          error: '/new 需 POST 传 URL（避免目标 URL 含 query 时被错误切分）',
          example: "curl -X POST --data-raw 'https://example.com' http://localhost:3456/new",
        }));
        return;
      }
      const body = (await readBody(req)).trim();
      const targetUrl = body || 'about:blank';
      const resp = await sendCDP('Target.createTarget', { url: targetUrl, background: true });
      const targetId = resp.result.targetId;
      managedTabs.set(targetId, { lastAccessed: Date.now() });

      // 等待页面加载
      if (targetUrl !== 'about:blank') {
        try {
          const sid = await ensureSession(targetId);
          await waitForLoad(sid);
        } catch { /* 非致命，继续 */ }
      }

      res.end(JSON.stringify({ targetId }));
    }

    // GET /close?target=xxx - 关闭 tab
    else if (pathname === '/close') {
      const resp = await sendCDP('Target.closeTarget', { targetId: q.target });
      sessions.delete(q.target);
      managedTabs.delete(q.target);
      res.end(JSON.stringify(resp.result));
    }

    // POST /navigate?target=xxx (body=URL) - 导航（自动等待加载）
    else if (pathname === '/navigate') {
      if (req.method !== 'POST') {
        res.statusCode = 400;
        res.end(JSON.stringify({
          error: '/navigate 需 POST 传 URL（避免目标 URL 含 query 时被错误切分）',
          example: "curl -X POST --data-raw 'https://example.com' 'http://localhost:3456/navigate?target=ID'",
        }));
        return;
      }
      const targetUrl = (await readBody(req)).trim();
      const sid = await ensureSession(q.target);
      const resp = await sendCDP('Page.navigate', { url: targetUrl }, sid);

      // 等待页面加载完成
      await waitForLoad(sid);

      res.end(JSON.stringify(resp.result));
    }

    // GET /back?target=xxx - 后退
    else if (pathname === '/back') {
      const sid = await ensureSession(q.target);
      await sendCDP('Runtime.evaluate', { expression: 'history.back()' }, sid);
      await waitForLoad(sid);
      res.end(JSON.stringify({ ok: true }));
    }

    // POST /eval?target=xxx - 执行 JS
    else if (pathname === '/eval') {
      const sid = await ensureSession(q.target);
      const body = await readBody(req);
      const expr = body || q.expr || 'document.title';
      const resp = await sendCDP('Runtime.evaluate', {
        expression: expr,
        returnByValue: true,
        awaitPromise: true,
      }, sid);
      if (resp.result?.result?.value !== undefined) {
        res.end(JSON.stringify({ value: resp.result.result.value }));
      } else if (resp.result?.exceptionDetails) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: resp.result.exceptionDetails.text }));
      } else {
        res.end(JSON.stringify(resp.result));
      }
    }

    // POST /click?target=xxx - 点击（body 为 CSS 选择器）
    // JS 层面点击（简单快速，覆盖大多数场景）
    else if (pathname === '/click') {
      const sid = await ensureSession(q.target);
      const selector = await readBody(req);
      if (!selector) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'POST body 需要 CSS 选择器' }));
        return;
      }
      const selectorJson = JSON.stringify(selector);
      const js = `(() => {
        const el = document.querySelector(${selectorJson});
        if (!el) return { error: '未找到元素: ' + ${selectorJson} };
        el.scrollIntoView({ block: 'center' });
        el.click();
        return { clicked: true, tag: el.tagName, text: (el.textContent || '').slice(0, 100) };
      })()`;
      const resp = await sendCDP('Runtime.evaluate', {
        expression: js,
        returnByValue: true,
        awaitPromise: true,
      }, sid);
      if (resp.result?.result?.value) {
        const val = resp.result.result.value;
        if (val.error) {
          res.statusCode = 400;
          res.end(JSON.stringify(val));
        } else {
          res.end(JSON.stringify(val));
        }
      } else {
        res.end(JSON.stringify(resp.result));
      }
    }

    // POST /clickAt?target=xxx — CDP 浏览器级真实鼠标点击（算用户手势，能触发文件对话框、绕过反自动化检测）
    else if (pathname === '/clickAt') {
      const sid = await ensureSession(q.target);
      const selector = await readBody(req);
      if (!selector) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'POST body 需要 CSS 选择器' }));
        return;
      }
      const selectorJson = JSON.stringify(selector);
      const js = `(() => {
        const el = document.querySelector(${selectorJson});
        if (!el) return { error: '未找到元素: ' + ${selectorJson} };
        el.scrollIntoView({ block: 'center' });
        const rect = el.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, tag: el.tagName, text: (el.textContent || '').slice(0, 100) };
      })()`;
      const coordResp = await sendCDP('Runtime.evaluate', {
        expression: js,
        returnByValue: true,
        awaitPromise: true,
      }, sid);
      const coord = coordResp.result?.result?.value;
      if (!coord || coord.error) {
        res.statusCode = 400;
        res.end(JSON.stringify(coord || coordResp.result));
        return;
      }
      await sendCDP('Input.dispatchMouseEvent', {
        type: 'mousePressed', x: coord.x, y: coord.y, button: 'left', clickCount: 1
      }, sid);
      await sendCDP('Input.dispatchMouseEvent', {
        type: 'mouseReleased', x: coord.x, y: coord.y, button: 'left', clickCount: 1
      }, sid);
      res.end(JSON.stringify({ clicked: true, x: coord.x, y: coord.y, tag: coord.tag, text: coord.text }));
    }

    // POST /setFiles?target=xxx — 给 file input 设置本地文件（绕过文件对话框）
    // body: JSON { "selector": "input[type=file]", "files": ["/path/to/file1.png", "/path/to/file2.png"] }
    else if (pathname === '/setFiles') {
      const sid = await ensureSession(q.target);
      const body = JSON.parse(await readBody(req));
      if (!body.selector || !body.files) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: '需要 selector 和 files 字段' }));
        return;
      }
      // 获取 DOM 节点
      await sendCDP('DOM.enable', {}, sid);
      const doc = await sendCDP('DOM.getDocument', {}, sid);
      const node = await sendCDP('DOM.querySelector', {
        nodeId: doc.result.root.nodeId,
        selector: body.selector
      }, sid);
      if (!node.result?.nodeId) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: '未找到元素: ' + body.selector }));
        return;
      }
      // 设置文件
      await sendCDP('DOM.setFileInputFiles', {
        nodeId: node.result.nodeId,
        files: body.files
      }, sid);
      res.end(JSON.stringify({ success: true, files: body.files.length }));
    }

    // GET /scroll?target=xxx&y=3000 - 滚动
    else if (pathname === '/scroll') {
      const sid = await ensureSession(q.target);
      const y = parseInt(q.y || '3000');
      const direction = q.direction || 'down'; // down | up | top | bottom
      let js;
      if (direction === 'top') {
        js = 'window.scrollTo(0, 0); "scrolled to top"';
      } else if (direction === 'bottom') {
        js = 'window.scrollTo(0, document.body.scrollHeight); "scrolled to bottom"';
      } else if (direction === 'up') {
        js = `window.scrollBy(0, -${Math.abs(y)}); "scrolled up ${Math.abs(y)}px"`;
      } else {
        js = `window.scrollBy(0, ${Math.abs(y)}); "scrolled down ${Math.abs(y)}px"`;
      }
      const resp = await sendCDP('Runtime.evaluate', {
        expression: js,
        returnByValue: true,
      }, sid);
      // 等待懒加载触发
      await new Promise(r => setTimeout(r, 800));
      res.end(JSON.stringify({ value: resp.result?.result?.value }));
    }

    // GET /screenshot?target=xxx&file=/tmp/x.png - 截图
    // 默认执行全屏截图，除非传入 fullPage=false
    else if (pathname === '/screenshot') {
      const sid = await ensureSession(q.target);
      const format = q.format || 'png';
      const fullPage = q.fullPage !== 'false';

      let screenshotData;

      if (fullPage) {
        try {
          // 1. 获取页面布局指标
          const metrics = await sendCDP('Page.getLayoutMetrics', {}, sid);
          const contentSize = metrics.result?.contentSize || metrics.result?.cssContentSize;

          if (contentSize) {
            // 2. 强制覆盖视口尺寸以匹配内容高度
            await sendCDP('Emulation.setDeviceMetricsOverride', {
              width: contentSize.width,
              height: contentSize.height,
              deviceScaleFactor: 1,
              mobile: false,
            }, sid);

            // 3. 截图 (使用 captureBeyondViewport 增强兼容性)
            const resp = await sendCDP('Page.captureScreenshot', {
              format,
              quality: format === 'jpeg' ? 80 : undefined,
              captureBeyondViewport: true,
            }, sid);
            screenshotData = resp.result.data;

            // 4. 清除覆盖
            await sendCDP('Emulation.clearDeviceMetricsOverride', {}, sid);
          } else {
            throw new Error('无法获取页面内容尺寸');
          }
        } catch (err) {
          console.warn('[CDP Proxy] 全屏截图失败，退回到普通截图:', err.message);
          const resp = await sendCDP('Page.captureScreenshot', {
            format,
            quality: format === 'jpeg' ? 80 : undefined,
          }, sid);
          screenshotData = resp.result.data;
        }
      } else {
        const resp = await sendCDP('Page.captureScreenshot', {
          format,
          quality: format === 'jpeg' ? 80 : undefined,
        }, sid);
        screenshotData = resp.result.data;
      }

      if (q.file) {
        fs.writeFileSync(q.file, Buffer.from(screenshotData, 'base64'));
        res.end(JSON.stringify({ saved: q.file }));
      } else {
        res.setHeader('Content-Type', 'image/' + format);
        res.end(Buffer.from(screenshotData, 'base64'));
      }
    }

    // GET /find-scroll-container?target=xxx&selector=CSS(可选)
    // 探测页面「真正可滚动」的正文容器（应对虚拟滚动/窗口化渲染的富文本编辑器，
    // 如钉钉文档 /note/preview：document/body 本身不滚动，真实内容在内部 div 里）。
    // 找到后会给该元素打上临时属性 data-cdp-scroll-target="1"，供 /capture-scroll 直接选中，
    // 避免依赖 styled-components 等生成的哈希 class 名（每次构建可能变化，不可硬编码）。
    else if (pathname === '/find-scroll-container') {
      const sid = await ensureSession(q.target);
      const TAG_ATTR = 'data-cdp-scroll-target';
      const js = q.selector
        ? `(function(){
            var el = document.querySelector(${JSON.stringify(q.selector)});
            if (!el) return JSON.stringify({found:false, reason:'selector 未命中'});
            el.setAttribute('${TAG_ATTR}', '1');
            var rect = el.getBoundingClientRect();
            return JSON.stringify({found:true, top:rect.top, left:rect.left, width:rect.width, height:rect.height, scrollHeight:el.scrollHeight, clientHeight:el.clientHeight, dpr:window.devicePixelRatio});
          })()`
        : `(function(){
            // 启发式：找 overflow auto/scroll 且 scrollHeight 明显大于 clientHeight 的最大候选元素，
            // 排除过矮的装饰性滚动区（如小型 tooltip）。document.scrollingElement 本身可滚动时也会被比较到。
            var candidates = Array.from(document.querySelectorAll('body *')).filter(function(el){
              var cs = getComputedStyle(el);
              return (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 40 && el.clientHeight > 100;
            });
            if (!candidates.length) return JSON.stringify({found:false, reason:'未发现候选容器，页面可能本身就是 document 级滚动，直接用 /scroll 即可'});
            candidates.sort(function(a,b){ return (b.scrollHeight-b.clientHeight) - (a.scrollHeight-a.clientHeight); });
            var el = candidates[0];
            el.setAttribute('${TAG_ATTR}', '1');
            var rect = el.getBoundingClientRect();
            return JSON.stringify({found:true, top:rect.top, left:rect.left, width:rect.width, height:rect.height, scrollHeight:el.scrollHeight, clientHeight:el.clientHeight, dpr:window.devicePixelRatio, candidateCount:candidates.length});
          })()`;
      const resp = await sendCDP('Runtime.evaluate', { expression: js, returnByValue: true }, sid);
      let val;
      try { val = JSON.parse(resp.result?.result?.value); } catch { val = { found: false, reason: '探测脚本执行失败' }; }
      if (!val.found) { res.statusCode = 404; }
      res.end(JSON.stringify(val));
    }

    // POST /capture-scroll?target=xxx (body JSON: {selector?, outDir, step?, maxSteps?, settleMs?})
    // 应对虚拟滚动/窗口化渲染文档：无法一次性截长图（fullPage 截图依赖 document 布局尺寸，
    // 这类页面 document 高度恒等于视口高度，量不出真实内容高度）。
    // 做法：定位真实滚动容器（不传 selector 则自动探测，见 /find-scroll-container），
    // 按容器可视高度为步长**一次滚动**同时拿"这一屏的文字 + 这一屏的截图"（不分两趟滚，
    // 避免对同一文档滚两遍）；产出 outDir/slice_N.png + manifest.json（含每屏 text 与去重
    // 合并后的 mergedText）。manifest 再交给 stitch-long-page.py（Pillow）拼成一张完整长图。
    else if (pathname === '/capture-scroll') {
      const sid = await ensureSession(q.target);
      let body;
      try { body = JSON.parse((await readBody(req)) || '{}'); }
      catch { res.statusCode = 400; res.end(JSON.stringify({ error: 'body 需为 JSON' })); return; }
      const { outDir, selector, step, settleMs = 500 } = body;
      const maxSteps = Math.min(body.maxSteps || 30, 60); // 硬上限，避免探测失误导致死循环式截图
      if (!outDir) { res.statusCode = 400; res.end(JSON.stringify({ error: '需要 outDir（绝对路径）' })); return; }
      fs.mkdirSync(outDir, { recursive: true });

      const TAG_ATTR = 'data-cdp-scroll-target';
      const detectJs = selector
        ? `(function(){
            var el = document.querySelector(${JSON.stringify(selector)});
            if (!el) return JSON.stringify({found:false});
            el.setAttribute('${TAG_ATTR}', '1');
            var rect = el.getBoundingClientRect();
            return JSON.stringify({found:true, top:rect.top, height:rect.height, scrollHeight:el.scrollHeight, clientHeight:el.clientHeight, dpr:window.devicePixelRatio});
          })()`
        : `(function(){
            var candidates = Array.from(document.querySelectorAll('body *')).filter(function(el){
              var cs = getComputedStyle(el);
              return (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 40 && el.clientHeight > 100;
            });
            if (!candidates.length) return JSON.stringify({found:false});
            candidates.sort(function(a,b){ return (b.scrollHeight-b.clientHeight) - (a.scrollHeight-a.clientHeight); });
            var el = candidates[0];
            el.setAttribute('${TAG_ATTR}', '1');
            var rect = el.getBoundingClientRect();
            return JSON.stringify({found:true, top:rect.top, height:rect.height, scrollHeight:el.scrollHeight, clientHeight:el.clientHeight, dpr:window.devicePixelRatio});
          })()`;
      const detectResp = await sendCDP('Runtime.evaluate', { expression: detectJs, returnByValue: true }, sid);
      let geo;
      try { geo = JSON.parse(detectResp.result?.result?.value); } catch { geo = { found: false }; }
      if (!geo.found) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: '未找到可滚动容器，可显式传 selector 重试', geo }));
        return;
      }

      const targetSelector = `[${TAG_ATTR}="1"]`;
      const clientH = step || geo.height;
      let scrollTop = 0;
      const shots = [];

      // 单步：滚到 top → 读该容器当前渲染出的 innerText → 截图。三件事一次 CDP 往返序列做完，
      // 不再为了拿文字而单独把文档从头到尾再滚一遍。
      const captureStep = async (top) => {
        const scrollJs = `(function(){
          var el = document.querySelector(${JSON.stringify(targetSelector)});
          el.scrollTop = ${top};
          el.dispatchEvent(new Event('scroll', {bubbles:true}));
          return JSON.stringify({scrollTop: el.scrollTop, scrollHeight: el.scrollHeight});
        })()`;
        const stateResp = await sendCDP('Runtime.evaluate', { expression: scrollJs, returnByValue: true }, sid);
        let state;
        try { state = JSON.parse(stateResp.result?.result?.value); } catch { return null; }
        await new Promise(r => setTimeout(r, settleMs));
        // 滚动+等待渲染稳定后，同一时刻读文字 + 截图，避免文字和截图对应到不同的滚动状态
        const textJs = `(function(){
          var el = document.querySelector(${JSON.stringify(targetSelector)});
          return el ? el.innerText : '';
        })()`;
        const textResp = await sendCDP('Runtime.evaluate', { expression: textJs, returnByValue: true }, sid);
        const text = textResp.result?.result?.value || '';
        const shotResp = await sendCDP('Page.captureScreenshot', { format: 'png' }, sid);
        return { scrollTop: state.scrollTop, scrollHeight: state.scrollHeight, text, shotData: shotResp.result.data };
      };

      for (let i = 0; i < maxSteps; i++) {
        const result = await captureStep(scrollTop);
        if (!result) break;
        const filePath = path.join(outDir, `slice_${i}.png`);
        fs.writeFileSync(filePath, Buffer.from(result.shotData, 'base64'));
        shots.push({ scrollTop: result.scrollTop, file: filePath, text: result.text });

        const nextTop = scrollTop + clientH;
        if (nextTop >= result.scrollHeight) {
          const finalTop = Math.max(result.scrollHeight - clientH, 0);
          if (finalTop > result.scrollTop + 2) {
            const finalResult = await captureStep(finalTop);
            if (finalResult) {
              const finalFile = path.join(outDir, `slice_${i + 1}.png`);
              fs.writeFileSync(finalFile, Buffer.from(finalResult.shotData, 'base64'));
              shots.push({ scrollTop: finalResult.scrollTop, file: finalFile, text: finalResult.text });
            }
          }
          break;
        }
        scrollTop = nextTop;
      }

      const mergedText = mergeOverlappingText(shots.map(s => s.text));
      fs.writeFileSync(path.join(outDir, 'merged_text.txt'), mergedText);
      const manifest = { geo, shots, selector: targetSelector, mergedText };
      fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
      res.end(JSON.stringify(manifest));
    }

    // GET /info?target=xxx - 获取页面信息
    else if (pathname === '/info') {
      const sid = await ensureSession(q.target);
      const resp = await sendCDP('Runtime.evaluate', {
        expression: 'JSON.stringify({title: document.title, url: location.href, ready: document.readyState})',
        returnByValue: true,
      }, sid);
      res.end(resp.result?.result?.value || '{}');
    }

    else {
      res.statusCode = 404;
      res.end(JSON.stringify({
        error: '未知端点',
        endpoints: {
          '/health': 'GET - 健康检查',
          '/targets': 'GET - 列出所有页面 tab',
          '/new': 'POST body=URL - 创建新后台 tab（自动等待加载）',
          '/close?target=': 'GET - 关闭 tab',
          '/navigate?target=': 'POST body=URL - 导航（自动等待加载）',
          '/back?target=': 'GET - 后退',
          '/info?target=': 'GET - 页面标题/URL/状态',
          '/eval?target=': 'POST body=JS表达式 - 执行 JS',
          '/click?target=': 'POST body=CSS选择器 - 点击元素',
          '/scroll?target=&y=&direction=': 'GET - 滚动页面（仅 window/document 级）',
          '/screenshot?target=&file=': 'GET - 截图（fullPage 依赖 document 布局尺寸，虚拟滚动页面会截不全）',
          '/find-scroll-container?target=&selector=': 'GET - 探测/标记真正可滚动的正文容器（应对虚拟滚动编辑器）',
          '/capture-scroll?target=': 'POST body={outDir,selector?,step?,maxSteps?,settleMs?} - 单趟滚动同时采集分段文字(mergedText)+截图，产出可拼接长图的 manifest',
        },
      }));
    }
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: e.message }));
  }
});

// 检查端口是否被占用
function checkPortAvailable(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => { s.close(); resolve(true); });
    s.listen(port, '127.0.0.1');
  });
}

async function main() {
  // 检查是否已有 proxy 在运行
  const available = await checkPortAvailable(PORT);
  if (!available) {
    // 验证已有实例是否健康
    try {
      const ok = await new Promise((resolve) => {
        http.get(`http://127.0.0.1:${PORT}/health`, { timeout: 2000 }, (res) => {
          let d = '';
          res.on('data', c => d += c);
          res.on('end', () => resolve(d.includes('"ok"')));
        }).on('error', () => resolve(false));
      });
      if (ok) {
        console.log(`[CDP Proxy] 已有实例运行在端口 ${PORT}，退出`);
        process.exit(0);
      }
    } catch { /* 端口占用但非 proxy，继续报错 */ }
    console.error(`[CDP Proxy] 端口 ${PORT} 已被占用`);
    process.exit(1);
  }

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[CDP Proxy] 运行在 http://localhost:${PORT}`);
    // 启动时尝试连接 Chrome（非阻塞）
    connect().catch(e => console.error('[CDP Proxy] 初始连接失败:', e.message, '（将在首次请求时重试）'));
  });

  // 定时清理闲置 tab
  const cleanupTimer = setInterval(cleanupIdleTabs, CLEANUP_INTERVAL);
  cleanupTimer.unref();

  const shutdown = async (sig) => {
    console.log(`[CDP Proxy] ${sig}, cleaning up...`);
    clearInterval(cleanupTimer);
    await closeAllManagedTabs();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// 防止未捕获异常导致进程崩溃
process.on('uncaughtException', (e) => {
  console.error('[CDP Proxy] 未捕获异常:', e.message);
});
process.on('unhandledRejection', (e) => {
  console.error('[CDP Proxy] 未处理拒绝:', e?.message || e);
});

main();
