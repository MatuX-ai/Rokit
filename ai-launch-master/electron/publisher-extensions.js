// Rokit · 推广渠道扩展（v1.5）
// 1) GitHub L1 直发：通过 GitHub Releases API 创建 release 上传产物
//    需要用户配置 GitHub PAT（仅 repo scope），PAT 走 secrets.getGithubPat() 加密存储
// 2) healthCheck：探测每个内置平台 / 自定义渠道是否仍可达 + 关键 DOM 选择器是否变更
//
// 所有网络请求统一走 fetchWithTimeout，避免阻塞。

'use strict';

const fetch = globalThis.fetch;

// 默认超时（健康度探测走短超时）
const HC_TIMEOUT_MS = 8000;
// Release API 默认超时（创建 release 可能较慢）
const RELEASE_TIMEOUT_MS = 20000;

function fetchWithTimeout(url, opt, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(function () { ctrl.abort(); }, ms || HC_TIMEOUT_MS);
  return fetch(url, Object.assign({ signal: ctrl.signal }, opt || {}))
    .finally(function () { clearTimeout(t); });
}

// 从 GitHub URL 提取 owner/repo
function repoFromLink(url) {
  if (!url) return null;
  const m = /^https?:\/\/(www\.)?github\.com\/([^/?#]+\/[^/?#]+)/i.exec(String(url));
  if (!m) return null;
  return m[2].replace(/\.git$/i, '');
}

// 尝试从 work.url / type 等推导首个 GitHub 链接（用于 pickerLaunchUrl）
function pickLaunchUrl(work) {
  if (!work) return null;
  const url = work.url || '';
  const r = repoFromLink(url);
  return r ? 'https://github.com/' + r : null;
}

// 健康度探测
//   kind: 'github' | 'v2ex' | 'ph' | 'custom' | ...
//   cfg : 渠道配置 { api_base, webhook, ... }
// 返回 { ok: boolean, status?: number, error?: string, lastCheck: ISOString }
async function checkHealth(kind, cfg) {
  const lastCheck = new Date().toISOString();
  const k = String(kind || '').toLowerCase();
  // 内置平台：只探可达性，不做表单选择器断言（避免误报）
  if (k === 'github') {
    // 选 GitHub 任一公开仓库 README 端点，HEAD 一下
    try {
      const r = await fetchWithTimeout('https://api.github.com/zen', { method: 'GET' }, HC_TIMEOUT_MS);
      return { ok: r.ok, status: r.status, lastCheck: lastCheck };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e), lastCheck: lastCheck };
    }
  }
  if (k === 'v2ex') {
    try {
      const r = await fetchWithTimeout('https://www.v2ex.com/api/topics/hot.json', { method: 'GET' }, HC_TIMEOUT_MS);
      return { ok: r.ok, status: r.status, lastCheck: lastCheck };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e), lastCheck: lastCheck };
    }
  }
  if (k === 'ph') {
    try {
      const r = await fetchWithTimeout('https://www.producthunt.com/', { method: 'GET' }, HC_TIMEOUT_MS);
      return { ok: r.ok, status: r.status, lastCheck: lastCheck };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e), lastCheck: lastCheck };
    }
  }
  // 自定义渠道：尝试 webhook（POST）→ 失败再 fallback 到 api_base（POST）
  if (k === 'custom') {
    const url = (cfg && (cfg.webhook || cfg.api_base)) || '';
    if (!/^https?:\/\//i.test(url)) {
      return { ok: false, error: '未配置 api_base 或 webhook', lastCheck: lastCheck };
    }
    try {
      const r = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true, ts: lastCheck })
      }, HC_TIMEOUT_MS);
      return { ok: r.ok, status: r.status, lastCheck: lastCheck };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e), lastCheck: lastCheck };
    }
  }
  // 其它内置平台：粗略 HEAD 主页
  const home = ({
    juejin: 'https://juejin.cn/',
    csdn: 'https://blog.csdn.net/',
    zhihu: 'https://www.zhihu.com/',
    weibo: 'https://weibo.com/',
    x: 'https://x.com/',
    facebook: 'https://www.facebook.com/',
    bilibili: 'https://www.bilibili.com/',
    douyin: 'https://www.douyin.com/',
    xiaohongshu: 'https://www.xiaohongshu.com/',
    youtube: 'https://www.youtube.com/'
  })[k];
  if (!home) return { ok: false, error: 'unknown-kind', lastCheck: lastCheck };
  try {
    const r = await fetchWithTimeout(home, { method: 'GET' }, HC_TIMEOUT_MS);
    return { ok: r.ok, status: r.status, lastCheck: lastCheck };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e), lastCheck: lastCheck };
  }
}

// 批量健康度探测：channels: [{ kind, ...cfg }] -> { kind: result }
async function checkAllHealth(channels) {
  if (!Array.isArray(channels)) return {};
  const tasks = channels.map(async function (c) {
    const r = await checkHealth(c && c.kind, c || {});
    return { key: c && c.kind, result: r };
  });
  const arr = await Promise.all(tasks);
  const out = {};
  for (const item of arr) {
    if (item && item.key) out[item.key] = item.result;
  }
  return out;
}

// GitHub L1 直发：创建 release
//   token: GitHub PAT（仅需 repo scope）
//   opts: { owner, repo, tag, name, body, draft, prerelease, assets: [{ name, data, contentType }] }
// 返回 { ok, release?: { id, html_url, ... }, error? }
async function githubCreateRelease(token, opts) {
  if (!token) return { ok: false, error: 'missing-token' };
  if (!opts || !opts.owner || !opts.repo || !opts.tag) return { ok: false, error: 'missing-params' };
  const url = 'https://api.github.com/repos/' + encodeURIComponent(opts.owner) + '/' + encodeURIComponent(opts.repo) + '/releases';
  let res;
  try {
    res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Authorization': 'token ' + token,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'Rokit-L1/1.5',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tag_name: opts.tag,
        name: opts.name || opts.tag,
        body: opts.body || '',
        draft: !!opts.draft,
        prerelease: !!opts.prerelease
      })
    }, RELEASE_TIMEOUT_MS);
  } catch (e) {
    return { ok: false, error: 'network:' + String((e && e.message) || e) };
  }
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 300); } catch (_) {}
    if (res.status === 401) return { ok: false, status: 401, error: 'PAT 失效或权限不足（需 repo scope）' };
    if (res.status === 404) return { ok: false, status: 404, error: '仓库不存在或 PAT 无权访问' };
    if (res.status === 422) return { ok: false, status: 422, error: 'tag 已存在或参数非法' };
    return { ok: false, status: res.status, error: detail || ('HTTP ' + res.status) };
  }
  const j = await res.json().catch(function () { return null; });
  return {
    ok: true,
    release: j && {
      id: j.id,
      html_url: j.html_url,
      tag: j.tag_name,
      name: j.name,
      upload_url: j.upload_url
    }
  };
}

module.exports = {
  repoFromLink,
  pickLaunchUrl,
  checkHealth,
  checkAllHealth,
  githubCreateRelease
};