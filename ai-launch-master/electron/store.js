// Rokit · 本地存储层（SQLite 优先，JSON 文件兜底）
// 设计目标：本地优先、无云端。作品 / 发布记录 / 设置全部存在本地。
// 驱动优先级：better-sqlite3（若已安装）→ Node 内置 node:sqlite（Electron 36+）→ JSON 文件

const fs = require('fs');
const path = require('path');

// 当前 schema 版本号。修改表结构时需追加新迁移，勿直接修改旧迁移。
const CURRENT_VERSION = 1;

let Database = null;
let driver = null;
try {
  Database = require('better-sqlite3');
  driver = 'better-sqlite3';
} catch (_e) {
  try {
    const { DatabaseSync } = require('node:sqlite');
    Database = DatabaseSync;
    driver = 'node-sqlite';
  } catch (_e2) {
    Database = null;
    driver = null;
  }
}

// ---------- 迁移列表（按版本号顺序）----------
// 每个迁移函数接收 db 实例（提供 run / get / all / exec 驱动无关接口）
//   migrateV1：初始表结构
const migrations = [
  {
    version: 1,
    up: function (db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          base_url TEXT, api_key TEXT, model TEXT, updated_at TEXT
        );
        CREATE TABLE IF NOT EXISTS works (
          id TEXT PRIMARY KEY, name TEXT, type TEXT, intro TEXT, url TEXT,
          status TEXT, queue TEXT, star INTEGER DEFAULT 0, dl INTEGER DEFAULT 0,
          play TEXT DEFAULT '0', next TEXT, created_at TEXT, updated_at TEXT
        );
        CREATE TABLE IF NOT EXISTS pubs (
          id INTEGER PRIMARY KEY AUTOINCREMENT, work_id TEXT, platform TEXT,
          title TEXT, body TEXT, tags TEXT, time TEXT, created_at TEXT
        );
      `);
    }
  }
  // 后续 schema 变更在此追加：
  // { version: 2, up: function(db) { db.exec('ALTER TABLE works ADD COLUMN ...'); } }
];

class Store {
  constructor(file) {
    this.file = file;
    if (driver) {
      this.mode = 'sqlite';
      this.driver = driver;
      this.db = new Database(file);
      try { this.db.exec('PRAGMA journal_mode = WAL;'); } catch (_e) {}
      this.migrate();
    } else {
      this.mode = 'json';
      this.jsonFile = path.join(path.dirname(file), 'ai-launch-master-data.json');
      this.data = this.loadJson();
      this.version = CURRENT_VERSION; // JSON 兜底模式下视为最新
    }
  }

  // ---------- 驱动无关的执行封装 ----------
  run(sql, args) {
    args = args || [];
    if (this.driver === 'better-sqlite3') return this.db.prepare(sql).run(...args);
    const st = this.db.prepare(sql);
    try { return st.run(...args); } finally { try { st.finalize(); } catch (_e) {} }
  }
  get(sql, args) {
    args = args || [];
    if (this.driver === 'better-sqlite3') return this.db.prepare(sql).get(...args);
    const st = this.db.prepare(sql);
    try { return st.get(...args); } finally { try { st.finalize(); } catch (_e) {} }
  }
  all(sql, args) {
    args = args || [];
    if (this.driver === 'better-sqlite3') return this.db.prepare(sql).all(...args);
    const st = this.db.prepare(sql);
    try { return st.all(...args); } finally { try { st.finalize(); } catch (_e) {} }
  }
  exec(sql) {
    // 两个驱动都提供 .exec()，无需分支
    return this.db.exec(sql);
  }

  // ---------- SQLite 迁移 ----------
  migrate() {
    // 读取当前 schema 版本（PRAGMA user_version）
    let currentVersion = 0;
    try {
      const row = this.get('PRAGMA user_version');
      currentVersion = row && typeof row.user_version === 'number' ? row.user_version : 0;
    } catch (_e) {
      currentVersion = 0;
    }
    this.version = currentVersion;

    // 已是最新版本则跳过
    if (currentVersion >= CURRENT_VERSION) return;

    // 按顺序应用所有 pending 迁移
    for (const m of migrations) {
      if (m.version <= currentVersion) continue;
      if (m.version > CURRENT_VERSION) {
        console.error('[store] migration version ' + m.version + ' exceeds CURRENT_VERSION ' + CURRENT_VERSION + ', skipping');
        continue;
      }
      try {
        // better-sqlite3 显式事务；node:sqlite DatabaseSync.exec 本身在事务中
        if (this.driver === 'better-sqlite3') {
          this.db.exec('BEGIN');
        }
        m.up(this);
        if (this.driver === 'better-sqlite3') {
          this.db.exec('COMMIT');
        }
        // 设置 user_version（标准 SQLite 迁移习惯）
        this.run('PRAGMA user_version = ' + m.version);
        this.version = m.version;
      } catch (e) {
        try {
          if (this.driver === 'better-sqlite3') {
            this.db.exec('ROLLBACK');
          }
        } catch (_e2) {}
        throw new Error('migration v' + m.version + ' failed: ' + (e && e.message ? e.message : String(e)));
      }
    }
  }

  // ---------- JSON 兜底 ----------
  loadJson() {
    const empty = { settings: null, works: [], pubs: [] };
    try {
      if (fs.existsSync(this.jsonFile)) {
        return Object.assign(empty, JSON.parse(fs.readFileSync(this.jsonFile, 'utf8')));
      }
    } catch (_e) {}
    return empty;
  }
  saveJson() {
    try { fs.writeFileSync(this.jsonFile, JSON.stringify(this.data, null, 2)); } catch (_e) {}
  }

  // ---------- 设置（BYOK） ----------
  getSettings() {
    const def = { base_url: 'https://api.deepseek.com/v1', api_key: '', model: 'deepseek-chat', updated_at: '' };
    if (this.mode === 'sqlite') {
      const row = this.get('SELECT * FROM settings WHERE id = 1');
      return row ? { base_url: row.base_url, api_key: row.api_key, model: row.model, updated_at: row.updated_at } : def;
    }
    return this.data.settings || def;
  }
  saveSettings(s) {
    const row = {
      base_url: (s && s.base_url) || 'https://api.deepseek.com/v1',
      api_key: (s && s.api_key) || '',
      model: (s && s.model) || 'deepseek-chat',
      updated_at: new Date().toISOString()
    };
    if (this.mode === 'sqlite') {
      this.run(`
        INSERT INTO settings (id, base_url, api_key, model, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          base_url = excluded.base_url, api_key = excluded.api_key,
          model = excluded.model, updated_at = excluded.updated_at
      `, [1, row.base_url, row.api_key, row.model, row.updated_at]);
    } else {
      this.data.settings = row;
      this.saveJson();
    }
    return this.getSettings();
  }

  // ---------- 作品 ----------
  listWorks() {
    if (this.mode === 'sqlite') {
      return this.all('SELECT * FROM works ORDER BY created_at ASC');
    }
    return this.data.works;
  }
  saveWork(w) {
    if (!w || !w.id) return w;
    const row = {
      id: w.id, name: w.name || '', type: w.type || '', intro: w.intro || '',
      url: w.url || '', status: w.status || 'draft', queue: w.queue || '0',
      star: Number(w.star) || 0, dl: Number(w.dl) || 0,
      play: String(w.play || '0'), next: w.next || '',
      created_at: w.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    if (this.mode === 'sqlite') {
      this.run(`
        INSERT INTO works (id, name, type, intro, url, status, queue, star, dl, play, next, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name=excluded.name, type=excluded.type, intro=excluded.intro, url=excluded.url,
          status=excluded.status, queue=excluded.queue, star=excluded.star, dl=excluded.dl,
          play=excluded.play, next=excluded.next, updated_at=excluded.updated_at
      `, [row.id, row.name, row.type, row.intro, row.url, row.status, row.queue, row.star, row.dl, row.play, row.next, row.created_at, row.updated_at]);
    } else {
      const i = this.data.works.findIndex(x => x.id === row.id);
      if (i >= 0) this.data.works[i] = row; else this.data.works.push(row);
      this.saveJson();
    }
    return row;
  }
  deleteWork(id) {
    if (this.mode === 'sqlite') {
      this.run('DELETE FROM works WHERE id = ?', [id]);
      this.run('DELETE FROM pubs WHERE work_id = ?', [id]);
    } else {
      this.data.works = this.data.works.filter(w => w.id !== id);
      this.data.pubs = this.data.pubs.filter(p => p.work_id !== id);
      this.saveJson();
    }
    return true;
  }

  // ---------- 发布记录 ----------
  listPubs() {
    if (this.mode === 'sqlite') {
      return this.all('SELECT * FROM pubs ORDER BY created_at DESC');
    }
    return this.data.pubs;
  }
  addPub(r) {
    const row = {
      work_id: (r && r.work_id) || '', platform: (r && r.platform) || '',
      title: (r && r.title) || '', body: (r && r.body) || '',
      tags: (r && r.tags) || '', time: (r && r.time) || '',
      created_at: new Date().toISOString()
    };
    if (this.mode === 'sqlite') {
      this.run(
        'INSERT INTO pubs (work_id, platform, title, body, tags, time, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [row.work_id, row.platform, row.title, row.body, row.tags, row.time, row.created_at]
      );
    } else {
      this.data.pubs.push(row);
      this.saveJson();
    }
    return row;
  }
}

module.exports = { Store, CURRENT_VERSION, migrations };
