/* ==========================================================================
   许雪然 · 二次元主页  app.js
   · 快捷方式自动抓网站 logo（多服务兜底），抓不到就用名称第一个字
   · 搜索 / 引擎前缀 / 时钟问候 / 樱花星屑 / Q 版看板娘 / 配置持久化
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ 工具 */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));
  const pad2 = n => (n < 10 ? '0' + n : '' + n);
  const clone = o => JSON.parse(JSON.stringify(o));

  const CFG_KEY = 'xueran-home/config/v1';
  const ICON_KEY = 'xueran-home/icons/v4';   // v4：开始把图标图片本体（data URL）也存下来，旧的只存地址的缓存作废
  const ICON_TTL = 7 * 24 * 3600 * 1000;   // 抓到的图标缓存 7 天
  const FAIL_TTL = 24 * 3600 * 1000;       // 抓失败也记一下，24h 内不再重试

  function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }

  /* -------------------------------------------------------------- 搜索引擎 */
  /* 只要这四个，顺序就是界面上从左到右的顺序 */
  const ENGINES = [
    { id: 'bing',   name: 'Bing',   dot: 'B',  url: 'https://www.bing.com/search?q=%s',    prefix: ['b', 'bing'] },
    { id: 'google', name: '谷歌',   dot: 'G',  url: 'https://www.google.com/search?q=%s',   prefix: ['g', 'google'] },
    { id: 'baidu',  name: '百度',   dot: '百', url: 'https://www.baidu.com/s?wd=%s',        prefix: ['bd', 'baidu'] },
    { id: 'yandex', name: 'Yandex', dot: 'Y',  url: 'https://yandex.com/search/?text=%s',   prefix: ['y', 'ya', 'yandex'] }
  ];

  /* -------------------------------------------------------------- 默认数据 */
  const DEFAULT_TILES = [
    { name: '哔哩哔哩',    url: 'https://www.bilibili.com' },
    { name: '百度',        url: 'https://www.baidu.com' },
    { name: '知乎',        url: 'https://www.zhihu.com' },
    { name: '微博',        url: 'https://weibo.com' },
    { name: '淘宝',        url: 'https://www.taobao.com' },
    { name: 'GitHub',      url: 'https://github.com' },
    { name: '网易云音乐',  url: 'https://music.163.com' },
    { name: 'Pixiv',       url: 'https://www.pixiv.net' }
  ];

  const DEFAULTS = {
    theme: 'light',            // light / dark / auto（跟随系统）
    /* 背景只用纯色渐变，不放图片 */
    bg:    { grad: 'linear-gradient(150deg,#ffd3e5,#fff1f7 45%,#eaf2ff)', bright: 100, dim: 10 },
    logo:  { img: 'assets/logo.png', sub: '✿ 欢迎回来，雪然 ✿', size: 100 },
    search:{ engine: 'bing', newTab: false, edit: false },   // newTab 默认 false：快捷方式在当前标签页打开
    fx:    { petals: true, stars: true, trail: true, pet: true },
    tiles: DEFAULT_TILES
  };

  /* 每个主题一套配色：浅色「樱花系」，暗色「夜樱系」 */
  const BG_PRESETS = {
    light: [
      { name: '樱花', grad: 'linear-gradient(150deg,#ffd3e5,#fff1f7 45%,#eaf2ff)', bright: 100 },
      { name: '粉雪', grad: 'linear-gradient(150deg,#ffe2ef,#fdf7fb 52%,#ffe9f3)', bright: 100 },
      { name: '薄荷', grad: 'linear-gradient(150deg,#d9f5ed,#f7fdfb 45%,#ffe6f1)', bright: 100 },
      { name: '晚霞', grad: 'linear-gradient(150deg,#ffd8c9,#fff1f6 45%,#e7dcff)', bright: 100 },
      { name: '星夜', grad: 'linear-gradient(150deg,#2b2140,#523a6b 45%,#a4699a)', bright: 116 }
    ],
    dark: [
      { name: '夜樱', grad: 'linear-gradient(150deg,#2a1a26,#3a2233 45%,#241a33)', bright: 108 },
      { name: '暗粉', grad: 'linear-gradient(150deg,#331d2a,#4a2637 48%,#2a1830)', bright: 106 },
      { name: '墨蓝', grad: 'linear-gradient(150deg,#151d2e,#22304a 48%,#2a1c38)', bright: 112 },
      { name: '深紫', grad: 'linear-gradient(150deg,#20172e,#33234a 48%,#1d1630)', bright: 110 },
      { name: '暖夜', grad: 'linear-gradient(150deg,#2e1c20,#452a2c 50%,#1f1a2e)', bright: 108 }
    ]
  };
  const DEFAULT_GRAD = BG_PRESETS.light[0].grad;

  const CHIBI = ['q1', 'q2', 'q3', 'q5', 'q6', 'q7', 'q8', 'q10', 'yaoshikou']
    .map(n => 'assets/chibi/chibi-' + n + '.png');

  const CHAR_COLORS = [
    ['#ff9dc4', '#e4508a'], ['#b9a7f0', '#8f7ce0'], ['#8fd9c4', '#4fbfa0'],
    ['#ffbe8a', '#f0913f'], ['#8fc5ff', '#5f9de8'], ['#ffa8b8', '#ec6a86'],
    ['#f0c56a', '#dfa13a']
  ];

  const LINES = {
    dawn:  ['天还没亮呢…要早点睡哦', '这么晚还不睡呀？', '呜…好困的说'],
    morn:  ['早安～ 今天也要元气满满鸭！', '早八人冲鸭！', '记得吃早餐哦 ✿'],
    noon:  ['中午啦，去干饭！', '要不要一起吃饭饭？', '吃太饱会困的哦～'],
    after: ['下午茶时间到～', '喝口水嘛，雪然盯着你哦', '加油加油，快完成啦！'],
    dusk:  ['傍晚好呀，今天辛苦了～', '要不要一起看番？', '晚霞好好看呢…'],
    night: ['晚上好～ 今天过得怎么样？', '夜风好舒服呀 ✿', '想听雪然唱首歌吗？'],
    late:  ['夜深了，早点睡吧～', '熬夜会变丑的哦（认真）', '晚安，做个好梦 ✿']
  };
  const PET_LINES = ['喵～', '点我做什么呀？', '要好好休息哦！', '今天想我了没？', '呜哇，被发现了！', '陪你一起上网呀～', '嘿嘿，摸摸头 ✿'];

  /* ------------------------------------------------------------------ 状态 */
  /* 配置版本：用来做"一次性默认值迁移"。
     2 = 快捷方式的「新标签页打开」默认改成 false（当前标签页）——
     老配置里存的是旧默认值 true，这里帮你改一次，之后你手动怎么设都听你的。
     注意：这两个声明必须在 loadConfig() 被调用之前（否则暂时性死区报错）。 */
  const CFG_VERSION = 2;
  let cfgMigrated = false;

  let state = loadConfig();
  let iconCache = loadIconCache();

  function normalizeTile(t) {
    if (!t || typeof t !== 'object') return null;
    const url = normalizeUrl(t.url);
    if (!url) return null;
    const name = String(t.name || '').trim() || domainOf(url);
    return { id: t.id || uid(), name: name, url: url, icon: String(t.icon || '').trim() };
  }


  function loadConfig() {
    const raw = readRawConfig();
    if (!raw) { const cfg = clone(DEFAULTS); cfg.tiles = DEFAULT_TILES.map(normalizeTile); cfg.cfgv = CFG_VERSION; return cfg; }
    const cfg = adoptConfig(raw);
    if (!raw.cfgv || raw.cfgv < CFG_VERSION) {
      cfg.search.newTab = false;
      cfg.cfgv = CFG_VERSION;
      cfgMigrated = true;
    }
    return cfg;
  }

  function readRawConfig() {
    try { return JSON.parse(safeGet(CFG_KEY) || 'null'); } catch (e) { return null; }
  }

  /* 把一份"原始配置对象"套成完整配置（读取本地配置、导入 JSON、搬家都用它） */
  function adoptConfig(raw) {
    const cfg = clone(DEFAULTS);
    if (raw && typeof raw === 'object') {
      if (raw.theme) cfg.theme = raw.theme;
      ['bg', 'logo', 'search', 'fx'].forEach(k => {
        if (raw[k] && typeof raw[k] === 'object') Object.assign(cfg[k], raw[k]);
      });
      /* 注意：这里不能用 raw.tiles.length 判断 ——
         用户把磁贴删光时存的是空数组，那也是他明确要的结果，不能再铺回默认 8 个 */
      if (Array.isArray(raw.tiles)) {
        cfg.tiles = raw.tiles.map(normalizeTile).filter(Boolean);
      }
    }
    return cfg;
  }

  function saveConfig() { safeSet(CFG_KEY, JSON.stringify(state)); }

  function loadIconCache() { try { return JSON.parse(safeGet(ICON_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function saveIconCache() { safeSet(ICON_KEY, JSON.stringify(iconCache)); }

  function uid() { return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /* ------------------------------------------------------------ 网址小工具 */
  /* 顺手把全角字符转半角：很多人输网址会带全角冒号（127.0.0.1：3080）、全角斜杠 */
  function toHalfWidth(s) {
    return String(s || '')
      .replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
      .replace(/[\u3000\u00A0\u200B-\u200D\uFEFF]/g, ' ')
      .trim();
  }

  function normalizeUrl(u) {
    u = toHalfWidth(u);
    if (!u) return '';
    if (/^(javascript|data|vbscript):/i.test(u)) return '';
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) {
      if (/^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/|$)/i.test(u)) u = 'http://' + u;
      else u = 'https://' + u;
    }
    try { return new URL(u).href; } catch (e) { return ''; }
  }

  /* 主机（带端口）—— 本地站点靠端口区分（127.0.0.1:3080 和 :8888 是两个站） */
  function hostOf(url) {
    try { return new URL(url).host.toLowerCase(); } catch (e) { return ''; }
  }

  /* 域名（给第三方图标服务用：去端口、去 www） */
  function domainOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
  }

  /* 本机 / 内网地址：第三方图标服务根本够不着，只能直接问站点自己 */
  function isLocalHost(host) {
    const h = String(host || '').replace(/:\d+$/, '').toLowerCase();
    if (!h) return true;
    if (h === 'localhost' || h === '::1' || h === '[::1]') return true;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
      if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return true;
      return /^172\.(1[6-9]|2\d|3[01])\./.test(h);       // 172.16~172.31
    }
    if (!h.includes('.')) return true;                    // 局域网机器名（没点的那种）
    return /\.(local|localhost|lan|internal|home|test)$/.test(h);
  }

  function firstChar(name) {
    const s = String(name || '').trim();
    if (!s) return '✿';
    const m = s.match(/[\u4e00-\u9fa5a-zA-Z0-9]/);
    return m ? m[0] : s.charAt(0);
  }

  function isUrlLike(text) {
    if (/^https?:\/\/\S+$/i.test(text)) return true;
    if (/^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/\S*)?$/i.test(text)) return true;
    return /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(text);
  }

  function hashOf(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  /* ------------------------------------------- 网站 logo 自动抓取（多服务） */
  /* 第三方 favicon 服务：只用国内网络通的。
     Google / DuckDuckGo 国内不通 —— 会把页面卡在"正在连接 google.com"，
     所以直接不用。站点自己的 favicon 是跟这几个**同时**去抢的，
     所以国内站点基本立刻出图标。 */
  const SERVICES = [
    { id: 'iowen',   make: d => 'https://api.iowen.cn/favicon/' + d + '.png', fake: () => false },
    { id: 'favicon', make: d => 'https://favicon.im/' + d + '?larger=true',  fake: (w, h) => w === 150 && h === 150 }
  ];

  function probe(cand, timeout) {
    return new Promise(resolve => {
      const img = new Image();
      let done = false;
      const finish = ok => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        img.onload = img.onerror = null;
        resolve(ok);
      };
      const timer = setTimeout(() => finish(false), timeout || 5200);
      img.onload = function () {
        const w = img.naturalWidth, h = img.naturalHeight;
        /* 有些站点的 favicon.svg 没有写死宽高，naturalWidth 会是 0 —— SVG 就别用尺寸卡它了 */
        const isSvg = /\.svg(\?|$)/i.test(cand.url);
        const tooSmall = !isSvg && (!w || !h || w <= 4 || h <= 4);
        const bad = tooSmall || cand.s.fake(w, h);
        finish(!bad);
      };
      img.onerror = function () { finish(false); };
      img.referrerPolicy = 'no-referrer';
      img.src = cand.url;
    });
  }

  /* 并发跑一批候选，谁先成功用谁（限流 + 总超时，避免打太多请求 / 卡住） */
  function firstSuccess(cands, limit, deadline) {
    return new Promise(resolve => {
      if (!cands.length) return resolve(null);
      let i = 0, live = 0, settled = false;
      const timer = setTimeout(() => finish(null), deadline);
      function finish(url) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(url);
      }
      function pump() {
        if (settled) return;
        if (i >= cands.length) { if (live === 0) finish(null); return; }
        const c = cands[i++];
        live++;
        probe(c, 3600).then(ok => {
          live--;
          if (ok) finish(c.url); else pump();
        });
      }
      for (let k = 0; k < Math.min(limit, cands.length); k++) pump();
    });
  }

  /* --------- 站点自己放图标的地方 ---------
     优先级 1：根目录最常见的位置
     优先级 2：各种前端模板的图标目录（Vue/Vite 的 assets/favicons、static/img/icons …）
     优先级 3：挂在子路径下的应用（比如 <base href="/ui/"> 的 SPA，图标在 /ui/assets/favicons/） */
  const SITE_ICON_PATHS = [
    '/favicon.ico', '/favicon.svg', '/favicon.png',
    '/apple-touch-icon.png', '/apple-touch-icon-precomposed.png',
    '/favicon-32x32.png', '/favicon-16x16.png', '/icon.svg', '/logo.png'
  ];
  const SITE_ICON_EXTRA = [
    'assets/favicons/favicon.ico', 'assets/favicons/favicon.svg',
    'assets/favicons/favicon-32x32.png', 'assets/favicons/favicon-16x16.png',
    'assets/favicons/apple-touch-icon.png',
    'static/img/icons/favicon.ico', 'static/img/icons/favicon-32x32.png',
    'static/img/icons/apple-touch-icon.png',
    'img/icons/favicon-32x32.png', 'icons/favicon.ico',
    'static/favicon.ico', 'assets/favicon.ico', 'assets/favicon.svg'
  ];
  const SITE_ICON_PREFIXES = ['ui/', 'web/', 'app/', 'static/', 'home/'];

  function siteIconCandidates(pageUrl) {
    let origin = '';
    try { origin = new URL(pageUrl).origin; } catch (e) { return []; }
    if (!origin || origin === 'null') return [];
    const plain = { id: 'site', fake: () => false };
    const seen = Object.create(null);
    const out = [];
    const push = (p, prio) => {
      const url = origin + p;
      if (seen[url]) return;
      seen[url] = 1;
      out.push({ s: plain, url: url, prio: prio });
    };
    SITE_ICON_PATHS.forEach(p => push(p, 1));
    SITE_ICON_EXTRA.forEach(p => push('/' + p, 2));
    SITE_ICON_PREFIXES.forEach(pre => SITE_ICON_EXTRA.forEach(p => push('/' + pre + p, 3)));
    return out;
  }

  /* 找图标：公网站点先问第三方服务（跟站点自己的根图标一起抢），不行再往图标目录 / 子路径里挖 */
  function findIcon(pageUrl) {
    const host = hostOf(pageUrl);
    const domain = domainOf(pageUrl);
    const site = siteIconCandidates(pageUrl);
    const quick = [];
    if (domain && !isLocalHost(host)) {
      SERVICES.forEach(s => quick.push({ s: s, url: s.make(domain) }));
    }
    site.filter(c => c.prio === 1).forEach(c => quick.push(c));
    return firstSuccess(quick, 4, 12000).then(hit => {
      if (hit) return hit;
      return firstSuccess(site.filter(c => c.prio > 1), 8, 10000);
    });
  }

  /* 国内连不上的图标服务：缓存里如果留着这些地址，直接用不了（页面会卡在"正在连接 google.com"） */
  const BLOCKED_ICON = /(^|\.)(google\.com|googleapis\.com|gstatic\.com|duckduckgo\.com)$/i;
  /* 页面本身跑在本地服务上时（127.0.0.1），图标一律走同源代理 /icon：
     ① 跨域取图的 CORS 问题没了；② 服务端会把图缓存到磁盘，外面只取一次 */
  const LOCAL_HTTP = /^https?:$/.test(location.protocol) && /^(127\.0\.0\.1|localhost)$/.test(location.hostname);

  function iconSrc(rawUrl) {
    return LOCAL_HTTP ? (location.origin + '/icon?u=' + encodeURIComponent(rawUrl)) : rawUrl;
  }

  /* 把图标图片转成 data URL 存进 localStorage：以后开页面秒出，完全不联网 */
  function cacheIconImage(host, rawUrl) {
    if (!LOCAL_HTTP) return;                     // file:// 下没有服务可用，只能按地址缓存
    fetch(iconSrc(rawUrl)).then(r => (r.ok ? r.blob() : null)).then(blob => {
      if (!blob || !/^image\//.test(blob.type) || blob.size > 400 * 1024) return;
      const fr = new FileReader();
      fr.onload = () => {
        const e = iconCache[host];
        if (!e || e.u !== rawUrl) return;         // 期间图标换了就别写
        e.d = fr.result;
        saveIconCache();
      };
      fr.readAsDataURL(blob);
    }).catch(() => {});
  }

  function cachedIcon(host) {
    const e = iconCache[host];
    if (!e) return undefined;
    const ttl = e.u ? ICON_TTL : FAIL_TTL;
    if (Date.now() - e.t > ttl) return undefined;
    if (e.u && BLOCKED_ICON.test(hostOf(e.u))) {   // 旧缓存指向被墙的服务 → 丢掉，重新抓
      delete iconCache[host];
      saveIconCache();
      return undefined;
    }
    if (e.d) return e.d;                           // 存了图片本体 → 直接给（秒出、不联网）
    return e.u ? iconSrc(e.u) : null;
  }

  function putIcon(host, url) {
    if (!host) return;
    iconCache[host] = { u: url, t: Date.now() };
    saveIconCache();
    if (url) cacheIconImage(host, url);     // 顺手把图片本体也存下来
  }

  /* ------------------------------------------------------------------ 渲染 */
  const tilesEl = $('#tiles');

  function buildTile(tile) {
    const a = document.createElement('a');
    a.className = 'tile';
    a.dataset.id = tile.id;
    a.href = tile.url;
    a.title = tile.name + '\n' + tile.url;
    a.draggable = true;
    if (state.search.newTab) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }

    const box = document.createElement('span');
    box.className = 'tile-box';

    const char = document.createElement('span');
    char.className = 'tile-char';
    char.textContent = firstChar(tile.name);
    const colors = CHAR_COLORS[hashOf(tile.name) % CHAR_COLORS.length];
    char.style.background = 'linear-gradient(150deg,' + colors[0] + ',' + colors[1] + ')';
    box.appendChild(char);

    const tools = document.createElement('span');
    tools.className = 'tile-tools';
    const edit = document.createElement('button');
    edit.className = 'tool';
    edit.type = 'button';
    edit.title = '编辑';
    edit.textContent = '✎';
    edit.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); openDialog(tile); });
    const del = document.createElement('button');
    del.className = 'tool';
    del.type = 'button';
    del.title = '删除';
    del.textContent = '✕';
    del.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); removeTile(tile.id); });
    tools.appendChild(edit);
    tools.appendChild(del);
    box.appendChild(tools);

    const name = document.createElement('span');
    name.className = 'tile-name';
    name.textContent = tile.name;

    a.appendChild(box);
    a.appendChild(name);
    a.addEventListener('click', ev => { if (document.body.classList.contains('editing')) ev.preventDefault(); });

    attachIcon(tile, box, char);
    attachDrag(a, tile);
    return a;
  }

  function attachIcon(tile, box, char) {
    const show = url => {
      if (!url) return;
      const isSvg = /\.svg(\?|$)/i.test(url);
      const img = document.createElement('img');
      img.className = 'tile-ico';
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.onload = function () {
        if (!isSvg && (img.naturalWidth <= 4 || img.naturalHeight <= 4)) { img.remove(); return; }
        img.classList.add('ready');
        char.style.display = 'none';
      };
      img.onerror = function () { img.remove(); };
      img.src = url;
      box.insertBefore(img, box.firstChild);
    };

    const custom = String(tile.icon || '').trim();
    if (custom) {
      if (/^(https?:|\/|\.\/|data:|assets\/)/i.test(custom)) show(custom);
      else { char.textContent = custom; }   // 自定义 emoji / 文字
      return;
    }

    /* 缓存按「主机+端口」存：127.0.0.1:3080 和 127.0.0.1:8888 是两回事 */
    const host = hostOf(tile.url);
    if (!host) return;
    const cached = cachedIcon(host);
    if (cached !== undefined) {
      if (cached) {
        /* 本地已存着图片本体 → 一开始就别显示大字，省掉那一下闪烁 */
        const entry = iconCache[host];
        if (entry && entry.d) char.style.display = 'none';
        show(cached);
      }
      return;
    }
    findIcon(tile.url).then(url => {
      putIcon(host, url);
      if (url) { show(iconSrc(url)); return; }
      /* 实在找不到：在悬浮提示里告诉用户可以手填 */
      const a = box.parentNode;
      if (a && a.classList && a.classList.contains('tile')) {
        a.title = tile.name + '\n' + tile.url + '\n（没找到图标，点右上角 ✎ 可以手填一个）';
      }
    });
  }

  function buildAddTile() {
    const a = document.createElement('a');
    a.className = 'tile tile-add';
    a.href = 'javascript:void 0';
    a.title = '添加一个网址';
    const box = document.createElement('span');
    box.className = 'tile-box';
    const plus = document.createElement('span');
    plus.className = 'plus';
    plus.textContent = '＋';
    box.appendChild(plus);
    const name = document.createElement('span');
    name.className = 'tile-name';
    name.textContent = '添加网址';
    a.appendChild(box);
    a.appendChild(name);
    a.addEventListener('click', ev => { ev.preventDefault(); openDialog(null); });
    return a;
  }

  function renderTiles() {
    tilesEl.innerHTML = '';
    state.tiles.forEach(t => tilesEl.appendChild(buildTile(t)));
    tilesEl.appendChild(buildAddTile());
    $('#tilesTip').textContent = state.tiles.length + ' 个快捷方式 · 悬停右上角 ✎ 编辑 · 拖动可排序';
  }

  /* -------------------------------------------------------------- 拖动排序 */
  let dragId = null;
  function attachDrag(el, tile) {
    el.addEventListener('dragstart', ev => {
      dragId = tile.id;
      el.classList.add('dragging');
      try { ev.dataTransfer.setData('text/plain', tile.url); ev.dataTransfer.effectAllowed = 'move'; } catch (e) {}
    });
    el.addEventListener('dragend', () => {
      dragId = null;
      el.classList.remove('dragging');
      $$('.tile.drop-target').forEach(n => n.classList.remove('drop-target'));
    });
    el.addEventListener('dragover', ev => { if (dragId && dragId !== tile.id) { ev.preventDefault(); el.classList.add('drop-target'); } });
    el.addEventListener('dragleave', () => el.classList.remove('drop-target'));
    el.addEventListener('drop', ev => {
      ev.preventDefault();
      el.classList.remove('drop-target');
      if (!dragId || dragId === tile.id) return;
      const from = state.tiles.findIndex(t => t.id === dragId);
      const to = state.tiles.findIndex(t => t.id === tile.id);
      if (from < 0 || to < 0) return;
      const moved = state.tiles.splice(from, 1)[0];
      state.tiles.splice(to, 0, moved);
      saveConfig();
      renderTiles();
      toast('排好啦～ ✿');
    });
  }

  /* -------------------------------------------------------------- 增 / 删 / 改 */
  function removeTile(id) {
    const i = state.tiles.findIndex(t => t.id === id);
    if (i < 0) return;
    const gone = state.tiles.splice(i, 1)[0];
    saveConfig();
    renderTiles();
    toast('已经删掉「' + gone.name + '」了');
  }

  /* ------------------------------------------------------------------ 搜索 */
  function currentEngine() {
    return ENGINES.filter(e => e.id === state.search.engine)[0] || ENGINES[0];
  }

  function renderEngines() {
    const wrap = $('#engines');
    wrap.innerHTML = '';
    const cur = currentEngine();
    ENGINES.forEach(e => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'eng' + (e.id === cur.id ? ' on' : '');
      b.textContent = e.name;
      b.title = '用「' + e.name + '」搜索（前缀 ' + e.prefix[0] + '）';
      b.addEventListener('click', () => { state.search.engine = e.id; saveConfig(); renderEngines(); syncSettings(); $('#q').focus(); });
      wrap.appendChild(b);
    });
    $('#engineDot').textContent = cur.dot;
    $('#engineBtn').title = '当前：' + cur.name + '（点一下换一个 / Tab 也可以）';
  }

  function cycleEngine(step) {
    const i = ENGINES.findIndex(e => e.id === currentEngine().id);
    const n = (i + (step || 1) + ENGINES.length) % ENGINES.length;
    state.search.engine = ENGINES[n].id;
    saveConfig();
    renderEngines();
    syncSettings();
    toast('搜索引擎：' + ENGINES[n].name);
  }

  function submitSearch(raw) {
    let kw = toHalfWidth(raw);
    if (!kw) return;
    let engine = currentEngine();
    const m = kw.match(/^([a-zA-Z]{1,6})\s+([\s\S]+)$/);
    if (m) {
      const hit = ENGINES.filter(e => e.prefix.indexOf(m[1].toLowerCase()) >= 0)[0];
      if (hit) { engine = hit; kw = m[2].trim(); }
    }
    if (isUrlLike(kw)) { window.location.href = normalizeUrl(kw); return; }
    window.location.href = engine.url.replace('%s', encodeURIComponent(kw));
  }

  /* ------------------------------------------------------------ 时钟 / 问候 */
  const WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

  function slotOf(h) {
    if (h >= 5 && h < 8) return 'dawn';
    if (h >= 8 && h < 11) return 'morn';
    if (h >= 11 && h < 13) return 'noon';
    if (h >= 13 && h < 17) return 'after';
    if (h >= 17 && h < 19) return 'dusk';
    if (h >= 19 && h < 23) return 'night';
    return 'late';
  }
  const GREET = { dawn: '凌晨好…', morn: '早上好呀', noon: '中午好', after: '下午好', dusk: '傍晚好', night: '晚上好', late: '夜深了呢' };

  let lastSlot = null;
  function tick() {
    const d = new Date();
    $('#clockTime').textContent = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    $('#clockSec').textContent = pad2(d.getSeconds());
    const slot = slotOf(d.getHours());
    $('#greet').textContent = GREET[slot] + '，雪然在哦 ✿';
    $('#today').textContent = d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 · ' + WEEK[d.getDay()];
    if (slot !== lastSlot) {
      lastSlot = slot;
      setBubble(say(slot), 4200);
    }
  }

  function say(slot) {
    const list = LINES[slot] || LINES.morn;
    return list[Math.floor(Math.random() * list.length)];
  }

  let bubbleTimer = 0;
  function setBubble(text, ms) {
    const b = $('#bubble');
    b.textContent = text;
    b.classList.add('show');
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => b.classList.remove('show'), ms || 3600);
  }

  /* -------------------------------------------------------------- 看板娘 */
  let petIdx = 0, petTimer = 0;
  function initPet() {
    CHIBI.forEach(src => { const i = new Image(); i.src = src; });
    const petEl = $('#pet');
    const bubble = $('#petBubble');
    const img = $('#petImg');
    const speak = () => {
      bubble.textContent = PET_LINES[Math.floor(Math.random() * PET_LINES.length)];
      bubble.classList.add('show');
      clearTimeout(petTimer);
      petTimer = setTimeout(() => bubble.classList.remove('show'), 2600);
    };
    const wiggle = () => {
      petIdx = (petIdx + 1) % CHIBI.length;
      img.src = CHIBI[petIdx];
      speak();
    };
    petEl.addEventListener('click', wiggle);
    petEl.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); wiggle(); } });
    bubble.classList.add('show');
    setTimeout(() => bubble.classList.remove('show'), 3000);
  }

  /* ------------------------------------------------------------- 背景 / Logo */
  /* ------------------------------------------------------------- 主题（浅/暗） */
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

  function resolvedTheme() {
    if (state.theme === 'auto') return prefersDark.matches ? 'dark' : 'light';
    return state.theme === 'dark' ? 'dark' : 'light';
  }

  function applyTheme() {
    const t = resolvedTheme();
    document.documentElement.dataset.theme = t;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'dark' ? '#241722' : '#ffd9e8');

    /* 当前这套配色不属于这个主题就临时用该主题的第一套
       （只影响这次显示，不写回配置 —— 页面不会主动改你的设置） */
    const list = BG_PRESETS[t];
    if (!list.some(p => p.grad === state.bg.grad)) {
      state.bg.grad = list[0].grad;
      state.bg.bright = list[0].bright;
    }
    renderBgPresets();
    applyBg();
    syncSettings();
    $$('.theme-opt').forEach(b => b.classList.toggle('on', b.dataset.theme === state.theme));
    $('#btnTheme').title = t === 'dark' ? '现在是夜樱（暗色），点一下变回樱花' : '现在是樱花（浅色），点一下进夜樱（暗色）';
  }

  function setTheme(mode) {
    state.theme = mode;
    saveConfig();
    applyTheme();
    const label = mode === 'auto' ? '跟随系统' : (mode === 'dark' ? '夜樱（暗色）' : '樱花（浅色）');
    toast('主题：' + label + ' ✿');
  }

  prefersDark.addEventListener('change', () => { if (state.theme === 'auto') applyTheme(); });

  function applyBg() {
    const el = $('#bg');
    el.style.backgroundImage = state.bg.grad || DEFAULT_GRAD;
    el.style.filter = 'brightness(' + (state.bg.bright / 100) + ') saturate(1.08)';
    document.documentElement.style.setProperty('--bg-dim', (state.bg.dim / 100).toFixed(2));
  }

  function applyLogo() {
    const img = $('#brandImg');
    if (state.logo.img) { img.src = state.logo.img; img.style.display = ''; }
    else img.style.display = 'none';
    $('#brandSub').textContent = state.logo.sub || '';
    document.documentElement.style.setProperty('--logo-scale', (state.logo.size / 100).toFixed(2));
  }

  function applyFx() {
    document.body.classList.toggle('editing', !!state.search.edit);
    $('#btnEditMode').classList.toggle('on', !!state.search.edit);
    $('#pet').classList.toggle('hidden', !state.fx.pet);
  }

  function applyAll() {
    applyTheme();          // 主题 → 会顺带处理背景配色
    applyLogo();
    applyFx();
    renderEngines();
    renderTiles();
    syncSettings();
  }

  /* ------------------------------------------------------------- 设置面板 */
  function syncSettings() {
    const b = state.bg;
    $('#setDim').value = b.dim;       $('#valDim').textContent = b.dim + '%';
    $('#setBright').value = b.bright; $('#valBright').textContent = b.bright + '%';
    $('#bgPresets').querySelectorAll('.preset').forEach(n => n.classList.toggle('on', n.dataset.grad === b.grad));

    $('#setLogoImg').value = /^data:/.test(state.logo.img) ? '（已上传本地图片）' : state.logo.img;
    $('#setLogoSub').value = state.logo.sub;
    $('#setLogoSize').value = state.logo.size; $('#valLogoSize').textContent = state.logo.size + '%';

    const sel = $('#setEngine');
    if (!sel.options.length) ENGINES.forEach(e => sel.appendChild(new Option(e.name, e.id)));
    sel.value = state.search.engine;
    $('#tgNewTab').checked = !!state.search.newTab;
    $('#tgEdit').checked = !!state.search.edit;

    $('#tgPetals').checked = !!state.fx.petals;
    $('#tgStars').checked = !!state.fx.stars;
    $('#tgTrail').checked = !!state.fx.trail;
    $('#tgPet').checked = !!state.fx.pet;
  }

  function renderBgPresets() {
    const wrap = $('#bgPresets');
    wrap.innerHTML = '';
    BG_PRESETS[resolvedTheme()].forEach(p => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'preset';
      b.dataset.grad = p.grad;
      b.textContent = p.name;
      b.style.backgroundImage = p.grad;
      b.addEventListener('click', () => {
        state.bg.grad = p.grad;
        state.bg.bright = p.bright;
        saveConfig(); applyBg(); syncSettings();
        toast('背景配色换成「' + p.name + '」啦 ✿');
      });
      wrap.appendChild(b);
    });
  }

  function openDrawer(open) {
    $('#drawer').classList.toggle('show', open);
    $('#mask').classList.toggle('show', open);
    $('#drawer').setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  function openDialog(tile) {
    editing = tile || null;
    $('#dlgTitle').textContent = tile ? '编辑网址' : '添加网址';
    $('#dlgName').value = tile ? tile.name : '';
    $('#dlgUrl').value = tile ? tile.url : '';
    $('#dlgIcon').value = tile ? tile.icon : '';
    $('#dlgDelete').style.display = tile ? '' : 'none';
    $('#dialogWrap').classList.add('show');
    $('#dialogWrap').setAttribute('aria-hidden', 'false');
    setTimeout(() => $(tile ? '#dlgName' : '#dlgUrl').focus(), 120);
  }
  let editing = null;

  function closeDialog() {
    $('#dialogWrap').classList.remove('show');
    $('#dialogWrap').setAttribute('aria-hidden', 'true');
    editing = null;
  }

  function saveDialog() {
    const rawUrl = $('#dlgUrl').value.trim();
    const url = normalizeUrl(rawUrl);
    if (!url) { toast('网址好像不太对哦～'); $('#dlgUrl').focus(); return; }
    const name = $('#dlgName').value.trim() || domainOf(url);
    const icon = $('#dlgIcon').value.trim();
    if (editing) {
      /* 缓存 key 是「主机+端口」，清理也得用同一个，不然带端口的清不掉 */
      const oldHost = hostOf(editing.url);
      Object.assign(editing, { name: name, url: url, icon: icon });
      const newHost = hostOf(url);
      if (oldHost && oldHost !== newHost) delete iconCache[oldHost];
      if (newHost) delete iconCache[newHost];   // 允许重新抓取
      saveIconCache();
      saveConfig(); renderTiles(); closeDialog();
      toast('改好啦 ✿');
    } else {
      const tile = { id: uid(), name: name, url: url, icon: icon };
      state.tiles.push(tile);
      saveConfig(); renderTiles(); closeDialog();
      toast('「' + name + '」已加入快捷方式 ✿');
    }
  }

  /* ------------------------------------------------------------------ Toast */
  let toastTimer = 0;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  /* ---------------------------------------------------------------- 动效层 */
  function initFx() {
    const cv = $('#fx');
    const ctx = cv.getContext('2d');
    let W = 0, H = 0, DPR = 1;
    let petals = [], stars = [], trail = [], burst = [];

    function resize() {
      DPR = Math.min(2, window.devicePixelRatio || 1);
      W = window.innerWidth; H = window.innerHeight;
      cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
      cv.style.width = W + 'px'; cv.style.height = H + 'px';
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      buildStars();
    }

    function buildStars() {
      stars = [];
      const n = Math.round(Math.min(30, (W * H) / 42000));
      for (let i = 0; i < n; i++) {
        stars.push({ x: Math.random() * W, y: Math.random() * H * 0.92, r: 2 + Math.random() * 4, p: Math.random() * Math.PI * 2, s: 0.6 + Math.random() * 1.4 });
      }
    }

    function spawnPetal() {
      return {
        x: Math.random() * W, y: -20 - Math.random() * 60,
        s: 4 + Math.random() * 6,
        vy: 0.35 + Math.random() * 0.75,
        vx: -0.5 + Math.random() * 1.0,
        rot: Math.random() * Math.PI * 2, vr: -0.02 + Math.random() * 0.04,
        a: 0.5 + Math.random() * 0.45,
        hue: Math.random() < 0.25 ? 45 : 335
      };
    }
    function buildPetals() {
      petals = [];
      const n = Math.round(Math.min(26, W / 62));
      for (let i = 0; i < n; i++) {
        const p = spawnPetal();
        p.y = Math.random() * H;
        petals.push(p);
      }
    }

    function petalPath(s) {
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.bezierCurveTo(s * 0.95, -s * 0.45, s * 0.7, s * 0.65, 0, s);
      ctx.bezierCurveTo(-s * 0.7, s * 0.65, -s * 0.95, -s * 0.45, 0, -s);
      ctx.closePath();
      ctx.fill();
    }

    function sparkle(x, y, r, rot, alpha, color) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.quadraticCurveTo(r * 0.16, -r * 0.16, r, 0);
      ctx.quadraticCurveTo(r * 0.16, r * 0.16, 0, r);
      ctx.quadraticCurveTo(-r * 0.16, r * 0.16, -r, 0);
      ctx.quadraticCurveTo(-r * 0.16, -r * 0.16, 0, -r);
      ctx.fill();
      ctx.restore();
    }

    let t0 = performance.now();
    function frame(now) {
      const dt = Math.min(2.4, (now - t0) / 16.67);
      t0 = now;
      ctx.clearRect(0, 0, W, H);

      if (state.fx.stars) {
        stars.forEach(st => {
          st.p += 0.02 * st.s * dt;
          const k = 0.35 + 0.65 * Math.abs(Math.sin(st.p));
          sparkle(st.x, st.y, st.r * (0.7 + 0.5 * k), st.p * 0.5, 0.75 * k, 'rgba(255,236,180,0.95)');
        });
      }

      if (state.fx.petals) {
        petals.forEach((p, i) => {
          p.x += (p.vx + Math.sin((now / 1400) + i) * 0.5) * dt;
          p.y += p.vy * dt;
          p.rot += p.vr * dt;
          if (p.y > H + 30 || p.x < -40 || p.x > W + 40) petals[i] = spawnPetal();
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.globalAlpha = p.a;
          ctx.fillStyle = p.hue === 45 ? 'rgba(255,225,160,0.9)' : 'rgba(255,183,214,0.95)';
          ctx.shadowColor = 'rgba(255,150,195,0.7)';
          ctx.shadowBlur = 6;
          petalPath(p.s);
          ctx.restore();
        });
      }

      if (trail.length) {
        for (let i = trail.length - 1; i >= 0; i--) {
          const p = trail[i];
          p.life -= 0.028 * dt;
          p.y -= 0.25 * dt;
          if (p.life <= 0) { trail.splice(i, 1); continue; }
          sparkle(p.x, p.y, 3.4 * p.life + 1.2, p.life * 3, p.life, 'rgba(255,158,200,0.95)');
        }
      }

      /* 点击处炸开一片樱花 */
      for (let i = burst.length - 1; i >= 0; i--) {
        const p = burst[i];
        p.life -= 0.016 * dt;
        p.vx *= Math.pow(0.965, dt);
        p.vy = p.vy * Math.pow(0.97, dt) + 0.075 * dt;   // 先四散再被"重力"带下来
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        if (p.life <= 0) { burst.splice(i, 1); continue; }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.min(1, p.life * 1.5) * p.a;
        ctx.fillStyle = p.hue === 45 ? 'rgba(255,226,160,0.98)' : 'rgba(255,178,210,0.98)';
        ctx.shadowColor = 'rgba(255,140,190,0.85)';
        ctx.shadowBlur = 9;
        petalPath(p.s);
        ctx.restore();
      }
      requestAnimationFrame(frame);
    }

    window.addEventListener('pointermove', ev => {
      if (!state.fx.trail) return;
      trail.push({ x: ev.clientX, y: ev.clientY, life: 1 });
      if (trail.length > 46) trail.shift();
    }, { passive: true });

    /* 点一下 → 这里炸开一圈樱花（画在最上层，不会被面板挡住） */
    window.addEventListener('pointerdown', ev => {
      if (!state.fx.petals) return;
      const n = 12 + Math.floor(Math.random() * 6);
      for (let i = 0; i < n; i++) {
        const ang = (Math.PI * 2 * i) / n + Math.random() * 0.5;
        const sp = 2.2 + Math.random() * 3.6;
        burst.push({
          x: ev.clientX, y: ev.clientY,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp - 1.4,
          s: 4 + Math.random() * 5.5,
          rot: Math.random() * Math.PI * 2,
          vr: -0.12 + Math.random() * 0.24,
          life: 0.85 + Math.random() * 0.5,
          a: 0.7 + Math.random() * 0.3,
          hue: Math.random() < 0.22 ? 45 : 335
        });
      }
      if (burst.length > 320) burst.splice(0, burst.length - 320);
    }, { passive: true });

    window.addEventListener('resize', () => { resize(); buildPetals(); });
    document.addEventListener('visibilitychange', () => { t0 = performance.now(); });

    resize();
    buildPetals();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      state.fx.petals = false; state.fx.stars = false; state.fx.trail = false;
    }
    requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------------------ 绑定 */
  function bind() {
    /* 搜索 */
    $('#searchForm').addEventListener('submit', ev => { ev.preventDefault(); submitSearch($('#q').value); });
    $('#engineBtn').addEventListener('click', () => cycleEngine(1));
    $('#q').addEventListener('keydown', ev => {
      if (ev.key === 'Tab') { ev.preventDefault(); cycleEngine(ev.shiftKey ? -1 : 1); }
      if (ev.key === 'Escape') { ev.target.value = ''; ev.target.blur(); }
    });
    $('#q').addEventListener('input', ev => {
      const v = ev.target.value.trim();
      const m = v.match(/^([0-9])$/);
      if (m && +m[1] >= 1 && +m[1] <= ENGINES.length) cycleEngine(+m[1] - 1 - ENGINES.findIndex(e => e.id === currentEngine().id));
    });

    /* 立绘 / Logo 说话 */
    $('#charWrap').addEventListener('click', () => setBubble(say(slotOf(new Date().getHours())), 3600));
    $('#charWrap').addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setBubble(say(slotOf(new Date().getHours())), 3600); } });
    $('#brand').addEventListener('click', () => setBubble(say(slotOf(new Date().getHours())), 3600));

    /* 快捷方式 */
    $('#btnAddTile').addEventListener('click', () => openDialog(null));
    $('#btnAddTile2').addEventListener('click', () => { openDrawer(false); openDialog(null); });
    $('#btnEditMode').addEventListener('click', () => {
      state.search.edit = !state.search.edit;
      saveConfig(); applyFx(); syncSettings();
      toast(state.search.edit ? '整理模式：拖动排序、点 ✎ ✕ 修改' : '退出整理模式');
    });
    $('#dlgSave').addEventListener('click', saveDialog);
    $('#dlgCancel').addEventListener('click', closeDialog);
    $('#dlgClose').addEventListener('click', closeDialog);
    $('#dlgDelete').addEventListener('click', () => { if (editing) { const id = editing.id; closeDialog(); removeTile(id); } });
    $('#dialogWrap').addEventListener('click', ev => { if (ev.target === $('#dialogWrap')) closeDialog(); });
    $('#dlgUrl').addEventListener('keydown', ev => { if (ev.key === 'Enter') saveDialog(); });
    /* 重抓图标：清掉这台主机的图标缓存 → 清空图标栏 → 直接保存，立刻重新抓一次 */
    $('#dlgRefetch').addEventListener('click', () => {
      const url = normalizeUrl($('#dlgUrl').value);
      if (!url) { toast('先填个网址呀～'); $('#dlgUrl').focus(); return; }
      const h = hostOf(url);
      if (h) { delete iconCache[h]; saveIconCache(); }
      $('#dlgIcon').value = '';
      saveDialog();
    });
    $('#dlgName').addEventListener('keydown', ev => { if (ev.key === 'Enter') $('#dlgUrl').focus(); });
    $('#dlgIcon').addEventListener('keydown', ev => { if (ev.key === 'Enter') saveDialog(); });

    /* 设置抽屉 */
    $('#btnSettings').addEventListener('click', () => openDrawer(true));
    $('#btnCloseDrawer').addEventListener('click', () => openDrawer(false));
    $('#mask').addEventListener('click', () => openDrawer(false));

    /* 主题 */
    $('#btnTheme').addEventListener('click', () => setTheme(resolvedTheme() === 'dark' ? 'light' : 'dark'));
    $$('.theme-opt').forEach(b => b.addEventListener('click', () => setTheme(b.dataset.theme)));

    [['#setDim', 'dim', '%'], ['#setBright', 'bright', '%']].forEach(pair => {
      const el = $(pair[0]);
      el.addEventListener('input', ev => {
        state.bg[pair[1]] = +ev.target.value;
        applyBg(); syncSettings();
      });
      el.addEventListener('change', saveConfig);
    });

    $('#setLogoImg').addEventListener('change', ev => {
      const v = ev.target.value.trim();
      state.logo.img = /^（.*）$/.test(v) ? state.logo.img : v;
      saveConfig(); applyLogo();
    });
    $('#logoFile').addEventListener('change', ev => {
      const f = ev.target.files && ev.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => { state.logo.img = r.result; saveConfig(); applyLogo(); toast('Logo 换好啦 ✿'); };
      r.readAsDataURL(f);
    });
    $('#btnResetLogo').addEventListener('click', () => {
      state.logo.img = DEFAULTS.logo.img;
      saveConfig(); applyLogo(); syncSettings();
    });
    $('#setLogoSub').addEventListener('change', ev => { state.logo.sub = ev.target.value; saveConfig(); applyLogo(); });
    $('#setLogoSize').addEventListener('input', ev => {
      state.logo.size = +ev.target.value;
      applyLogo();
      $('#valLogoSize').textContent = state.logo.size + '%';
    });
    $('#setLogoSize').addEventListener('change', saveConfig);

    $('#setEngine').addEventListener('change', ev => { state.search.engine = ev.target.value; saveConfig(); renderEngines(); });
    $('#tgNewTab').addEventListener('change', ev => { state.search.newTab = ev.target.checked; saveConfig(); renderTiles(); });
    $('#tgEdit').addEventListener('change', ev => { state.search.edit = ev.target.checked; saveConfig(); applyFx(); });

    [['#tgPetals', 'petals'], ['#tgStars', 'stars'], ['#tgTrail', 'trail'], ['#tgPet', 'pet']].forEach(pair => {
      $(pair[0]).addEventListener('change', ev => {
        state.fx[pair[1]] = ev.target.checked;
        saveConfig(); applyFx();
      });
    });

    $('#btnExport').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'xueran-home-config.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast('配置导出啦 ✿');
    });
    $('#importFile').addEventListener('change', ev => {
      const f = ev.target.files && ev.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const raw = JSON.parse(r.result);
          state = adoptConfig(raw);
          saveConfig(); applyAll();
          toast('配置导入成功 ✿');
        } catch (e) { toast('这个配置文件读不出来呢…'); }
      };
      r.readAsText(f);
    });
    $('#btnReset').addEventListener('click', () => {
      state = clone(DEFAULTS);
      state.tiles = DEFAULT_TILES.map(normalizeTile);
      iconCache = {};
      saveIconCache(); saveConfig(); applyAll();
      toast('已经恢复默认设置 ✿');
    });

    /* 快捷键 */
    document.addEventListener('keydown', ev => {
      const tag = (ev.target.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
      if (ev.key === 'Escape') {
        if ($('#dialogWrap').classList.contains('show')) return closeDialog();
        if ($('#drawer').classList.contains('show')) return openDrawer(false);
      }
      if (typing) return;
      if (ev.key === '/') { ev.preventDefault(); $('#q').focus(); }
      else if (ev.key === 's' || ev.key === 'S') openDrawer(true);
      else if (ev.key === 'n' || ev.key === 'N') openDialog(null);
      else if (ev.key === 'd' || ev.key === 'D') setTheme(resolvedTheme() === 'dark' ? 'light' : 'dark');
    });

    window.addEventListener('hashchange', () => { if (location.hash === '#settings') openDrawer(true); });
  }

  /* ------------------------------------------------------------------ 启动 */
  function init() {
    bind();
    renderBgPresets();
    applyAll();

    /* 老配置的一次性默认值迁移（只做一次，做完就存下来；以后这个开关听你的） */
    if (cfgMigrated) {
      saveConfig();
      setTimeout(() => toast('快捷方式已改成「在当前标签页打开」✿（只改这一次）'), 700);
    }

    initPet();
    initFx();
    tick();
    setInterval(tick, 1000);
    setTimeout(() => setBubble(say(slotOf(new Date().getHours())), 4000), 700);
    /* 闲着的时候也偶尔说句话，页面看着有生气 */
    setInterval(() => {
      if (!document.hidden && !document.body.classList.contains('editing')) {
        setBubble(say(slotOf(new Date().getHours())), 5200);
      }
    }, 24000);
    if (location.hash === '#settings') openDrawer(true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
