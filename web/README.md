# Rokit · 首站

Rokit v0.1.0 首发推广静态站。Astro 5.x 静态输出，零运行时 JS。

## 本地预览

```bash
# 进入此目录
cd web

# 安装依赖（首次）
npm install

# 启动开发服务（默认 http://localhost:4321）
npm run dev

# 构建生产产物到 dist/
npm run build

# 本地预览构建产物
npm run preview
```

> 国内网络下若 Electron 二进制下载慢，可设置 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`（仅 desktop 应用需要，本站不涉及）。

## 目录说明

```
web/
├── src/
│   ├── pages/index.astro          ← 唯一首页（组装所有 section）
│   ├── layouts/Layout.astro       ← <html>/<head>，SEO/OG/Twitter meta
│   ├── components/                ← 各 section 组件
│   │   ├── Nav.astro              ← 顶栏 + 锚点 + Star + 下载
│   │   ├── Hero.astro             ← 主视觉 + 火箭 SVG + CTA
│   │   ├── PainPoints.astro       ← 4 个痛点卡片
│   │   ├── Features.astro         ← 6 大功能模块
│   │   ├── Flow.astro             ← 3 步流程
│   │   ├── Platforms.astro        ← 13 平台网格
│   │   ├── Roadmap.astro          ← 1.0 / 1.5 / 2.0 路线图
│   │   ├── Screenshots.astro      ← 应用截图占位
│   │   ├── Download.astro         ← 下载 CTA + 系统要求
│   │   └── Footer.astro           ← 页脚
│   ├── styles/global.css          ← 全局样式（颜色变量 + reset + 字体栈）
│   └── assets/rocket.svg          ← 火箭主视觉（青色 + 粉紫高光）
├── public/
│   └── favicon.svg                ← 浏览器图标
├── astro.config.mjs               ← output: 'static'，site: 待填
└── vercel.json                    ← cleanUrls + trailingSlash
```

## 部署到 Vercel

1. 把 `web/` 推到 GitHub 仓库（或将整个仓库推上去后指定 Root Directory 为 `web/`）
2. Vercel 控制台 → Import Project → 选择仓库
3. Framework Preset 自动识别为 **Astro**
4. Build Command：`npm run build`（默认）
5. Output Directory：`dist`（默认）
6. 点击 Deploy

首次部署完成后：
- 在 Project Settings → Domains 绑定自定义域
- 把 `astro.config.mjs` 中的 `site` 改为最终域名（影响 canonical / og:url）

## 内容编辑

### 修改文案
- 页面文案集中在各 `components/*.astro` 顶部的数组常量（如 `pains`、`features`、`steps`）
- 修改 Hero 标题/副标题：[src/components/Hero.astro](src/components/Hero.astro)
- 修改全局 SEO meta：[src/layouts/Layout.astro](src/layouts/Layout.astro)

### 替换截图占位
当前 `Screenshots.astro` 是骨架占位。替换流程：
1. 启动桌面应用 [ai-launch-master/](../ai-launch-master/)，用截图工具截取主界面
2. 把截图放到 `public/` 目录（如 `public/screenshots/main.png`）
3. 编辑 `src/components/Screenshots.astro`，把 `.shot-frame` 内骨架替换为：
   ```astro
   <img src="/screenshots/main.png" alt="Rokit 主界面" />
   ```

### 替换 OG 分享卡
部署后将 `og-image.png`（1280×640）放到 `public/`，覆盖占位文件。
当前 meta 已声明 `og:image=${siteUrl}/og-image.png`。

## 占位待替换项

| 项 | 当前占位 | 替换位置 |
|---|---|---|
| GitHub 仓库 URL | `https://github.com/ProClips/Rokit` | `Nav.astro`、`Hero.astro`、`Footer.astro`、`Layout.astro` |
| 下载链接 | 同上 `/releases/latest` | `Nav.astro`、`Hero.astro`、`Download.astro` |
| 自定义域 | `https://rokit.vercel.app` | `astro.config.mjs`、`Layout.astro` |
| 应用截图 | 灰色骨架 | `Screenshots.astro` |
| OG 分享卡 | 缺失 | `public/og-image.png` |

全局搜索 `https://github.com/ProClips/Rokit` 即可定位所有需要替换的占位 URL。

## 技术栈

- Astro 5.x（静态输出）
- 纯 Astro 组件（无 React/Vue，无运行时 JS）
- 内联 SVG + CSS 动画
- 中文系统字体栈，无外部字体依赖
- 无外部图片资源（首屏 LCP < 2s）

## 验证清单（上线前）

- [ ] `npm run build` 通过，无 type 错误
- [ ] 桌面 1440 / 1024 / 768 三档宽度无横向滚动
- [ ] 移动端 375 宽度：导航汉堡菜单、火箭降级为顶部装饰
- [ ] 所有锚点跳转平滑
- [ ] 「下载」/「Star」CTA 链接可达
- [ ] Lighthouse（移动端）：Performance / SEO / Best Practices ≥ 95

## 开发约定

- ⚠ **修改 `src/components/Nav.astro` 节点顺序需重新验证汉堡菜单**：依赖 `checkbox#nav-toggle → label.nav-burger → nav.nav-links` 的 CSS 兄弟选择器，调换顺序会导致移动端菜单打不开 / 收不回（详见组件顶部注释）。
