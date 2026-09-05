// Rokit · BYOK LLM 接入层（OpenAI 兼容 Chat Completions）
// 支持 DeepSeek / OpenAI / 通义 / 本地 Ollama / LM Studio 等任意兼容端点

const DEFAULT_TIMEOUT_MS = 30000;

// 带超时的 fetch 工具
async function fetchWithTimeout(url, opt, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(function () { ctrl.abort(); }, ms || DEFAULT_TIMEOUT_MS);
  try {
    return await fetch(url, Object.assign({ signal: ctrl.signal }, opt || {}));
  } finally {
    clearTimeout(t);
  }
}

async function chatComplete(settings, req) {
  const base = String(settings.base_url || '').replace(/\/+$/, '');
  const model = settings.model || 'deepseek-chat';
  const url = base ? base + '/chat/completions' : 'https://api.deepseek.com/v1/chat/completions';
  const timeout = typeof settings.timeout === 'number' && settings.timeout > 0
    ? settings.timeout
    : DEFAULT_TIMEOUT_MS;

  let res;
  try {
    res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (settings.api_key || '')
      },
      body: JSON.stringify({
        model,
        messages: req.messages,
        temperature: req.temperature != null ? req.temperature : 0.8,
        max_tokens: req.max_tokens != null ? req.max_tokens : 1200,
        stream: false
      })
    }, timeout);
  } catch (e) {
    if (e && (e.name === 'AbortError' || /aborted/i.test(String(e.message || '')))) {
      throw new Error('模型请求超时（' + (timeout / 1000) + 's）：' + url);
    }
    throw new Error('无法连接模型端点（' + url + '）：' + (e && e.message ? e.message : String(e)));
  }

  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 300); } catch (_) {}
    throw new Error('模型请求失败 ' + res.status + (detail ? '：' + detail : ''));
  }

  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error('模型返回非 JSON：' + (e && e.message ? e.message : String(e)));
  }

  const content = data && data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content
    : '';
  return String(content || '');
}

module.exports = { chatComplete, fetchWithTimeout, DEFAULT_TIMEOUT_MS };
