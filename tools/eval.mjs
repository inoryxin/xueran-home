/* 通用小工具：在无头 Edge 里打开一个网址，跑一段 JS，把结果打出来
   用法: node tools/eval.mjs "<url>" "<js 表达式>" [宽] [高]
   需要先起带 --remote-debugging-port=9222 的 Edge */
import { setTimeout as delay } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';

const PORT = Number(process.env.CDP_PORT || 9222);
/* 参数优先从环境变量拿（表达式里空格多，走命令行容易被拆开） */
const URL_ = process.env.EVAL_URL || process.argv[2];
const EXPR = process.env.EVAL_EXPR || process.argv[3];
const W = Number(process.env.EVAL_W || process.argv[4] || 1600);
const H = Number(process.env.EVAL_H || process.argv[5] || 900);
if (!URL_ || !EXPR) { console.error('需要 URL 和表达式（EVAL_URL / EVAL_EXPR）'); process.exit(2); }

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.waits = new Map(); this.handlers = [];
    ws.addEventListener('message', ev => {
      const m = JSON.parse(ev.data);
      if (m.id && this.waits.has(m.id)) {
        const { res, rej } = this.waits.get(m.id); this.waits.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
      } else if (m.method) this.handlers.slice().forEach(h => h(m));
    });
  }
  send(method, params, sessionId) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.waits.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params: params || {}, sessionId }));
    });
  }
  waitFor(method, timeout = 20000) {
    return new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('timeout ' + method)), timeout);
      const h = m => { if (m.method === method) { clearTimeout(t); this.handlers = this.handlers.filter(x => x !== h); res(m.params); } };
      this.handlers.push(h);
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
await S('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await S('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
/* 想在页面脚本之前注入点东西（比如错误捕获）就设 EVAL_PRE */
if (process.env.EVAL_PRE) await S('Page.addScriptToEvaluateOnNewDocument', { source: process.env.EVAL_PRE }).catch(() => {});
const loaded = cdp.waitFor('Page.loadEventFired', 90000);   // 页面要等图标都加载完，给足时间
await S('Page.navigate', { url: URL_ });
await loaded;
await delay(Number(process.env.WAIT_MS || 3000));

const r = await S('Runtime.evaluate', { expression: EXPR, returnByValue: true, awaitPromise: true });
if (r.exceptionDetails) console.error('EXCEPTION:', r.exceptionDetails.exception?.description || r.exceptionDetails.text);
else console.log(typeof r.result.value === 'string' ? r.result.value : JSON.stringify(r.result.value, null, 2));

/* 需要的话顺手截个图：EVAL_SHOT=<路径> */
if (process.env.EVAL_SHOT) {
  await delay(700);
  const { data } = await S('Page.captureScreenshot', { format: 'png' });
  writeFileSync(process.env.EVAL_SHOT, Buffer.from(data, 'base64'));
  console.error('截图已存: ' + process.env.EVAL_SHOT);
}
await cdp.send('Target.closeTarget', { targetId });
process.exit(0);
