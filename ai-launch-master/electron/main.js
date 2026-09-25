// Rokit · Electron 主进程（v1.5）
// v1.5 增量：
//   - 凭据：secrets（keytar）+ 明文 API Key 一次性迁移
//   - 主推队列：queue.schedule() 启动时跑一次
//   - 反馈：collectForWork + analyzeForWork
//   - 录制 / 视频：recorder + video IPC
//   - 推广渠道扩展：checkHealth + GitHub L1 直发
const { app, BrowserWindow, ipcMain, shell, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { Store } = require('./store');
const { chatComplete } = require('./llm');
const { adapters } = require('./publishers');
const logger = require('./logger');

// v1.5 新增模块
const secrets = require('./secrets');
const queue = require('./queue');
const collector = require('./feedback-collector');
const analyzer = require('./feedback-analyzer');
const recorder = require('./recorder');
const video = require('./video');
const pubex = require('./publisher-extensions');

// 尽早安装全局异常兜底（在 app.whenReady 之前也要能捕获）
logger.installGlobalHandlers({ stage: 'pre-app-ready' });

let store = null;

// 固定 userData 目录（品牌更名后路径稳定），并一次性迁移旧数据
(function ensureUserData() {
  const dir = path.join(app.getPath('appData'), 'Rokit');
  const olds = ['AI推广大师', '推广火箭'];
  try {
    olds.forEach(function (oldName) {
      const old = path.join(app.getPath('appData'), oldName);
      if (!fs.existsSync(path.join(dir, 'ai-launch-master.db')) && fs.existsSync(path.join(old, 'ai-launch-master.db'))) {
        fs.mkdirSync(dir, { recursive: true });
        ['ai-launch-master.db', 'ai-launch-master.db-wal', 'ai-launch-master.db-shm'].forEach(function (f) {
          const s = path.join(old, f), d = path.join(dir, f);
          if (fs.existsSync(s)) { try { fs.copyFileSync(s, d); } catch (_e) {} }
        });
      }
    });
  } catch (_e) {}
  app.setPath('userData', dir);
})();

function createWindow() {
  const win = new BrowserWindow({
    width: 1080,
    height: 780,
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    minWidth: 780,
    minHeight: 600,
    title: 'Rokit',
    backgroundColor: '#F4F7F6',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  win.loadFile(path.join(__dirname, '..', 'index.html'));
  return win;
}

// ---------- IPC ----------
ipcMain.handle('settings:get', () => store.getSettings());
ipcMain.handle('settings:save', (_e, s) => store.saveSettings(s));

ipcMain.handle('works:list', () => store.listWorks());
ipcMain.handle('works:save', (_e, w) => store.saveWork(w));
ipcMain.handle('works:delete', (_e, id) => store.deleteWork(id));

ipcMain.handle('pubs:list', () => store.listPubs());
ipcMain.handle('pubs:add', (_e, r) => store.addPub(r));

// ---------- 推广渠道（增删改 + 连通性测试） ----------
ipcMain.handle('channels:list', () => store.listChannels());
ipcMain.handle('channels:save', (_e, c) => store.saveChannel(c));
ipcMain.handle('channels:delete', (_e, id) => store.deleteChannel(id));

// 自定义渠道连通性测试：仅对 kind='custom' 的渠道生效
//   - 优先尝试 webhook（POST JSON）；空则用 api_base（POST JSON）
//   - 发送最小 payload：{test:true, title, body, ts}
ipcMain.handle('channels:test', async (_e, payload) => {
  const url = payload && (payload.webhook || payload.api_base);
  if (!url || !/^https?:\/\//i.test(url)) {
    return { ok: false, error: '未填写有效的 API 地址或 Webhook URL' };
  }
  try {
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(payload.api_key ? { 'Authorization': 'Bearer ' + payload.api_key } : {})
      },
      body: JSON.stringify({
        test: true,
        title: 'Rokit 连接测试',
        body: '这是一条来自 Rokit 的测试消息，用于验证你的渠道接入是否成功。',
        ts: new Date().toISOString()
      })
    }, 9000);
    return {
      ok: res.ok,
      status: res.status,
      // 部分 webhook 服务会返回纯文本，仅截取前 200 字符避免日志爆炸
      preview: (await res.text().catch(function () { return ''; })).slice(0, 200)
    };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
});

// v1.5：渠道健康度批量探测（涵盖内置平台 + 自定义 webhook）
ipcMain.handle('channels:health', async (_e, channels) => {
  try { return await pubex.checkAllHealth(channels || store.listChannels()); }
  catch (e) { return { _error: String((e && e.message) || e) }; }
});

ipcMain.handle('llm:generate', async (_e, req) => {
  // v1.5：不再依赖 settings.api_key；llm.chatComplete 内部已统一走 secrets
  const settings = store.getSettings();
  return chatComplete(settings, req);
});

// ============================================================
// v1.5 新增 IPC：secrets / queue / feedback / recorder / video / github-release
// ============================================================

// ---------- 凭据 ----------
ipcMain.handle('secrets:set-api-key', async (_e, value) => {
  if (!value) return { ok: false, error: 'empty-key' };
  const persisted = await secrets.setApiKey(String(value));
  // 清掉 SQLite 明文（写入凭据管理器后就不再需要）
  if (store && typeof store.clearPlaintextApiKey === 'function') {
    try { store.clearPlaintextApiKey(); } catch (_e) {}
  }
  return { ok: true, persisted: !!persisted };
});

ipcMain.handle('secrets:clear-api-key', async () => {
  await secrets.clearApiKey();
  return { ok: true };
});

ipcMain.handle('secrets:status', async () => {
  const hasNative = secrets.hasNative();
  const apiKey = await secrets.getApiKey();
  const githubPat = await secrets.getGithubPat();
  return {
    hasNative: hasNative,
    hasApiKey: !!apiKey,
    hasGithubPat: !!githubPat,
    keytarError: secrets._keytarError ? String(secrets._keytarError().message || secrets._keytarError() || '') : ''
  };
});

ipcMain.handle('secrets:set-github-pat', async (_e, value) => {
  if (!value) return { ok: false, error: 'empty-pat' };
  const persisted = await secrets.setGithubPat(String(value));
  return { ok: true, persisted: !!persisted };
});

ipcMain.handle('secrets:clear-github-pat', async () => {
  await secrets.clearGithubPat();
  return { ok: true };
});

ipcMain.handle('secrets:migrate-plaintext', async () => {
  return secrets.migratePlaintextApiKey(store);
});

// ---------- 主推队列 ----------
ipcMain.handle('queue:schedule', async () => {
  try { return await queue.schedule(store); }
  catch (e) { return { error: String((e && e.message) || e) }; }
});

// ---------- 反馈：采集 + 分析 ----------
ipcMain.handle('feedback:collect', async (_e, payload) => {
  if (!payload || !payload.work) return { ok: false, error: 'no-work' };
  try {
    const r = await collector.collectForWork(payload.work, payload.opts || {});
    if (r.items && r.items.length && store && typeof store.upsertFeedback === 'function') {
      const n = store.upsertFeedback(r.items);
      return { ok: true, inserted: n, notes: r.notes || {} };
    }
    return { ok: true, inserted: 0, notes: r.notes || {} };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
});

ipcMain.handle('feedback:analyze', async (_e, payload) => {
  if (!payload || !payload.workId) return { ok: false, error: 'no-work-id' };
  try {
    const r = await analyzer.analyzeForWork(store, payload.workId, {
      llm: function (req) { return chatComplete(store.getSettings(), req); },
      maxItems: payload.maxItems || 100,
      clusterThreshold: payload.clusterThreshold
    });
    return { ok: true, clusters: r.clusters.length, updated: r.updated };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
});

ipcMain.handle('feedback:list', (_e, payload) => {
  if (!store || typeof store.listFeedback !== 'function') return [];
  return store.listFeedback(payload && payload.workId);
});

ipcMain.handle('feedback:list-clusters', (_e, payload) => {
  if (!store || typeof store.listFeedbackClusters !== 'function') return [];
  return store.listFeedbackClusters(payload && payload.workId);
});

ipcMain.handle('feedback:summarize', (_e, payload) => {
  return analyzer.summarizeForIpc(store, payload && payload.workId);
});

// ---------- 录制 ----------
recorder.attachIpc(ipcMain);

// ---------- 视频处理 ----------
video.attachIpc(ipcMain);

// ---------- GitHub L1 直发 ----------
ipcMain.handle('github:create-release', async (_e, opts) => {
  if (!opts) return { ok: false, error: 'no-opts' };
  const token = await secrets.getGithubPat();
  if (!token) return { ok: false, error: 'missing-github-pat' };
  try {
    return await pubex.githubCreateRelease(token, opts);
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
});

ipcMain.handle('github:probe', async () => {
  // 仅验证凭据是否有效（用 /user 端点）
  const token = await secrets.getGithubPat();
  if (!token) return { ok: false, error: 'missing-github-pat' };
  try {
    const res = await fetchWithTimeout('https://api.github.com/user', {
      headers: {
        'Authorization': 'token ' + token,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'Rokit-L1/1.5'
      }
    }, 9000);
    if (!res.ok) return { ok: false, status: res.status, error: res.status === 401 ? 'PAT 失效或权限不足' : ('HTTP ' + res.status) };
    const j = await res.json().catch(function () { return null; });
    return { ok: true, login: j && j.login, avatar: j && j.avatar_url };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
});

// ---------- 作品信息抓取（GitHub 仓库 / 普通网址） ----------
function decodeHtml(v) {
  return String(v)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, function (_, n) { try { return String.fromCharCode(+n); } catch (_e) { return ''; } });
}
function ghRepoPart(url) {
  var m = /^https?:\/\/(www\.)?github\.com\/([^/?#]+\/[^/?#]+)/i.exec(url);
  return m ? m[2].replace(/\.git$/i, '') : null;
}
async function fetchWithTimeout(url, opt, ms) {
  var ctrl = new AbortController();
  var t = setTimeout(function () { ctrl.abort(); }, ms || 9000);
  try { return await fetch(url, Object.assign({ signal: ctrl.signal }, opt || {})); }
  finally { clearTimeout(t); }
}
async function fetchGithubMeta(ownerRepo) {
  var api = 'https://api.github.com/repos/' + encodeURIComponent(ownerRepo);
  var res = await fetchWithTimeout(api, { headers: { 'User-Agent': 'tuiguang-huojian/1.0', 'Accept': 'application/vnd.github+json' } });
  if (!res.ok) throw new Error('GitHub 仓库不存在或不可访问（HTTP ' + res.status + '）');
  var j = await res.json();
  var readme = '';
  try {
    var rr = await fetchWithTimeout(api + '/readme', { headers: { 'User-Agent': 'tuiguang-huojian/1.0', 'Accept': 'application/vnd.github.raw+json' } });
    if (rr.ok) readme = String(await rr.text()).slice(0, 1500);
  } catch (_e) {}
  return {
    kind: 'github',
    url: j.html_url || ('https://github.com/' + ownerRepo),
    title: j.full_name || ownerRepo,
    description: j.description || '',
    stars: j.stargazers_count || 0,
    forks: j.forks_count || 0,
    language: j.language || '',
    topics: Array.isArray(j.topics) ? j.topics : [],
    readme: readme
  };
}
async function fetchWebMeta(url) {
  var res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36' } });
  if (!res.ok) throw new Error('页面无法访问（HTTP ' + res.status + '）');
  var html = await res.text();
  var head = html.slice(0, 30000);
  var pick = function (pats) {
    for (var i = 0; i < pats.length; i++) {
      var x = head.match(pats[i]);
      if (x && x[1] && x[1].trim()) return decodeHtml(x[1].trim());
    }
    return '';
  };
  var title = pick([/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i, /<title[^>]*>([^<]*)<\/title>/i]);
  var desc = pick([/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i]);
  return { kind: 'web', url: url, title: title, description: desc };
}
async function fetchPageMeta(url) {
  var g = ghRepoPart(url);
  if (g) return await fetchGithubMeta(g);
  if (/^https?:\/\//i.test(url)) return await fetchWebMeta(url);
  throw new Error('请输入有效的网址（http/https 开头）');
}

ipcMain.handle('shell:openExternal', (_e, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
    return shell.openExternal(url);
  }
  return false;
});

ipcMain.handle('fetch:meta', async (_e, url) => fetchPageMeta(String(url || '').trim()));

// ---------- 自动发布浏览器（内置持久化登录态，按平台自动填表/发布） ----------
let pubWin = null;
function ensurePubWin() {
  if (pubWin && !pubWin.isDestroyed()) return pubWin;
  pubWin = new BrowserWindow({
    width: 1220,
    height: 880,
    show: true,
    title: 'Rokit · 自动发布浏览器',
    backgroundColor: '#F4F7F6',
    webPreferences: {
      // 独立持久化分区：登录态落盘到 %APPDATA%\Rokit\Partitions\pub
      session: session.fromPartition('persist:pub'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  pubWin.on('closed', function () { pubWin = null; });
  return pubWin;
}
function waitPubLoad(win, ms) {
  return new Promise(function (res, rej) {
    if (win.webContents.isLoading()) {
      var t = setTimeout(function () { rej(new Error('页面加载超时')); }, ms || 25000);
      win.webContents.once('did-finish-load', function () { clearTimeout(t); setTimeout(res, 900); });
    } else { setTimeout(res, 900); }
  });
}
async function pubExec(platformId, stage, payload) {
  var a = adapters[platformId];
  if (!a) return { status: 'manual', note: '该平台暂未接入自动发布' };
  try {
    var win = ensurePubWin();
    if (stage === 'fill') {
      var url = (a.launch && a.launch(payload)) || null;
      if (!url) return { status: 'manual', note: '缺少发布地址（请先填写作品链接）' };
      await win.loadURL(url);
      await waitPubLoad(win);
      var r1 = await win.webContents.executeJavaScript(a.fill(payload), true);
      return Object.assign({ platformId: platformId }, r1);
    } else {
      var r2 = await win.webContents.executeJavaScript(a.submit(payload), true);
      return Object.assign({ platformId: platformId }, r2);
    }
  } catch (e) {
    return { status: 'manual', error: String((e && e.message) || e), platformId: platformId };
  }
}
ipcMain.handle('pub:launch', (_e, arg) => pubExec(String(arg && arg.platformId || ''), 'fill', arg && arg.payload || {}));
ipcMain.handle('pub:submit', (_e, arg) => pubExec(String(arg && arg.platformId || ''), 'submit', arg && arg.payload || {}));
ipcMain.handle('pub:open', (_e, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) { ensurePubWin().loadURL(url); return true; }
  return false;
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  // 初始化日志（需要 userData 路径，因此放在 whenReady 后）
  try { logger.init(app.getPath('userData')); logger.info('app ready', { version: app.getVersion() }); } catch (_e) {}
  store = new Store(path.join(app.getPath('userData'), 'ai-launch-master.db'));
  createWindow();

  // v1.5：应用启动后自动跑一次主推队列选择
  try {
    queue.schedule(store).then(function (r) {
      if (r && r.main) logger.info('[queue] main selected', { main: r.main, demoted: r.demoted, promoted: r.promoted });
    }).catch(function (e) { logger.warn('[queue] schedule failed', { error: String((e && e.message) || e) }); });
  } catch (_e) {}

  // v1.5：检测到 SQLite 里仍有明文 API Key 时，自动后台迁移（不阻塞 UI）
  try {
    secrets.migratePlaintextApiKey(store).then(function (m) {
      if (m && m.migrated) logger.info('[secrets] plaintext migration', m);
    }).catch(function (e) { logger.warn('[secrets] migration failed', { error: String((e && e.message) || e) }); });
  } catch (_e) {}

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
