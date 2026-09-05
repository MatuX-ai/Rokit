# Changelog

本项目所有显著变更记录于此。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Planned
- 多作品库独立首秀
- 数据导出 / 导入
- L1 直发（本地 OAuth）
- 反馈采集 + AI 分析
- 录屏成片本地剪辑

## [0.1.0] - 2026-09-05

MVP 1.0 首发。本版本在原 `ai-launch-master` 原型基础上完成上线前加固。

### Added
- 桌面端 Electron 36 壳（内置 Node 22 + `node:sqlite`）
- BYOK 模型接入：兼容 OpenAI Chat Completions 协议（DeepSeek / OpenAI / Ollama / 通义 / LM Studio 等）
- 单文件产品界面 `index.html`（首秀向导 · 数据看板 · 我的作品）
- SQLite 本地存储（`%APPDATA%/Rokit/ai-launch-master.db`，WAL 模式）
- JSON 文件兜底（当 SQLite 不可用时降级）
- 13 个平台自动 / 半自动发布适配器（GitHub / PH / V2EX / 掘金 / X / Facebook / YouTube / 即刻 / B站 / 小红书 / 抖音 / 知乎 / 微信公众号）
- L2 跳转发布（生成文案 + 复制 + 打开平台）
- 内置发布浏览器持久化分区（`persist:pub`，登录态落盘）
- 历史版本目录迁移（`AI推广大师` / `推广火箭` → `Rokit`）
- LICENSE（MIT）、CHANGELOG、隐私政策

### Security
- 渲染进程开启 `contextIsolation`，禁用 `nodeIntegration`
- 所有 IPC 走 `contextBridge`，仅暴露最小 API 表面
- `shell.openExternal` 强制白名单（仅 http/https）
- API Key 仅存本机 SQLite，明文存储（用户自负；如需加密存储见 1.5 路线图）

### Known Limitations
- L1 直发（GitHub OAuth 自动发布）尚未实现，需手动粘贴
- 国内抖音 / 小红书 / 公众号 / B站 / 知乎 / 即刻 6 个平台为半自动（自动填正文，最后一步需人工）
- 应用未做代码签名，Windows 首次启动会触发 SmartScreen 拦截
- `node:sqlite` 为 Electron 36 新特性，< 36 版本会回退 JSON 兜底
