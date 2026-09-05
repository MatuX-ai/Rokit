// Rokit · 预加载脚本：向渲染进程安全暴露能力
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // 设置（BYOK）
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (s) => ipcRenderer.invoke('settings:save', s),
  // 作品
  listWorks: () => ipcRenderer.invoke('works:list'),
  saveWork: (w) => ipcRenderer.invoke('works:save', w),
  deleteWork: (id) => ipcRenderer.invoke('works:delete', id),
  // 发布记录
  listPubs: () => ipcRenderer.invoke('pubs:list'),
  addPub: (r) => ipcRenderer.invoke('pubs:add', r),
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
