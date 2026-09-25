// Rokit · 预加载脚本：向渲染进程安全暴露能力（v1.5 增量）
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // 设置（BYOK）
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (s) => ipcRenderer.invoke('settings:save', s),
  // v1.5 凭据（OS 凭据管理器）
  secretsSetApiKey: (v) => ipcRenderer.invoke('secrets:set-api-key', v),
  secretsClearApiKey: () => ipcRenderer.invoke('secrets:clear-api-key'),
  secretsStatus: () => ipcRenderer.invoke('secrets:status'),
  secretsSetGithubPat: (v) => ipcRenderer.invoke('secrets:set-github-pat', v),
  secretsClearGithubPat: () => ipcRenderer.invoke('secrets:clear-github-pat'),
  secretsMigratePlaintext: () => ipcRenderer.invoke('secrets:migrate-plaintext'),
  // 主推队列
  queueSchedule: () => ipcRenderer.invoke('queue:schedule'),
  // 反馈（采集 / 分析 / 列表）
  feedbackCollect: (payload) => ipcRenderer.invoke('feedback:collect', payload),
  feedbackAnalyze: (payload) => ipcRenderer.invoke('feedback:analyze', payload),
  feedbackList: (workId) => ipcRenderer.invoke('feedback:list', { workId: workId }),
  feedbackListClusters: (workId) => ipcRenderer.invoke('feedback:list-clusters', { workId: workId }),
  feedbackSummarize: (workId) => ipcRenderer.invoke('feedback:summarize', { workId: workId }),
  // 录制（renderer 负责 MediaRecorder，main 负责写盘）
  recorderListSources: () => ipcRenderer.invoke('recorder:list-sources'),
  recorderStart: (opts) => ipcRenderer.invoke('recorder:start', opts),
  recorderAppendChunk: (sessionId, chunk) => ipcRenderer.invoke('recorder:append-chunk', { sessionId: sessionId, chunk: chunk }),
  recorderStop: (sessionId) => ipcRenderer.invoke('recorder:stop', { sessionId: sessionId }),
  recorderDiscard: (sessionId) => ipcRenderer.invoke('recorder:discard', { sessionId: sessionId }),
  recorderListSessions: () => ipcRenderer.invoke('recorder:list-sessions'),
  recorderProbe: (path) => ipcRenderer.invoke('recorder:probe', { path: path }),
  // 视频后处理（ffmpeg-static）
  videoProcess: (input, opts) => ipcRenderer.invoke('video:process', { input: input, opts: opts }),
  videoMetadata: (input) => ipcRenderer.invoke('video:metadata', { input: input }),
  videoTranscode: (input, opts) => ipcRenderer.invoke('video:transcode', { input: input, opts: opts }),
  videoThumb: (input, opts) => ipcRenderer.invoke('video:thumb', { input: input, opts: opts }),
  videoAvailable: () => ipcRenderer.invoke('video:available'),
  // GitHub L1 直发
  githubCreateRelease: (opts) => ipcRenderer.invoke('github:create-release', opts),
  githubProbe: () => ipcRenderer.invoke('github:probe'),
  // 渠道健康度批量探测
  channelsHealth: (channels) => ipcRenderer.invoke('channels:health', channels),
  // 作品
  listWorks: () => ipcRenderer.invoke('works:list'),
  saveWork: (w) => ipcRenderer.invoke('works:save', w),
  deleteWork: (id) => ipcRenderer.invoke('works:delete', id),
  // 发布记录
  listPubs: () => ipcRenderer.invoke('pubs:list'),
  addPub: (r) => ipcRenderer.invoke('pubs:add', r),
  // 推广渠道（增删改 + 连通性测试）
  listChannels: () => ipcRenderer.invoke('channels:list'),
  saveChannel: (c) => ipcRenderer.invoke('channels:save', c),
  deleteChannel: (id) => ipcRenderer.invoke('channels:delete', id),
  testChannel: (payload) => ipcRenderer.invoke('channels:test', payload),
  // AI 能力
  generate: (req) => ipcRenderer.invoke('llm:generate', req),
  // 抓取作品信息（GitHub / 普通网址）
  fetchMeta: (url) => ipcRenderer.invoke('fetch:meta', url),
  // 自动发布浏览器（内置登录态自动填表/发布）
  pubLaunch: (platformId, payload) => ipcRenderer.invoke('pub:launch', { platformId, payload }),
  pubSubmit: (platformId, payload) => ipcRenderer.invoke('pub:submit', { platformId, payload }),
  pubOpen: (url) => ipcRenderer.invoke('pub:open', url),
  // 打开外部链接（平台发布页）
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url)
});
