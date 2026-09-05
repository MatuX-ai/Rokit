// Rokit · Electron 主进程
const { app, BrowserWindow, ipcMain, shell, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { Store } = require('./store');
const { chatComplete } = require('./llm');
const { adapters } = require('./publishers');
const logger = require('./logger');

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

ipcMain.handle('llm:generate', async (_e, req) => {
  const settings = store.getSettings();
  if (!settings.api_key) throw new Error('未配置 API Key，请先在右上角设置中填写');
  return chatComplete(settings, req);
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
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
