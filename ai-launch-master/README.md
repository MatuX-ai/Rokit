# Rokit · 开源桌面端 MVP

给独立开发者 / 学生开发者的「作品首发发射台」：登记作品 → AI 一键生成全套推广物料 → 引导分平台发布 → 采集反馈 → 生成迭代建议。

**技术形态（PRD v1.4 定稿）：开源软件 · 桌面端应用 · 本地 SQLite · BYOK（用户自带 API Key）**

## 快速开始

```bash
npm install     # 首次安装依赖
npm start       # 启动桌面应用
```

> 需要 Node.js 18+。Electron 二进制通过国内镜像下载（见下方「安装说明」）。

### 首次使用

1. 启动后，点右上角 **⚙** 打开「模型设置（BYOK）」
2. 填写 Base URL / API Key / 模型名（如 DeepSeek：`https://api.deepseek.com/v1` + `deepseek-chat`；本地 Ollama：`http://127.0.0.1:11434/v1` + `llama3`）
3. 点「测试连接」验证，保存
4. 走一遍首秀向导：作品登记 → 诊断 → 录屏 → 拆条 → 计划 → 选平台 → 生成文案（此时会真实调用你的模型）→ 发布队列 → 发射

未配置 Key 时，文案生成自动回退到内置本地引擎，功能仍可完整演示。

## 技术栈

| 层 | 选型 |
|---|---|
| 桌面壳 | Electron 36（内置 Node 22，自带 `node:sqlite`，零原生编译依赖） |
| UI | 单文件 HTML/JS/CSS（`index.html`，交互原型直接演进为产品界面） |
| 本地存储 | SQLite（`node:sqlite`），WAL 模式；作品 / 发布记录 / 设置全部本地 |
| AI 接入 | BYOK：OpenAI 兼容 Chat Completions（Base URL / Key / 模型名可配，Key 只存本机） |
| 平台发布 | L1 本地 OAuth 直发（预留）/ L2 深链 + 剪贴板跳转（当前） |

## 目录结构

```
ai-launch-master/
├── index.html            # 产品界面（首秀向导 / 数据看板 / 我的作品）
├── electron/
│   ├── main.js           # 主进程：窗口 + IPC + 错误兜底
│   ├── preload.js        # 安全桥接（contextBridge → window.api）
│   ├── store.js          # 本地存储层（SQLite + schema 迁移 + JSON 兜底）
│   ├── llm.js            # BYOK LLM 接入（带超时）
│   ├── publishers.js     # 13 个平台发布适配器
│   └── logger.js         # 极简日志（落盘到 userData/logs/）
├── tests/                # vitest 单元测试（store / llm / publishers）
├── build/                # electron-builder 资源（icon.ico 需自备）
├── LICENSE               # MIT 许可
├── CHANGELOG.md          # 版本变更记录
├── PRIVACY.md            # 隐私政策
├── eslint.config.js      # ESLint flat config
├── vitest.config.js      # vitest 配置
└── package.json          # 入口 + 脚本 + electron-builder 配置
```

## 架构要点

- **零账号 / 无云端**：所有数据存本机 SQLite（`%APPDATA%/Rokit/ai-launch-master.db`），不设账号、不做云同步
- **BYOK 接入**：与 DeepSeek Harness 同思路——用户自带 Key，本地直连任意 OpenAI 兼容端点
- **浏览器降级**：直接双击打开 `index.html` 也可用（演示模式，无 window.api，不发起真实请求、不持久化）
- **schema 演进**：数据库迁移走 `PRAGMA user_version` + 版本化迁移列表，后续字段变更可向后兼容

## 开发命令

```bash
npm start              # 启动 Electron 应用（开发态）
npm run lint           # 运行 ESLint 检查
npm run lint:fix       # 自动修复可修 lint 问题
npm test               # 运行 vitest 单元测试（一次性）
npm run test:watch     # vitest 监听模式（开发循环）
npm run format         # Prettier 格式化
```

## 打包发布

```bash
npm run dist           # 按 package.json "build" 段打包（默认 Win nsis + portable）
npm run dist:win       # 仅 Windows nsis + portable
npm run dist:portable  # 仅 Windows portable 单文件
```

产物输出到 `release/` 目录。

> **首次打包注意**：
> - Windows 上需先准备 `build/icon.ico`（多尺寸 PNG 转 ICO，详见 `build/README.md`）
> - electron-builder 会从 GitHub 下载 Electron 二进制（~100MB），国内网络请设置 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`
> - 当前未做代码签名，Win 上首次启动会触发 SmartScreen 拦截（用户点「仍要运行」即可）

## 测试覆盖

`tests/` 下三个测试文件，覆盖核心不变量：

| 文件 | 用例数 | 覆盖 |
|---|---|---|
| `tests/store.test.js` | 15 | settings/works/pubs CRUD、级联删除、JSON 兜底、迁移幂等 |
| `tests/llm.test.js` | 11 | URL 拼接、HTTP 错误映射、AbortController 超时控制 |
| `tests/publishers.test.js` | 24 | 13 平台注入脚本合法性、launch URL、status 语义 |

运行 `npm test` 应当看到 `Tests 50 passed (50)`。

## 平台发布深度（当前实现）

- **L2 跳转**（已实现）：为 10 个平台生成专属文案 → 复制全文 → 「打开平台」走系统浏览器跳转到发布页粘贴
- **L1 直发**（规划中，MVP 1.5）：GitHub Release / 商店 API 通过本地 OAuth 直发
- **L3 RPA**（兜底）：留给自动化能力不足的平台

## 安全 / 隐私

详见 [PRIVACY.md](PRIVACY.md)。要点：
- API Key 仅存本机 SQLite
- 不收集遥测、不上报崩溃
- 录屏 / 麦克风权限每次用户主动触发，未授权不录制
- 第三方资源仅飞书字体（CDN）与 BYOK 模型端点

## 协议

[MIT](LICENSE) · Copyright © 2026 ProClips+

## 安装说明（国内网络）

Electron 二进制默认从 GitHub 下载较慢，建议用镜像：

```bash
# Windows PowerShell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm install
```

## 路线图（详见 docs/Rokit-产品方案.html v1.5）

- MVP 1.0（当前）：桌面壳 + BYOK + 对话向导 + 本地 SQLite + 多平台文案生成 + L2 跳转发布 + 发布队列回填
- MVP 1.5：落地页生成 · L1 直发（本地 OAuth）· 数据看板 · 里程碑报喜 · 录屏成片 · 多作品库 · 数据导出/导入
- MVP 2.0：反馈采集 + AI 分析 · 多画幅多版本渲染 · 开源发布与社区案例库
