// Rokit · 平台发布适配器单元测试
// 验证所有 13 个平台注入脚本的语法合法性、launch URL 拼接、status 语义
// vitest 全局由 vitest.config.js globals:true 注入
const { adapters, inject } = require('../electron/publishers');

const ALL_PLATFORMS = [
  'github', 'ph', 'v2ex', 'juejin', 'x', 'facebook', 'youtube',
  'douyin', 'xhs', 'bili', 'jike', 'zhihu', 'wechat'
];

describe('publishers · 注册表完整性', () => {
  it('应当覆盖所有 13 个目标平台', () => {
    for (const id of ALL_PLATFORMS) {
      expect(adapters[id]).toBeDefined();
      expect(adapters[id].launch).toBeTypeOf('function');
      expect(adapters[id].fill).toBeTypeOf('function');
      expect(adapters[id].submit).toBeTypeOf('function');
    }
  });

  it('每个平台应声明 auto 标志', () => {
    for (const id of ALL_PLATFORMS) {
      expect(typeof adapters[id].auto).toBe('boolean');
    }
  });
});

describe('publishers · launch URL', () => {
  it('github：应能从 link 中提取 owner/repo 并跳到 releases/new', () => {
    const url = adapters.github.launch({ link: 'https://github.com/foo/bar' });
    expect(url).toBe('https://github.com/foo/bar/releases/new');
  });

  it('github：link 缺失时应返回 null（让 UI 提示用户补填）', () => {
    expect(adapters.github.launch({})).toBeNull();
    expect(adapters.github.launch({ link: 'not-a-url' })).toBeNull();
  });

  it('github：owner/repo 包含特殊字符时也应正确拼接', () => {
    const url = adapters.github.launch({ link: 'https://github.com/user-with-dots/repo.name' });
    expect(url).toBe('https://github.com/user-with-dots/repo.name/releases/new');
  });

  it('github：自动去掉 .git 后缀', () => {
    const url = adapters.github.launch({ link: 'https://github.com/foo/bar.git' });
    expect(url).toBe('https://github.com/foo/bar/releases/new');
  });

  it('静态 URL 平台：launch 应返回正确的发布页', () => {
    expect(adapters.ph.launch()).toMatch(/^https:\/\/www\.producthunt\.com\/posts\/new$/);
    expect(adapters.v2ex.launch()).toMatch(/^https:\/\/www\.v2ex\.com\/new$/);
    expect(adapters.juejin.launch()).toMatch(/^https:\/\/juejin\.cn\/editor\/drafts\/new$/);
    expect(adapters.x.launch()).toMatch(/^https:\/\/x\.com\/compose\/post$/);
  });
});

describe('publishers · 注入脚本语法', () => {
  it.each(ALL_PLATFORMS)('%s fill / submit 必须是合法 JS（new Function 不报错）', (id) => {
    const fillCode = adapters[id].fill({ title: 't', body: 'b', link: 'https://x.com' });
    const submitCode = adapters[id].submit({ title: 't', body: 'b', link: 'https://x.com' });
    expect(() => new Function(fillCode)).not.toThrow();
    expect(() => new Function(submitCode)).not.toThrow();
  });

  it('inject 工具：应正确序列化 payload（含中文/引号/换行）', () => {
    const code = inject(
      'function(p){return {title:p.t,body:p.b};}',
      { t: '标题"含引号"', b: '正文\n多行\n带"引号"' }
    );
    // 关键：执行后能直接拿到反序列化数据（inject 返回的 code 是立即调用的 IIFE）
    const result = new Function('return (' + code + ')')();
    expect(result.title).toBe('标题"含引号"');
    expect(result.body).toBe('正文\n多行\n带"引号"');
  });
});

describe('publishers · 自动 vs 半自动（v0.1.1 修正）', () => {
  // 与 electron/publishers.js 保持一致：auto 反映「点一键后是否需要人工最终确认」
  // v0.1.1 修正：ph / juejin / facebook / youtube 实际在发布前需要人工选分类/受众/上传文件，改 auto:false
  it('auto:true 的真一键平台：github / v2ex / x', () => {
    expect(adapters.github.auto).toBe(true);
    expect(adapters.v2ex.auto).toBe(true);
    expect(adapters.x.auto).toBe(true);
  });

  it('auto:false 需手动点下一步/Submit 的平台：ph / juejin / facebook / youtube', () => {
    expect(adapters.ph.auto).toBe(false);
    expect(adapters.juejin.auto).toBe(false);
    expect(adapters.facebook.auto).toBe(false);
    expect(adapters.youtube.auto).toBe(false);
    // 这 4 个必须有 manualReason 给 UI 展示
    expect(typeof adapters.ph.manualReason).toBe('string');
    expect(typeof adapters.juejin.manualReason).toBe('string');
    expect(typeof adapters.facebook.manualReason).toBe('string');
    expect(typeof adapters.youtube.manualReason).toBe('string');
  });

  it('auto:false 的国内平台：douyin / xhs / bili / jike / zhihu / wechat', () => {
    expect(adapters.douyin.auto).toBe(false);
    expect(adapters.xhs.auto).toBe(false);
    expect(adapters.bili.auto).toBe(false);
    expect(adapters.jike.auto).toBe(false);
    expect(adapters.zhihu.auto).toBe(false);
    expect(adapters.wechat.auto).toBe(false);
  });
});

describe('publishers · YouTube（特殊）', () => {
  it('应返回 need_file 状态（视频需要本地文件）', () => {
    // fill 直接返回对象而不是注入脚本
    const code = adapters.youtube.fill({ title: 't', body: 'b' });
    expect(code).toMatch(/need_file/);
  });
});
