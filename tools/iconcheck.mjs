/* 诊断：某个域名的 5 个 favicon 服务各自返回什么（尺寸 + 是不是空白）
   用法: node tools/iconcheck.mjs www.bilibili.com [输出前缀]
   需要先起带 --remote-debugging-port=9222 的 Edge */
import { setTimeout as delay } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';

const PORT = Number(process.env.CDP_PORT || 9222);
const DOMAIN = process.argv[2] || 'www.bilibili.com';
const OUT = process.argv[3] || 'iconcheck';

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.waits = new Map();
    ws.addEventListener('message', ev => {
      const m = JSON.parse(ev.data);
      if (m.id && this.waits.has(m.id)) {
        const { res, rej } = this.waits.get(m.id); this.waits.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
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
}
const connect = url => new Promise((res, rej) => {
  const ws = new WebSocket(url);
  ws.addEventListener('open', () => res(ws), { once: true });
  ws.addEventListener('error', () => rej(new Error('ws fail')), { once: true });
});

const ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
const cdp = new CDP(await connect(ver.webSocketDebuggerUrl));
const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p) => cdp.send(m, p, sessionId);
await S('Page.enable'); await S('Runtime.enable');
await S('Emulation.setDeviceMetricsOverride', { width: 980, height: 620, deviceScaleFactor: 1, mobile: false });
await S('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

const expr = `(async () => {
  const D = ${JSON.stringify(DOMAIN)};
  const svc = [
    ['iowen',   'https://api.iowen.cn/favicon/' + D + '.png'],
    ['faviconim','https://favicon.im/' + D + '?larger=true'],
    ['ddg',     'https://icons.duckduckgo.com/ip3/' + D + '.ico'],
    ['google',  'https://www.google.com/s2/favicons?domain=' + D + '&sz=128'],
    ['origin',  'https://' + D + '/favicon.ico']
  ];
  const out = [];
  for (const [name, url] of svc) {
    const r = await new Promise(res => {
      const img = new Image();
      const t = setTimeout(() => res({ name, url, status: 'timeout' }), 9000);
      img.onload = () => { clearTimeout(t); res({ name, url, status: 'ok', w: img.naturalWidth, h: img.naturalHeight }); };
      img.onerror = () => { clearTimeout(t); res({ name, url, status: 'error' }); };
      img.referrerPolicy = 'no-referrer';
      img.src = url;
    });
    out.push(r);
  }
  /* 摆出来看：深色格子上，白图=白块，透明=格子透出来 */
  document.body.style.cssText = 'margin:0;background:#2a2233;font:12px/1.4 sans-serif;color:#fff';
  document.body.innerHTML = '<div style="display:flex;gap:14px;padding:18px;flex-wrap:wrap"></div>';
  const box = document.body.firstChild;
  out.forEach(r => {
    const cell = document.createElement('div');
    cell.style.cssText = 'width:150px;text-align:center';
    const stage = document.createElement('div');
    stage.style.cssText = 'width:132px;height:132px;margin:0 auto 6px;border-radius:16px;' +
      'background:repeating-conic-gradient(#3aa06a 0 25%, #2b7d52 0 50%) 50%/16px 16px;' +
      'display:grid;place-items:center;overflow:hidden';
    if (r.status === 'ok') {
      const im = document.createElement('img');
      im.src = r.url; im.style.cssText = 'max-width:100%;max-height:100%';
      stage.appendChild(im);
    } else {
      stage.textContent = r.status;
    }
    cell.appendChild(stage);
    const lab = document.createElement('div');
    lab.textContent = r.name + ' · ' + (r.status === 'ok' ? r.w + 'x' + r.h : r.status);
    cell.appendChild(lab);
    box.appendChild(cell);
  });
  return out;
})()`;

const r = await S('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
console.log(JSON.stringify(r.result.value, null, 2));
await delay(1200);
const { data } = await S('Page.captureScreenshot', { format: 'png' });
writeFileSync(OUT + '.png', Buffer.from(data, 'base64'));
await cdp.send('Target.closeTarget', { targetId });
process.exit(0);
