/* ==========================================================================
   tools/probe.mjs —— 用 Edge 的 DevTools 协议把主页跑一遍
   · 收集控制台错误 / 未捕获异常
   · 量关键元素的盒模型、检查横向溢出
   · 截图（含交互后的状态）
   用法: node tools/probe.mjs "<file url>" <width> <height> <outPrefix>
   需要先启动带 --remote-debugging-port=9222 的 Edge
   ========================================================================== */
import { setTimeout as delay } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';

const PORT = Number(process.env.CDP_PORT || 9222);
const URL_ = process.argv[2];
const W = Number(process.argv[3] || 1600);
const H = Number(process.argv[4] || 900);
const OUT = process.argv[5] || 'probe';
if (!URL_) { console.error('用法: node probe.mjs <url> <w> <h> <outPrefix>'); process.exit(2); }

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.waits = new Map(); this.handlers = [];
    ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.waits.has(msg.id)) {
        const { res, rej } = this.waits.get(msg.id);
        this.waits.delete(msg.id);
        if (msg.error) rej(new Error('CDP ' + JSON.stringify(msg.error))); else res(msg.result);
      } else if (msg.method) {
        this.handlers.slice().forEach(h => h(msg));
      }
    });
  }
  send(method, params, sessionId) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.waits.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params: params || {}, sessionId }));
    });
  }
  on(fn) { this.handlers.push(fn); }
  waitFor(method, timeout = 20000) {
    return new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('timeout waiting ' + method)), timeout);
      const h = m => {
        if (m.method === method) {
          clearTimeout(t);
          this.handlers = this.handlers.filter(x => x !== h);
          res(m.params);
        }
      };
      this.handlers.push(h);
    });
  }
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener('open', () => resolve(ws), { once: true });
    ws.addEventListener('error', () => reject(new Error('WebSocket 连不上')), { once: true });
  });
}

const report = { viewport: [W, H], errors: [], metrics: null, tests: [] };

const ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
const cdp = new CDP(await connect(ver.webSocketDebuggerUrl));
const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p) => cdp.send(m, p, sessionId);

cdp.on(msg => {
  const p = msg.params || {};
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = p.exceptionDetails || {};
    report.errors.push('EXCEPTION: ' + ((d.exception && d.exception.description) || d.text));
  } else if (msg.method === 'Runtime.consoleAPICalled' && (p.type === 'error' || p.type === 'warning')) {
    report.errors.push(p.type.toUpperCase() + ': ' + (p.args || []).map(a => a.value !== undefined ? a.value : a.description).join(' '));
  } else if (msg.method === 'Log.entryAdded' && p.entry && p.entry.level === 'error') {
    const t = p.entry.text || '';
    if (!/favicon|net::ERR|Failed to load resource/i.test(t)) report.errors.push('LOG: ' + t);
  }
});

await S('Page.enable');
await S('Runtime.enable');
await S('Log.enable');
await S('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await S('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});   // 让动画/过渡真的跑起来
/* Edge/Chrome 的「自动深色模式」会把浅色页面整页反色（跟页面 CSS 无关），测试时关掉 */
await S('Emulation.setAutoDarkModeOverride', { enabled: false }).catch(() => {});
const loaded = cdp.waitFor('Page.loadEventFired', 90000);
await S('Page.navigate', { url: URL_ });
await loaded;
if (process.env.RESET === '1') {
  await S('Runtime.evaluate', { expression: `localStorage.clear()` });
  const again = cdp.waitFor('Page.loadEventFired', 90000);
  await S('Page.reload');
  await again;
}
await delay(5500);   // 等自动抓图标

