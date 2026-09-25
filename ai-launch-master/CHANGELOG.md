# Changelog

本项目所有显著变更记录于此。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added (MVP 1.5 · 本机推广引擎全量上线)
- **OS 凭据管理器接入敏感凭据**（secrets.js）：API Key / GitHub PAT 从 SQLite 明文迁出，写入 Windows DPAPI（macOS Keychain / Linux libsecret）。keytar 加载失败降级为进程内存单例 + 警告日志。首次启动自动迁移现有明文 Key，迁移成功即清空 SQLite 字段
- **主推队列状态机**（queue.js）：launching → pending → operating → stable → archived 五状态 + queue_state (main/parked/queued)。定时 schedule(store) 根据状态名次 + priority DESC + launched_at ASC + 14 天稳定期过滤选主推；包底返回 least-bad 避免主推为空
- **反馈采集**（feedback-collector.js）：GitHub Issues 公开 API + V2EX 主题 RSS。内置 `decodeHtml` / `stripHtml` / `parseRss` 极简解析；增量去重依赖 `store.upsertFeedback` 的 UNIQUE(source, external_id)；单源失败不拖垮主流程
- **反馈分析**（feedback-analyzer.js）：纯规则可跑 —— 中文按字 / 英文按词 tokenize + 词典情感 + Jaccard 距离单链接聚类 + P0/P1/P2 优先级。可选 LLM 摘要（异常不阻断主流程）
- **屏幕录制**（recorder.js）：WebM session 管理（createSession / appendChunk / stopSession / discardSession）。桌面端用 `desktopCapturer` + `MediaRecorder` 录屏，主进程仅负责顺序追加 buffer 与 ffmpeg 探测。临时文件落 `%APPDATA%/Rokit/recorder/`
- **视频后处理**（video.js）：`ffmpeg-static` 转封装 / 转码 WebM → MP4（libx264 + aac + faststart） + 抽封面（`scale=1280:-2`） + 掐头去尾（`-ss/-t`）。单文件串行队列避免并发 ffmpeg 把 CPU 打满
- **GitHub L1 直发**（publisher-extensions.js）：`POST /repos/{owner}/{repo}/releases` 创建 Release。PAT 仅从 OS 凭据管理器读取，明文不入 settings JSON；SDK 错误 → 友好中文提示
- **IPC 全面升级**（main.js + preload.js）：新增 24 个 IPC 通道（secrets: 5 + queue: 1 + feedback: 5 + recorder: 6 + video: 4 + github: 3 + channels:health）；预加载脚本仅暴露最小表面，保持 `contextIsolation`
- **数据看板 BYOK 升级**：顶部"未配置 API（点此填 Key）"按 OS 凭据管理器真实状态变色；设置弹窗新增 GitHub PAT 输入字段 + “已配置/未配置”状态提示（输入框始终留空防泄露）
- **移除“1.5 规划中”提示卡**：v1.5 交付后移除 dashboard 顶部占位卡，提示改为常规文案
- **单测覆盖**（tests/*.test.js）新增 6 个测试文件 · 130 用例：secrets (12) / queue (17) / feedback-analyzer (29) / feedback-collector (26) / recorder (12) / video (7)；另修复 llm.test.js 中“缺 api_key 仍发空 Bearer”的旧行为 → 改为主动抛中文提示错

### Fixed (首秀向导文案 / 渲染管线加固)
- **首条欢迎语泄漏 HTML 字面字符**：原写法 `pushAI('你好<br>把作品交给我——<b>文案</b>')` 会过 `miniMd()` 转义，变成 `&lt;br&gt;&lt;b&gt;...` 显示给用户。改为 markdown 写法（`\n` 转 `<br>`，`**文本**` 转 `<b>`），并加注释提醒“不能直接写 HTML 标签”
- **渲染管线分化：原生 HTML 通道 `pushAIHtml`**：新增 `pushAIHtml(t)` 入栈函数，会给消息加 `html:true` 标记。`renderFlow` 按 `m.html` 分叉：标记为 `true` 的原 HTML 跳过 `miniMd` 转义。动态数据由调用方自己 `esc()` 负责转义
- **“发射成功”卡片**改用 `pushAIHtml`：依赖原生 HTML 结构（`.launch-wrap` 居中布局 + `.launch-rocket` 脉冲动画 + 嵌入 button）。原写法会被 miniMd 转义为字面源码
- **同类 bug 全面修复**（均同样原因：HTML 标签经 miniMd 转义后丢失）：
  - L3902：确认作品类型后的“打字机三点动画” `<span class="typing">` —— 改 `pushAIHtml`
  - L5119：切换作品时重放的“打字机三点动画” —— 消息对象加 `html:true`
  - L3844：填入 GitHub 链接后的“抓取结果卡片” `<div class="grab-card">` —— 改 `pushAIHtml`
- **XSS 修复**：两处 AI 消息拼接用户可控的 `w.name` 作品名时未 `esc()`，恶意作品名（如含 `<script>`）可注入 HTML —— L5100、L5190 两处补 `esc(w.name)`
- **单测覆盖**新增 `tests/render-flow.test.js` · 28 用例：`miniMd` 转义 / markdown 转换（11）、`pushAI` / `pushAIHtml` 入栈语义（3）、`render` 分叉渲染（6）、回归保护（5：欢迎语修复前后、发射成功、打字机、抓取卡片）、`esc` 基础（3）。测试直接从 `index.html` 提取函数体，零新依赖（不引 happy-dom / jsdom）

### Planned (MVP 2.0 · 后续推进)
- 数据导出 / 导入
- Remotion 服务端渲染拆条 / 成片
- 13 平台官方统计 API 接入数据看板
- i18n 多语言
- macOS / Linux 打包

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

### Web 站（2026-09-25 部署期补充 → 2026-09-25 晚补完）
**部署状态**：v0.1.3 首站已上 Vercel（[rokit.vercel.app](https://rokit.vercel.app)）。

**部署期主动保留、后已补完**（原 v0.1.3 占位项状态变更）：
- ~~仓库 URL `github.com/ProClips/Rokit`~~ → **已替换为真实仓库 `github.com/MatuX-ai/Rokit`**：同步更新 `Nav.astro` / `Hero.astro` / `Download.astro` / `Footer.astro` 共 8 处 URL，GitHub Release `v0.1.3` 已创建并发布两个资产（NSIS + Portable）
- 应用截图 `public/screenshots/wflow.svg` + `dashboard.svg` —— v0.1.3 采用 SVG 加 “占位示意 · PLACEHOLDER” 鲜明水印，加底部说明 “v0.1.3 占位示意图（非真实截图）· 计划 v0.1.4 替换”；避免上线后被误以为真实截图
- `public/sitemap.xml` `lastmod=2026-09-25`（同步部署日）
- **Astro 5.x critical XSS/SSRF 漏洞**：当前已知 9 条 critical（GHSA-j687-52p2-xcff 等），静态产物不可远程利用，已接受风险豁免上线，纳入 v0.1.4 升级 Astro 7.x backlog

**2026-09-25 晚补完详情**：
- `npm run dist:win` 构建产物（electron-builder 25.1.8 + electron 36.9.5 + Node 22）：`Rokit-0.1.3-x64.exe` (108 MB) + `Rokit-0.1.3-portable.exe` (108 MB)
- `git tag -a v0.1.3` 已推送到 `origin`
- `gh release create v0.1.3` 已发布，两个二进制均含真实 SHA256：
  - NSIS:     `1800DA600D940A4EB17C1EEB2D38B4CF68A68B518EEBEB457FC92C14F13292C9`
  - Portable: `E40D2FF2F869317AB4E7605CB20047F37571BC8A80979D792FB0D976F67A08A7`
- `Download.astro` 的 nsisSha256 / portableSha256 常量已同步更新为真实值（替换原 v0.1.3 部署期硬编码占位）
- 营销站与真实 GitHub 仓库 / Release 完全打通，下次部署（v0.1.4 增量）即生效

**严格与桌面端版本对齐**：web `Nav.astro` / `Hero.astro` / `Download.astro` 中 `version='0.1.3'` 与本仓 `package.json` 一致，JSON-LD `softwareVersion` 同步。

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
