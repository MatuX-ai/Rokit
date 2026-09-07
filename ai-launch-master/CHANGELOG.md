# Changelog

本项目所有显著变更记录于此。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added
- **推广渠道 BYOK 说明补强**（UX 改进，避免用户晕菜）：
  - 推广渠道 tab 顶部新增「本地优先 + BYOK」常驻说明卡
  - 「渠道说明」面板补入 3 条常见疑问（为什么不填账号 / 登录态存哪 / 换电脑怎么办）
  - 编辑内置渠道时 `chKindHint` 统一显示 BYOK 解释（不存你的账号密码）
  - 「🚀 火箭发送」弹窗内插入发布浏览器 + 登录态说明
  - 新增 [docs/channels-faq.md](../docs/channels-faq.md)（8 个常见问题答疑）
  - `PRIVACY.md` 增补「一点五、BYOK 原则」章节
- **推广渠道开关启用态变色**：启用态（●）背景改为绿色 `primary-soft` + `primary-dark` 描边 + 阴影环；停用态保持 `muted` 灰色。区分更明显，并加 `aria-pressed` 无障碍属性。

### Planned
- 多作品库独立首秀
- 数据导出 / 导入
- L1 直发（本地 OAuth / GitHub Release API）
- 反馈采集 + AI 分析
- 录屏成片本地剪辑（Remotion 服务端渲染）
- 数据看板接入各平台官方统计 API

## [0.1.3] - 2026-09-07

测试覆盖补强。

### Added
- `tests/logger.test.js`（17 用例）：logger 模块单元测试 —— init 幂等 / 4 级别输出分流（debug + info 走 stdout，warn + error 走 stderr）/ 时间戳格式 / extra 序列化（对象 / 字符串 / falsy）/ 单文件 1MB rotate 滚动（保留 3 个备份，.3 被淘汰）/ 全局异常兜底（uncaughtException + unhandledRejection）
- `tests/store-json.test.js`（28 用例）：Store 层 JSON 兜底模式单元测试（通过 `Module._load` 钩子拦截 `node:sqlite` 加载）—— settings / works / pubs / channels CRUD + 级联删除 + 损坏 JSON 文件静默回退 + 进程重启后持久化往返 + pretty-print 格式校验

### Changed
- `tests/publishers.test.js`：新增 101 行测试用例 —— 重点覆盖 GitHub 适配器 `launch()` 在 URL 带 query / fragment / http / www 子域 / 非 GitHub 域名等边界情况下的行为一致性；并补充 payload 序列化对控制字符 / 反斜杠 / HTML 标签 / 空对象 / 空数组的鲁棒性

### Tests
- 单测用例数：50 → **135**（6 个测试文件全部通过，`npm run lint` 0 error）

## [0.1.2] - 2026-09-07

设置弹窗 z-index 冲突修复 + 安装包重打。

### Fixed
- 模型选择弹窗与设置弹窗同时唤起时偶发层叠错乱（z-index 冲突修复，`fix(electron): 模型选择弹窗 z-index 与设置弹窗冲突`）

## [0.1.1] - 2026-09-07

交付前 UX 审计 + 假功能 / 假数据 / 误导文案专项修复。

### Changed
- **数据看板**：移除 4 项硬编码 demo KPI（12,480 / 342 / 156 / 92%），改为绑定本机会话真实计数（总发布、被启用渠道、首发作品、最近发布）；渠道条形图与里程碑报喜改为读 `state.pubByPlatform` / `state.milestones`，无数据时显示空态
- **示例作品**：4 个示例作品（便签天气 / 校园课表助手 / 像素猫小游戏 / 单词卡速记）加「示例」角标；**不再写入 SQLite**；点击弹 toast「这是示例作品，不可直接首秀」；`persistCurrentWork` 强制拦截 `sample_` 前缀
- **智能拆条 / 合成成片**：所有按钮加「DEMO」角标 + 黄色提示横条 + 完成后 toast 标注「拆条 / 成片为模拟数据 · 正式版由服务端 Remotion 渲染」
- **L1/L2 命名**：13 平台全部按真实能力修正为 L2（AI 备料 + 浏览器自动填表）；ph / juejin / facebook / youtube 4 个原本 `auto:true` 的平台按实际依赖改为 `auto:false` + `manualReason`
- **Web 站文案**：「数据看板」徽章从「已上线」改为「MVP 1.5」；「15 分钟搞定」改为「一条龙搞定」；GitHub chip 从 L1 直发改 L2；首秀耗时从 15 分钟上调为「1 小时 · 熟练后更快」
- **Web 站订阅表单**：彻底移除，改为 GitHub Watch 引导（不再假装能"订阅"）
- **Web 站截图区**：从 CSS 画的伪截图改为 2 张真实 UI 占位 SVG（v0.1.2 替换为 PNG）
- **审计脚本**：`tests/audit.js` 移除强制导航顺序断言；新增 `tests/audit-ux.js` 守门"营销文案与代码能力一致"

### Fixed
- `index.html` 移除 4 条写死的里程碑报喜和 6 条假渠道条形图
- `index.html` 示例作品 `star/dl/play` 从伪造数据归零
- `publishers.js` 误导性 `auto:true` 标注
- `audit.js` 不再强制错误的"首秀→数据看板→推广渠道→我的作品"DOM 顺序
- 桌面端首次启动不再向 `%APPDATA%/Rokit/ai-launch-master.db` 写入示例作品
- Web 站底部版权年份从 2024 改为 2026

### Known Limitations（仍然存在）
- 智能拆条与合成成片为 demo 流程（v0.1.1 不包含 Remotion 服务端）
- 13 平台 L1 直发（API 直发）尚未实现
- 应用未做代码签名，Windows 首次启动会触发 SmartScreen 拦截

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
- 智能拆条 + 合成成片为 demo 流程（v0.1.1 不含 Remotion 服务端，正式版规划在 MVP 1.5）
- L1 直发（GitHub OAuth / 平台开放 API）尚未实现；当前 13 平台均为 L2（浏览器自动填表），自动发布成功后最后一步需用户在发布窗口点击"发布"完成提交
- 应用未做代码签名，Windows 首次启动会触发 SmartScreen 拦截
- `node:sqlite` 为 Electron 36 新特性，< 36 版本会回退 JSON 兜底