async function evalJS(expr) {
  const r = await S('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
}

async function shot(name) {
  const { data } = await S('Page.captureScreenshot', { format: 'png' });
  writeFileSync(name, Buffer.from(data, 'base64'));
}

/* ---------------- 1. 布局指标 ---------------- */
report.metrics = await evalJS(`(() => {
  const box = el => { if (!el) return null; const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const cs = el => el ? getComputedStyle(el) : null;
  const tiles = Array.from(document.querySelectorAll('.tile'));
  const icos = Array.from(document.querySelectorAll('.tile-ico'));
  return {
    docScrollW: document.documentElement.scrollWidth,
    docClientW: document.documentElement.clientWidth,
    docScrollH: document.documentElement.scrollHeight,
    winH: window.innerHeight,
    themeAttr: document.documentElement.dataset.theme,
    prefersDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
    savedTheme: (() => { try { return (JSON.parse(localStorage.getItem('xueran-home/config/v1')) || {}).theme || null; } catch (e) { return 'ERR'; } })(),
    bodyBg: getComputedStyle(document.body).backgroundColor,
    frame: box(document.querySelector('.frame')),
    side: box(document.querySelector('.side')),
    main: box(document.querySelector('.main')),
    brandArt: box(document.querySelector('.brand-art')),
    brandArtH: cs(document.querySelector('.brand-art')).height,
    brandImg: box(document.querySelector('#brandImg')),
    char: box(document.querySelector('.char-img')),
    search: box(document.querySelector('.search')),
    tilesScroll: box(document.querySelector('.tiles-scroll')),
    gridCols: cs(document.querySelector('.tiles')).gridTemplateColumns,
    tileCount: tiles.length,
    tileNames: tiles.filter(t => !t.classList.contains('tile-add')).map(t => t.querySelector('.tile-name').textContent),
    tileBox: box(document.querySelector('.tile-box')),
    iconsReady: icos.filter(i => i.classList.contains('ready')).length,
    charFallbacks: tiles.filter(t => { const c = t.querySelector('.tile-char'); return c && c.style.display !== 'none'; }).length,
    wave: box(document.querySelector('.wave')),
    waveOpacity: cs(document.querySelector('.wave')).opacity,
    pet: box(document.querySelector('#pet')),
    petHidden: document.querySelector('#pet').classList.contains('hidden'),
    /* 内容有没有被外框切掉 */
    frameBottom: Math.round(document.querySelector('.frame').getBoundingClientRect().bottom),
    tilesBottom: Math.round(document.querySelector('.tiles-scroll').getBoundingClientRect().bottom),
    tilesClip: (() => { const t = document.querySelector('.tiles-scroll');
      return { need: t.scrollHeight, have: t.clientHeight, scrollable: t.scrollHeight > t.clientHeight + 2 }; })(),
    lastTileBottom: Math.round(Array.from(document.querySelectorAll('.tile')).pop().getBoundingClientRect().bottom),
    lastTileText: (() => { const t = tiles[tiles.length - 1]; return t ? t.textContent.trim() : null; })(),
    overflowX: Array.from(document.querySelectorAll('.frame *')).filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && (r.right > window.innerWidth + 2 || r.left < -2);
    }).slice(0, 8).map(el => el.className + ' @' + Math.round(el.getBoundingClientRect().left) + '..' + Math.round(el.getBoundingClientRect().right))
  };
})()`);
await shot(OUT + '-main.png');

/* ---------------- 1a. 暗色模式 ---------------- */
await evalJS(`document.querySelector('#btnTheme').click()`);
await delay(700);
report.tests.push({
  name: '暗色模式',
  detail: await evalJS(`(() => {
    const g = (el, p) => el ? getComputedStyle(el)[p] : null;
    return {
      theme: document.documentElement.dataset.theme,
      colorScheme: g(document.documentElement, 'colorScheme'),
      bodyBg: g(document.body, 'backgroundColor'),
      frameBg: (g(document.querySelector('.frame'), 'backgroundImage') || '').slice(0, 58),
      cardBg: (document.querySelector('.card') ? g(document.querySelector('.card'), 'backgroundColor') : 'no-card'),
      tileName: g(document.querySelector('.tile-name'), 'color'),
      sunShown: g(document.querySelector('.theme-btn .ico-sun'), 'display'),
      presets: document.querySelectorAll('#bgPresets .preset').length,
      bgGrad: (document.querySelector('#bg').style.backgroundImage || '').slice(0, 40),
      meta: (document.querySelector('meta[name="theme-color"]') || {}).content
    };
  })()`)
});
await shot(OUT + '-dark.png');
await evalJS(`document.querySelector('#btnTheme').click()`);   // 切回浅色，后面测试照旧
await delay(500);

/* ---------------- 1b. 点击处的樱花炸开 ---------------- */
if (process.env.CLICK === '1') {
  const cx = Math.round(W * 0.52), cy = Math.round(H * 0.56);
  await S('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', clickCount: 1 });
  await S('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx, y: cy, button: 'left', clickCount: 1 });
  await delay(200);
  await shot(OUT + '-click.png');
  report.tests.push({ name: '点击樱花', detail: await evalJS(`(() => {
    const cv = document.querySelector('#fx');
    const cs = getComputedStyle(cv);
    return { canvasZ: cs.zIndex, pointerEvents: cs.pointerEvents, size: cv.width + 'x' + cv.height }; })()`) });
}

/* ---------------- 2. 抓不到 favicon 时的首字兜底 ---------------- */
await evalJS(`document.querySelector('#btnAddTile').click()`);
await delay(500);
await shot(OUT + '-dialog.png');
await evalJS(`(() => {
  document.querySelector('#dlgName').value = '喵喵测试站';
  document.querySelector('#dlgUrl').value = 'no-such-site-xr-12345.invalid';
  document.querySelector('#dlgIcon').value = '';
  document.querySelector('#dlgSave').click();
})()`);
await delay(6000);
report.tests.push({
  name: '首字兜底',
  detail: await evalJS(`(() => {
    const tiles = Array.from(document.querySelectorAll('.tile'));
    const t = tiles[tiles.length - 2];
    const c = t.querySelector('.tile-char');
    return { text: c.textContent, visible: c.style.display !== 'none', hasImg: !!t.querySelector('img.tile-ico'),
             bg: getComputedStyle(c).backgroundImage.slice(0, 46), border: getComputedStyle(t.querySelector('.tile-box')).borderTopColor };
  })()`)
});

/* ---------------- 2b. 本地地址（127.0.0.1:3080 = DSH）抓图标 ----------------
   故意用全角冒号，顺便测网址规范化 */
await evalJS(`document.querySelector('#btnAddTile').click()`);
await delay(500);
await evalJS(`(() => {
  document.querySelector('#dlgName').value = 'DSH';
  document.querySelector('#dlgUrl').value = '127.0.0.1：3080';
  document.querySelector('#dlgIcon').value = '';
  document.querySelector('#dlgSave').click();
})()`);
await delay(7000);
report.tests.push({
  name: '本地地址抓图标(127.0.0.1:3080)',
  detail: await evalJS(`(() => {
    const t = Array.from(document.querySelectorAll('.tile')).find(x => x.textContent.includes('DSH'));
    if (!t) return { found: false };
    const img = t.querySelector('img.tile-ico');
    const c = t.querySelector('.tile-char');
    return {
      found: true,
      href: t.getAttribute('href'),
      hasImg: !!img,
      src: img ? img.getAttribute('src') : null,
      natural: img ? img.naturalWidth + 'x' + img.naturalHeight : null,
      ready: img ? img.classList.contains('ready') : null,
      charHidden: c ? c.style.display === 'none' : null,
      cache: (() => { try { return JSON.parse(localStorage.getItem('xueran-home/icons/v2'))['127.0.0.1:3080'] || null; } catch (e) { return 'ERR'; } })()
    };
  })()`)
});
await shot(OUT + '-local.png');

/* ---------------- 2c. 图标在非标准目录里的站点（10.0.0.140） ---------------- */
for (const [label, input] of [['80端口(SPA /ui/)', '10.0.0.140'], ['9999端口', '10.0.0.140:9999']]) {
  await evalJS(`document.querySelector('#btnAddTile').click()`);
  await delay(400);
  await evalJS(`(() => {
    document.querySelector('#dlgName').value = ${JSON.stringify('LAN-' + label)};
    document.querySelector('#dlgUrl').value = ${JSON.stringify(input)};
    document.querySelector('#dlgIcon').value = '';
    document.querySelector('#dlgSave').click();
  })()`);
  await delay(9000);
  report.tests.push({
    name: '非标准目录图标: ' + label,
    detail: await evalJS(`(() => {
      const t = Array.from(document.querySelectorAll('.tile')).find(x => x.textContent.includes(${JSON.stringify('LAN-' + label)}));
      if (!t) return { found: false };
      const img = t.querySelector('img.tile-ico');
      const c = t.querySelector('.tile-char');
      return { href: t.getAttribute('href'), hasImg: !!img, src: img ? img.getAttribute('src') : null,
               natural: img ? img.naturalWidth + 'x' + img.naturalHeight : null,
               charText: c ? c.textContent : null, charShown: c ? c.style.display !== 'none' : null };
    })()`)
  });
}

/* ---------------- 2d. 缓存里存着"抓不到"时，「🔄 重抓」能不能救回来 ---------------- */
await evalJS(`(() => {
  try {
    const c = JSON.parse(localStorage.getItem('xueran-home/icons/v2') || '{}');
    c['10.0.0.140'] = { u: null, t: Date.now() };      // 假装上次抓失败了（7 天内不会重试）
    localStorage.setItem('xueran-home/icons/v2', JSON.stringify(c));
  } catch (e) {}
})()`);
{ const again = cdp.waitFor('Page.loadEventFired', 90000); await S('Page.reload'); await again; }
await delay(6000);
report.tests.push({
  name: '缓存中毒后（应该显示首字）',
  detail: await evalJS(`(() => {
    const t = Array.from(document.querySelectorAll('.tile')).find(x => x.textContent.includes('LAN-80'));
    const c = t && t.querySelector('.tile-char');
    const img = t && t.querySelector('img.tile-ico');
    return { charShown: c ? c.style.display !== 'none' : null, hasImg: !!img, title: t ? t.title.split('\\n').pop() : null };
  })()`)
});
await evalJS(`(() => {
  const t = Array.from(document.querySelectorAll('.tile')).find(x => x.textContent.includes('LAN-80'));
  t.querySelector('.tool[title="编辑"]').click();
})()`);
await delay(700);
await evalJS(`document.querySelector('#dlgRefetch').click()`);
await delay(9000);
report.tests.push({
  name: '点「🔄 重抓」后',
  detail: await evalJS(`(() => {
    const t = Array.from(document.querySelectorAll('.tile')).find(x => x.textContent.includes('LAN-80'));
    const c = t.querySelector('.tile-char');
    const img = t.querySelector('img.tile-ico');
    return { hasImg: !!img, src: img ? img.getAttribute('src') : null,
             natural: img ? img.naturalWidth + 'x' + img.naturalHeight : null,
             charShown: c.style.display !== 'none',
             cache: (() => { try { return JSON.parse(localStorage.getItem('xueran-home/icons/v2'))['10.0.0.140'] || null; } catch (e) { return 'ERR'; } })() };
  })()`)
});

/* ---------------- 3. 配置文件持久化（刷新后还在） ---------------- */
report.tests.push({
  name: 'localStorage 写入',
  detail: await evalJS(`(() => { const raw = localStorage.getItem('xueran-home/config/v1'); if (!raw) return 'NONE';
    const cfg = JSON.parse(raw); return { tiles: cfg.tiles.length, lastName: cfg.tiles[cfg.tiles.length-1].name, engine: cfg.search.engine }; })()`)
});

/* ---------------- 4. 搜索引擎切换 + 前缀解析 ---------------- */
report.tests.push({
  name: '引擎切换',
  detail: await evalJS(`(() => {
    const before = document.querySelector('.eng.on').textContent;
    document.querySelector('#engineBtn').click();
    const after = document.querySelector('.eng.on').textContent;
    return { before, after, dot: document.querySelector('#engineDot').textContent };
  })()`)
});

/* ---------------- 5. 设置抽屉 + 整理模式 ---------------- */
/* 无头环境下 CSS 过渡不一定在走，检查"最终状态"就先关掉过渡，免得测出假阴性 */
await evalJS(`(() => { const s = document.createElement('style');
  s.id = 'probe-noanim';
  s.textContent = '*{transition:none!important;animation:none!important}';
  document.head.appendChild(s); })()`);
await evalJS(`document.querySelector('#btnSettings').click()`);
await delay(700);
report.tests.push({
  name: '设置抽屉',
  detail: await evalJS(`(() => { const d = document.querySelector('#drawer');
    return { open: d.classList.contains('show'), x: Math.round(d.getBoundingClientRect().x), transform: getComputedStyle(d).transform,
             cards: d.querySelectorAll('.card').length, presets: d.querySelectorAll('.preset').length,
             engines: d.querySelectorAll('#setEngine option').length }; })()`)
});
await shot(OUT + '-drawer.png');
await evalJS(`document.querySelector('#btnCloseDrawer').click()`);
await delay(500);
await evalJS(`document.querySelector('#btnEditMode').click()`);
await delay(400);
report.tests.push({
  name: '整理模式',
  detail: await evalJS(`(() => ({ editing: document.body.classList.contains('editing'),
    toolsVisible: getComputedStyle(document.querySelector('.tile-tools')).opacity }))()`)
});
await shot(OUT + '-edit.png');

/* ---------------- 6. 拖动排序 ---------------- */
report.tests.push({
  name: '拖动排序',
  detail: await evalJS(`(() => {
    const tiles = Array.from(document.querySelectorAll('.tile')).slice(0, 3);
    const before = tiles.map(t => t.querySelector('.tile-name').textContent);
    const dt = new DataTransfer();
    const fire = (el, type, cancelable) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: !!cancelable, dataTransfer: dt }));
    fire(tiles[0], 'dragstart');
    fire(tiles[2], 'dragover', true);
    fire(tiles[2], 'drop', true);
    fire(tiles[0], 'dragend');
    const after = Array.from(document.querySelectorAll('.tile')).slice(0, 3).map(t => t.querySelector('.tile-name').textContent);
    const saved = JSON.parse(localStorage.getItem('xueran-home/config/v1')).tiles.slice(0, 3).map(t => t.name);
    const sameSet = before.slice().sort().join() === after.slice().sort().join();
    return { before, after, saved, pass: sameSet && after[0] !== before[0] && saved.join() === after.join() };
  })()`)
});

/* ---------------- 7. 清理测试磁贴 ---------------- */
await evalJS(`(() => { const t = Array.from(document.querySelectorAll('.tile'));
  t.filter(x => x.textContent.includes('喵喵测试站')).forEach(x => x.querySelector('.tool[title="删除"]').click()); })()`);
await delay(400);
report.tests.push({ name: '删除测试磁贴', detail: await evalJS(`document.querySelectorAll('.tile').length - 1 + ' 个网址（不含＋）'`) });

/* ---------------- 8. 搜索：URL 直达 / 引擎前缀（拦下导航请求看目标） ---------------- */
async function searchTarget(input) {
  return await new Promise(async resolve => {
    await S('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
    let settled = false;
    const h = m => {
      if (m.method !== 'Fetch.requestPaused' || settled) return;
      settled = true;
      cdp.handlers = cdp.handlers.filter(x => x !== h);
      const { requestId, request } = m.params;
      S('Fetch.failRequest', { requestId, errorReason: 'Aborted' }).catch(() => {});
      resolve(request.url);
    };
    cdp.on(h);
    await evalJS(`(() => { document.querySelectorAll('.eng')[0].click();
      const q = document.querySelector('#q'); q.value = ${JSON.stringify(input)};
      document.querySelector('#searchForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); })()`);
    setTimeout(() => { if (!settled) { settled = true; resolve('TIMEOUT'); } }, 6000);
  }).finally(() => S('Fetch.disable').catch(() => {}));
}

for (const [input, expect] of [
  ['bilibili.com', 'https://bilibili.com/'],
  ['https://github.com/explore', 'https://github.com/explore'],
  ['bd 猫娘', 'https://www.baidu.com/s?wd='],
  ['g anime', 'https://www.google.com/search?q=anime'],
  ['猫娘', 'https://www.bing.com/search?q=']
]) {
  const got = await searchTarget(input);
  report.tests.push({ name: '搜索: ' + input, detail: { got, expect, pass: String(got).startsWith(expect) } });
  await delay(300);
}

/* ---------------- 9. 磁贴删光以后，刷新不能自己冒出默认 8 个 ---------------- */
report.tests.push({
  name: '删光磁贴',
  detail: await evalJS(`(() => {
    let guard = 0;
    while (guard++ < 40) {
      const t = Array.from(document.querySelectorAll('.tile')).find(x => !x.classList.contains('tile-add'));
      if (!t) break;
      t.querySelector('.tool[title="删除"]').click();
    }
    return { 删完剩几个: Array.from(document.querySelectorAll('.tile')).filter(x => !x.classList.contains('tile-add')).length,
             存进配置的是: (() => { try { return JSON.parse(localStorage.getItem('xueran-home/config/v1')).tiles.length; } catch (e) { return 'ERR'; } })() };
  })()`)
});
{ const again = cdp.waitFor('Page.loadEventFired', 90000); await S('Page.reload'); await again; }
await delay(4000);
report.tests.push({
  name: '删光后刷新（应该还是空）',
  detail: await evalJS(`(() => ({
    界面上剩几个: Array.from(document.querySelectorAll('.tile')).filter(x => !x.classList.contains('tile-add')).length,
    配置里剩几个: (() => { try { return JSON.parse(localStorage.getItem('xueran-home/config/v1')).tiles.length; } catch (e) { return 'ERR'; } })(),
    有添加按钮: !!document.querySelector('.tile-add')
  }))()`)
});

console.log(JSON.stringify(report, null, 2));
await cdp.send('Target.closeTarget', { targetId });
process.exit(0);
