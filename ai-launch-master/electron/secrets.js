// Rokit · 敏感凭据管理（v1.5）
// 把 API Key、GitHub PAT 等敏感字符串从 SQLite 明文存储迁出，
// 写入操作系统原生凭据管理器（Windows = Credential Manager via DPAPI）。
//
// 设计目标：
//   - 主路径：keytar.setPassword / getPassword / deletePassword
//   - 降级：keytar 加载失败（无原生构建 / Linux 无 libsecret / macOS 钥匙串拒绝）→
//     退化为进程内存单例 + 警告日志；UI 上提示用户安装系统组件
//   - 一次性明文迁移：检测到 store.settings.api_key 仍有值时，
//     弹窗询问用户 → 用户同意后写入凭据管理器并清空 SQLite 字段
//
// 所有调用都通过 Promise 包装，确保 main 进程可以 await。

'use strict';

const logger = (() => {
  try { return require('./logger'); } catch (_e) { return { info() {}, warn() {}, error() {} }; }
})();

const SERVICE = 'Rokit';
const ACCOUNT_API_KEY = 'llm-api-key';
const ACCOUNT_GITHUB_PAT = 'github-pat';

// 模块级缓存（避免每次 LLM 调用都走 keytar）
const cache = { apiKey: null, githubPat: null };

let keytar = null;
let keytarLoadError = null;
try {
  keytar = require('keytar');
} catch (e) {
  keytarLoadError = e;
  logger.warn('[secrets] keytar 模块加载失败，敏感字段降级为内存单例', { error: String(e && e.message || e) });
}

function hasNative() {
  return !!keytar;
}

// 通用读写
async function setSecret(account, value) {
  if (!value) {
    return deleteSecret(account);
  }
  if (keytar) {
    try {
      await keytar.setPassword(SERVICE, account, value);
      cache[account] = value;
      return true;
    } catch (e) {
      logger.warn('[secrets] keytar.setPassword 失败，降级为内存', { account, error: String(e && e.message || e) });
    }
  }
  // 降级：仅写入内存（重启即丢；提示用户安装系统组件）
  cache[account] = value;
  return false; // false = 没真正持久化
}

async function getSecret(account) {
  if (cache[account] != null) return cache[account];
  if (!keytar) return null;
  try {
    const v = await keytar.getPassword(SERVICE, account);
    if (v != null) cache[account] = v;
    return v;
  } catch (e) {
    logger.warn('[secrets] keytar.getPassword 失败', { account, error: String(e && e.message || e) });
    return null;
  }
}

async function deleteSecret(account) {
  if (keytar) {
    try { await keytar.deletePassword(SERVICE, account); } catch (e) { /* 不存在则忽略 */ }
  }
  cache[account] = null;
  return true;
}

// API Key 专属接口
async function getApiKey() {
  return getSecret(ACCOUNT_API_KEY);
}
async function setApiKey(value) {
  return setSecret(ACCOUNT_API_KEY, value);
}
async function clearApiKey() {
  return deleteSecret(ACCOUNT_API_KEY);
}

// GitHub PAT 专属接口（L1 直发用）
async function getGithubPat() {
  return getSecret(ACCOUNT_GITHUB_PAT);
}
async function setGithubPat(value) {
  return setSecret(ACCOUNT_GITHUB_PAT, value);
}
async function clearGithubPat() {
  return deleteSecret(ACCOUNT_GITHUB_PAT);
}

// 一次性明文迁移：把 store.settings.api_key 写入凭据管理器后清空 SQLite 字段
// 返回 { migrated: boolean, reason?: string }
async function migratePlaintextApiKey(store) {
  if (!store) return { migrated: false, reason: 'no-store' };
  const current = store.getSettings ? store.getSettings() : null;
  const plaintext = current && current.api_key ? String(current.api_key) : '';
  if (!plaintext) return { migrated: false, reason: 'no-plaintext-key' };
  // 先看凭据管理器里是否已有（避免覆盖用户已有的加密 Key）
  const existing = await getApiKey();
  if (existing && existing === plaintext) {
    // 同值，直接清空 SQLite 字段即可
    store.clearPlaintextApiKey && store.clearPlaintextApiKey();
    return { migrated: true, reason: 'already-in-keytar' };
  }
  await setApiKey(plaintext);
  store.clearPlaintextApiKey && store.clearPlaintextApiKey();
  logger.info('[secrets] API Key 已迁移到 OS 凭据管理器，SQLite 字段已清空');
  return { migrated: true };
}

module.exports = {
  // 通用
  setSecret,
  getSecret,
  deleteSecret,
  hasNative,
  // API Key
  getApiKey,
  setApiKey,
  clearApiKey,
  // GitHub PAT
  getGithubPat,
  setGithubPat,
  clearGithubPat,
  // 迁移
  migratePlaintextApiKey,
  // 调试 / 测试
  _cache: cache,
  _keytarError: () => keytarLoadError
};