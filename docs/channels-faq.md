# 推广渠道常见问题（FAQ）

> 适用版本：Rokit v0.1.4 及以上
> 配套阅读：[ai-launch-master/PRIVACY.md](../ai-launch-master/PRIVACY.md)、[ai-launch-master/README.md](../ai-launch-master/README.md)

本 FAQ 解答推广渠道相关的常见疑问，重点解释 **本地优先 + BYOK（Bring Your Own Login）** 机制。如果你看完仍有疑问，欢迎在 [GitHub Issues](https://github.com/MatuX-ai/Rokit/issues) 提交（标题前缀 `[channels]`）。

---

## 1. 为什么推广渠道里没有「账号 / 密码」字段？

Rokit 采用 **BYOK（Bring Your Own Login，自带登录态）** 机制：

- 13 个内置平台（GitHub / PH / V2EX / 掘金 / X / Facebook / 抖音 / 小红书 / B站 / 即刻 / 知乎 / 公众号 / YouTube）的发布页与自动填表脚本都**写死在程序里**（见 [electron/publishers.js](../ai-launch-master/electron/publishers.js)）。
- 这些平台需要登录后才能发布。Rokit **不调用平台 API，也不存你的账号密码**——而是在 Rokit 内嵌的「发布浏览器」里完成登录，登录态由 Chromium 加密保存在本机。
- 这种方式既能避免账号泄露，又比直接走 API 更难被平台风控识别。

**对比**：

| 方案 | Rokit 现状（BYOK） | 主流发布工具 | 平台 API 直发 |
|---|---|---|---|
| 是否存账号 | ❌ 不存 | ✅ 加密存储 | ✅ OAuth 授权 |
| 登录态位置 | 本机浏览器分区 | 服务端 / 本机 | 服务端 |
| 风控风险 | 低（真实浏览器上下文） | 中 | 高 |
| 隐私 | 高 | 中 | 低 |

---

## 2. Rokit 怎么帮我发布？登录态存在哪？

1. **首次发射**：Rokit 打开内嵌的 Chromium 浏览器（`persist:pub` 分区，登录态持久化）。
2. **手动登录一次**：你像在自己电脑上一样登录 GitHub / 小红书 / B站 等。
3. **注入脚本**：Rokit 在已登录页面里注入自动填表脚本（`publishers.js` 各平台适配器），把文案填到表单里。
4. **提交**：
   - 全自动平台（GitHub Release / V2EX / X）→ Rokit 自动点击发布按钮
   - 半自动平台（掘金 / 抖音 / 小红书 / B站 / 知乎 / 公众号 / Facebook / YouTube）→ Rokit 填好正文 + 文案，等你**手动确认**上传文件 / 选择分类后再点发布

**登录态保存位置**：`%APPDATA%/Rokit/Partitions/pub/`（与 SQLite 同目录分区，由 Chromium 加密）。

---

## 3. 我能用我的公司 GitHub Enterprise / 自建平台吗？

Rokit 内置的 GitHub 适配器只对接 `github.com`。**自建 GitHub Enterprise** 暂不支持（[electron/publishers.js](../ai-launch-master/electron/publishers.js) 里 `launch()` 写死了 `https://github.com/`）。

其他平台的私有部署（如自建 B站 / 小红书）同理——Rokit 仅对接官方发布页。

**变通方案**：用「自定义渠道」模式，填入自建平台的 API / Webhook URL，Rokit 会以 POST JSON 把文案推给你。

---

## 4. 我能在多台电脑上同步登录态吗？

**不能。** Rokit 是「本地优先」设计：

- 登录态保存在 `Partitions/pub/`（本机浏览器分区）
- 不做云同步、不上传
- 换电脑 = 在新电脑上重新登录每个平台

**好处**：你的账号只属于你一台电脑，降低泄露风险。

**变通方案**：

- 开启 Chromium 同步（Windows 系统层 / Chrome 账号）——但需要自行评估风险
- 用浏览器自带密码管理器 + 开启「自动填充」，Rokit 内嵌浏览器会复用你电脑上的密码库，登录只需一次点击
- 用 Windows 自带的凭据管理器同步

---

## 5. 怎么彻底删除 Rokit 留下的登录信息？

只需要删除 `%APPDATA%/Rokit/` 目录（Windows 默认 `C:\Users\<你>\AppData\Roaming\Rokit\`）。该目录包含：

- `ai-launch-master.db` —— 你的作品 / 文案 / API Key
- `Partitions/pub/` —— 内嵌发布浏览器的登录态（Cookie / LocalStorage，Chromium 加密）
- `logs/` —— 应用日志
- `Cache/` / `GPUCache/` —— 浏览器临时缓存

**快捷方式**：在 Windows 设置 → 应用 → 已安装的应用 → Rokit → 卸载，会一并删除 `%APPDATA%/Rokit/`。

---

## 6. 内置平台万一改了 URL / 表单怎么办？

平台大改版时 Rokit 的自动填表脚本可能失效，状态会显示 `need_login` / `confirm` / `fail`。处理方式：

1. **短期**：在该平台的发射状态条里点「复制 + 打开」，用 Rokit 准备的文案手动完成发布。
2. **长期**：在 [GitHub Issues](https://github.com/MatuX-ai/Rokit/issues) 提交 `bug` 报告，说明平台名、变更时间、复现步骤；维护者会同步更新 [publishers.js](../ai-launch-master/electron/publishers.js) 里的适配器。
3. **MVP 1.5 规划**：接入 L1 直发（本地 OAuth / 平台官方 API），届时部分平台不再依赖浏览器填表。

---

## 7. 自定义渠道的 Webhook / API 安全吗？

自定义渠道是你自己控制的：

- URL / API Key 由你设置，**仅**保存在本机 SQLite
- Rokit 会以 POST JSON 推送 `{test: true, title, body, ts}`（测试连接）或 `{title, body, ts}`（正式发布）
- 如设置了 API Key，会带 `Authorization: Bearer <API Key>` 头
- **不验证**目标服务的合法性——请确认你填的 URL 确实是你自己的服务（企业微信 / 钉钉 / 飞书机器人 / Discord Webhook / 自建 API 等）

**不要把别人的公开 Webhook 填进来**，会泄露你的发布文案给第三方。

---

## 8. 后续会不会上「一键免登录 API 直发」？

**会，但有限度**。MVP 1.5 路线图里有 L1 直发：

- GitHub Release API（用 GitHub Personal Access Token）
- 部分开放 API 的海外平台

**不会**做的：

- 国内平台（公众号 / 知乎 / 小红书 / 抖音 / B站）目前都不开放公开发布 API，L1 直发无门可入
- 你的平台账号密码（即使加密）也不会被 Rokit 收集——继续走 BYOK + 本地浏览器

如果你想要更"无感"的体验，建议**用浏览器自带密码管理器 + 开启「自动填充」**，Rokit 内嵌浏览器会复用你电脑上的密码库，登录只需一次点击。

---

## 反馈与建议

- 文档问题 → GitHub Issue，标题前缀 `[docs]`
- 产品决策（如新增内置平台）→ GitHub Discussion
- 隐私相关疑问 → 直接在 Issue 提出，或在 [PRIVACY.md](../ai-launch-master/PRIVACY.md) 末尾的「联系方式」章节留言