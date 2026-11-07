// On-demand tool bootstrap: download the reverse-engineering engines this
// project needs from their official GitHub releases, verify checksums when
// GitHub provides them, extract, and point config.json at the result.
//
// Design goals:
// - only install what is missing (idempotent)
// - no npm dependencies (Node 22+ built-ins only)
// - every download comes from the tool's official GitHub release
// - dry-run by default at the MCP layer; CLI opt-in with --yes

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { PROJECT_ROOT, loadConfig } from './detect.mjs';

const IS_WIN = process.platform === 'win32';

/* ------------------------------------------------------------------ */
/* Manifest (official sources only)                                    */
/* ------------------------------------------------------------------ */

export const TOOLS = {
  jadx: {
    repo: 'skylot/jadx',
    asset: /^jadx-\d+(?:\.\d+)*\.zip$/i,
    kind: 'zip',
    dest: 'jadx',
    config: { jadxHome: 'jadx' },
    check: (root) => firstExisting([path.join(root, 'tools/jadx/bin/jadx.bat'), path.join(root, 'tools/jadx/bin/jadx')]),
    note: 'APK/DEX → Java 反编译（Android 静态链主力）',
  },
  apktool: {
    repo: 'iBotPeaches/Apktool',
    asset: /^apktool_[\d.]+\.jar$/i,
    kind: 'jar',
    dest: 'apktool.jar',
    config: { apktoolJar: 'apktool.jar' },
    check: (root) => {
      const dir = path.join(root, 'tools');
      if (!fs.existsSync(dir)) return null;
      const hit = fs.readdirSync(dir).find((f) => /^apktool.*\.jar$/i.test(f));
      return hit ? path.join(dir, hit) : null;
    },
    requires: ['java'],
    note: 'APK 资源/Manifest 解码',
  },
  'jadx-headless-mcp': {
    repo: '1013503897/jadx-headless-mcp',
    tag: 'v0.7.1', // REA requires 0.7.1 exactly
    asset: /-all\.jar$/i,
    kind: 'repack-jar',
    dest: 'jadx-headless-mcp-0.7.1-clean.jar',
    config: { reaJadxMcpJar: 'jadx-headless-mcp-0.7.1-clean.jar' },
    check: (root) => firstExisting([path.join(root, 'tools/jadx-headless-mcp-0.7.1-clean.jar')]),
    requires: ['java'],
    note: 'REA 的 Android provider 桥（需重打包去掉重复条目）',
  },
  rea: {
    repo: 'morluto/rea',
    kind: 'git+npm',
    dest: 'rea',
    config: { reaScript: 'scripts/rea.mjs' },
    check: (root) => firstExisting([path.join(root, 'tools/rea/scripts/rea.mjs')]),
    note: '统一执行层（原生/.NET/Electron/Web/Android/固件/抓包/进程）',
  },
  ghidra: {
    repo: 'NationalSecurityAgency/ghidra',
    asset: /^ghidra_.*_PUBLIC_.*\.zip$/i,
    kind: 'zip',
    dest: 'ghidra',
    config: { ghidraDir: 'ghidra' },
    check: (root) => firstExisting([path.join(root, 'tools/ghidra/support/analyzeHeadless.bat'), path.join(root, 'tools/ghidra/support/analyzeHeadless')]),
    requires: ['java'],
    note: '原生二进制深分析（约 400MB，含 JDK 依赖）',
  },
  x64dbg: {
    repo: 'x64dbg/x64dbg',
    asset: /snapshot_.*\.zip$/i,
    kind: 'zip',
    dest: 'x64dbg',
    config: { x64dbgExe: 'x64dbg.exe' },
    configFromFile: 'x64dbg.exe',
    check: (root) => {
      const base = path.join(root, 'tools/x64dbg');
      if (!fs.existsSync(base)) return null;
      try {
        const stack = [base];
        while (stack.length) {
          const cur = stack.pop();
          for (const e of fs.readdirSync(cur, { withFileTypes: true })) {
            const p = path.join(cur, e.name);
            if (e.isFile() && e.name.toLowerCase() === 'x64dbg.exe') return p;
            if (e.isDirectory()) stack.push(p);
          }
        }
      } catch { /* ignore */ }
      return null;
    },
    note: 'Windows 用户态调试器（动态分析主力；AI 控制可再接 x64dbg-mcp-server）',
  },
  'pe-sieve': {
    repo: 'hasherezade/pe-sieve',
    asset: /^pe-sieve64\.exe$/i,
    kind: 'exe',
    dest: 'pe-sieve.exe',
    config: { peSieveExe: 'pe-sieve.exe' },
    check: (root) => firstExisting([path.join(root, 'tools/pe-sieve/pe-sieve.exe'), path.join(root, 'tools/pe-sieve.exe')]),
    note: '进程内存扫描/dump（脱壳、内存取证）',
  },
};

const ALIASES = {
  'jadx-headless': 'jadx-headless-mcp',
  bridgemcp: 'jadx-headless-mcp',
};

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function firstExisting(list) {
  for (const p of list) if (p && fs.existsSync(p)) return p;
  return null;
}

/** Depth-first search for a file name under a directory. */
function findFileRecursive(dir, name) {
  if (!fs.existsSync(dir)) return null;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const p = path.join(cur, e.name);
      if (e.isFile() && e.name.toLowerCase() === name.toLowerCase()) return p;
      if (e.isDirectory()) stack.push(p);
    }
  }
  return null;
}

/** If config.json already points at a working copy, don't re-download. */
function configInstalled(id, cfg) {
  switch (id) {
    case 'jadx': {
      if (!cfg.jadxHome) return null;
      return firstExisting([path.join(cfg.jadxHome, 'bin', 'jadx.bat'), path.join(cfg.jadxHome, 'bin', 'jadx')]);
    }
    case 'apktool':
      return cfg.apktoolJar && fs.existsSync(cfg.apktoolJar) ? cfg.apktoolJar : null;
    case 'jadx-headless-mcp':
      return cfg.reaJadxMcpJar && fs.existsSync(cfg.reaJadxMcpJar) ? cfg.reaJadxMcpJar : null;
    case 'rea':
      return cfg.reaScript && fs.existsSync(cfg.reaScript) ? cfg.reaScript : null;
    case 'ghidra': {
      if (!cfg.ghidraDir) return null;
      return firstExisting([path.join(cfg.ghidraDir, 'support', 'analyzeHeadless.bat'), path.join(cfg.ghidraDir, 'support', 'analyzeHeadless')]);
    }
    case 'x64dbg':
      return cfg.x64dbgExe && fs.existsSync(cfg.x64dbgExe) ? cfg.x64dbgExe : null;
    case 'pe-sieve':
      return cfg.peSieveExe && fs.existsSync(cfg.peSieveExe) ? cfg.peSieveExe : null;
    default:
      return null;
  }
}

function logLine(log, level, msg) {
  log(`${level.padEnd(6)} ${msg}`);
}

function token() {
  return process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
}

async function ghJson(apiPath, log) {
  const headers = { 'User-Agent': 'rehub-bootstrap', Accept: 'application/vnd.github+json' };
  const t = token();
  if (t) headers.Authorization = `Bearer ${t}`;
  const res = await fetch(`https://api.github.com${apiPath}`, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub API ${res.status} for ${apiPath}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function resolveAsset(spec, log) {
  const relPath = spec.tag ? `/repos/${spec.repo}/releases/tags/${spec.tag}` : `/repos/${spec.repo}/releases/latest`;
  const release = await ghJson(relPath, log);
  const asset = (release.assets || []).find((a) => spec.asset.test(a.name));
  if (!asset) {
    throw new Error(`no asset matching ${spec.asset} in ${spec.repo}@${release.tag_name}`);
  }
  return {
    version: release.tag_name,
    name: asset.name,
    url: asset.browser_download_url,
    size: asset.size,
    digest: asset.digest || null, // "sha256:<hex>" when GitHub provides it
  };
}

function sha256File(file) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(1024 * 1024);
    for (;;) {
      const n = fs.readSync(fd, buf, 0, buf.length, null);
      if (!n) break;
      hash.update(buf.subarray(0, n));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

async function download(asset, destFile, log) {
  fs.mkdirSync(path.dirname(destFile), { recursive: true });
  const tmp = `${destFile}.part`;
  const res = await fetch(asset.url, { redirect: 'follow', headers: { 'User-Agent': 'rehub-bootstrap' } });
  if (!res.ok || !res.body) throw new Error(`download failed ${res.status} ${asset.url}`);
  const total = Number(res.headers.get('content-length') || asset.size || 0);
  const out = fs.createWriteStream(tmp);
  const hash = crypto.createHash('sha256');
  let got = 0;
  let printed = 0;
  for await (const chunk of res.body) {
    hash.update(chunk);
    got += chunk.length;
    if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
    if (total && got - printed > 5 * 1024 * 1024) {
      printed = got;
      log(`        ${(got / 1048576).toFixed(1)}/${(total / 1048576).toFixed(1)} MB`);
    }
  }
  await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
  const hex = hash.digest('hex');
  if (asset.digest && asset.digest.startsWith('sha256:')) {
    const want = asset.digest.slice('sha256:'.length).toLowerCase();
    if (want !== hex) {
      fs.rmSync(tmp, { force: true });
      throw new Error(`sha256 mismatch for ${asset.name}: got ${hex}, want ${want}`);
    }
    log(`        sha256 ok (${hex.slice(0, 16)}…)`);
  } else {
    log(`        sha256 (unverified, release has no digest): ${hex.slice(0, 16)}…`);
  }
  await fsp.rename(tmp, destFile);
  return { file: destFile, bytes: got, sha256: hex };
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 30 * 60 * 1000, ...opts });
  return { ok: r.status === 0, code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function javaBin(cfg, name) {
  const home = cfg.javaHome;
  if (home) {
    const p = path.join(home, 'bin', IS_WIN ? `${name}.exe` : name);
    if (fs.existsSync(p)) return p;
  }
  return name;
}

function hasJava(cfg) {
  const r = run(javaBin(cfg, 'java'), ['-version']);
  return r.ok;
}

/** Extract a zip using bsdtar (Windows 10+/macOS) with PowerShell fallback. */
function extractZip(zipFile, destDir, log) {
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });
  const tar = run('tar', ['-xf', zipFile, '-C', destDir]);
  if (tar.ok) return;
  if (IS_WIN) {
    const ps = run('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zipFile}' -DestinationPath '${destDir}' -Force`]);
    if (ps.ok) return;
    throw new Error(`zip extract failed: tar ${tar.stderr.slice(0, 200)} | ps ${ps.stderr.slice(0, 200)}`);
  }
  const unzip = run('unzip', ['-o', zipFile, '-d', destDir]);
  if (!unzip.ok) throw new Error(`zip extract failed: ${unzip.stderr.slice(0, 300)}`);
}

/** Repack a fat jar after extraction so duplicate archive entries collapse. */
async function repackJar(jarFile, destJar, cfg, log) {
  const work = `${destJar}.work`;
  extractZip(jarFile, work, log);
  fs.rmSync(destJar, { force: true });
  const jar = javaBin(cfg, 'jar');
  const created = run(jar, ['--create', '--file', destJar, '-C', work, '.']);
  if (!created.ok) {
    // fallback: PowerShell Compress-Archive produces a valid zip jar
    if (IS_WIN) {
      const ps = run('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${path.join(work, '*')}' -DestinationPath '${destJar}' -Force`]);
      if (!ps.ok) throw new Error(`jar repack failed: ${created.stderr.slice(0, 200)} | ${ps.stderr.slice(0, 200)}`);
    } else {
      throw new Error(`jar repack failed: ${created.stderr.slice(0, 300)}`);
    }
  }
  fs.rmSync(work, { recursive: true, force: true });
  log(`        repacked → ${path.basename(destJar)}`);
}

/* ------------------------------------------------------------------ */
/* config.json updates                                                 */
/* ------------------------------------------------------------------ */

function updateConfig(configPath, entries, log) {
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch { /* new file */ }
  for (const [key, abs] of Object.entries(entries)) {
    cfg[key] = abs.replace(/\\/g, '/');
    log(`        config.${key} = ${cfg[key]}`);
  }
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
}

/* ------------------------------------------------------------------ */
/* Per-tool installers                                                 */
/* ------------------------------------------------------------------ */

function resolveInstallRoot(root) {
  return path.join(root, 'tools');
}

async function installOne(id, ctx) {
  const spec = TOOLS[id];
  const { root, log, dryRun, updateConfig: doConfig } = ctx;
  const toolsDir = resolveInstallRoot(root);
  const cfg = ctx.cfg;
  const result = { tool: id, ok: false };

  const existing = spec.check(root) || configInstalled(id, cfg);
  if (existing) {
    result.ok = true;
    result.skipped = 'already-installed';
    result.path = existing;
    logLine(log, 'SKIP', `${id} 已存在：${existing}`);
    // 已装好但 config 没指路时补写，避免“文件在、detect 说没有”
    const key = Object.keys(spec.config || {})[0];
    if (key && (!cfg[key] || !fs.existsSync(cfg[key]))) {
      cfg[key] = existing;
      try {
        fs.writeFileSync(ctx.configPath || path.join(root, 'config.json'), JSON.stringify(cfg, null, 2) + '\n');
        logLine(log, 'CFG', `${id}: config.${key} = ${existing}`);
      } catch { /* ignore */ }
    }
    return result;
  }

  // dependency checks
  for (const dep of spec.requires || []) {
    if (dep === 'java' && !hasJava(cfg)) {
      result.error = '需要 JDK（设置 config.json 的 javaHome 或安装 JDK21）';
      logLine(log, 'FAIL', `${id}: ${result.error}`);
      return result;
    }
  }

  const targetDir = path.join(toolsDir, spec.dest);
  const asset = await resolveAsset(spec, log);
  result.version = asset.version;
  result.asset = asset.name;
  result.sizeMB = Math.round((asset.size / 1048576) * 10) / 10;
  logLine(log, 'GET', `${id} ← ${spec.repo} ${asset.version} / ${asset.name} (${result.sizeMB} MB)`);

  if (dryRun) {
    result.ok = true;
    result.dryRun = true;
    result.wouldWrite = targetDir;
    logLine(log, 'DRY', `${id} 将下载到 ${targetDir}`);
    return result;
  }

  const downloads = path.join(toolsDir, '.downloads');
  const raw = path.join(downloads, asset.name);
  const dl = await download(asset, raw, log);
  result.bytes = dl.bytes;

  const entries = {};
  if (spec.kind === 'zip') {
    extractZip(raw, targetDir, log);
    // Some zips nest one top-level directory (e.g. ghidra_*/). Flatten one level.
    const inner = fs.readdirSync(targetDir);
    if (inner.length === 1 && fs.statSync(path.join(targetDir, inner[0])).isDirectory() && !fs.existsSync(path.join(targetDir, 'bin')) && !fs.existsSync(path.join(targetDir, 'support'))) {
      const nested = path.join(targetDir, inner[0]);
      for (const item of fs.readdirSync(nested)) {
        fs.renameSync(path.join(nested, item), path.join(targetDir, item));
      }
      fs.rmdirSync(nested);
    }
    const key = Object.keys(spec.config)[0];
    if (spec.configFromFile) {
      const found = findFileRecursive(targetDir, spec.configFromFile);
      if (!found) throw new Error(`解压后未找到 ${spec.configFromFile}`);
      entries[key] = found;
    } else {
      entries[key] = targetDir;
    }
  } else if (spec.kind === 'exe') {
    fs.mkdirSync(toolsDir, { recursive: true });
    const dest = path.join(toolsDir, spec.dest);
    fs.rmSync(dest, { force: true });
    fs.copyFileSync(raw, dest);
    entries[Object.keys(spec.config)[0]] = dest;
  } else if (spec.kind === 'jar') {
    fs.mkdirSync(toolsDir, { recursive: true });
    fs.copyFileSync(raw, targetDir);
    entries[Object.keys(spec.config)[0]] = targetDir;
  } else if (spec.kind === 'repack-jar') {
    fs.mkdirSync(toolsDir, { recursive: true });
    await repackJar(raw, targetDir, cfg, log);
    entries[Object.keys(spec.config)[0]] = targetDir;
  } else if (spec.kind === 'git+npm') {
    fs.rmSync(targetDir, { recursive: true, force: true });
    const clone = run('git', ['clone', '--depth', '1', `https://github.com/${spec.repo}.git`, targetDir]);
    if (!clone.ok) throw new Error(`git clone failed: ${clone.stderr.slice(0, 300)}`);
    logLine(log, 'NPM', `${id}: npm install --omit=dev（可能几分钟）`);
    const npm = IS_WIN ? 'npm.cmd' : 'npm';
    const inst = run(npm, ['install', '--omit=dev', '--no-audit', '--no-fund'], { cwd: targetDir });
    if (!inst.ok) throw new Error(`npm install failed: ${inst.stderr.slice(-500)}`);
    entries[Object.keys(spec.config)[0]] = path.join(targetDir, spec.config[Object.keys(spec.config)[0]]);
  }
  fs.rmSync(raw, { force: true });

  if (doConfig) {
    const configPath = ctx.configPath;
    updateConfig(configPath, entries, log);
  }
  result.ok = true;
  result.path = spec.check(root) || Object.values(entries)[0];
  logLine(log, 'OK', `${id} 安装完成 → ${result.path}`);
  return result;
}

/* ------------------------------------------------------------------ */
/* Public entry                                                        */
/* ------------------------------------------------------------------ */

export async function runInstaller({ only = null, dryRun = true, updateConfig: doConfig = true, root = PROJECT_ROOT, configPath = null, cfg = null, log = (m) => process.stderr.write(m + '\n') } = {}) {
  const ctx = {
    root,
    dryRun,
    updateConfig: doConfig,
    configPath: configPath || path.join(root, 'config.json'),
    cfg: cfg || loadConfig(),
    log,
  };
  const ids = only && only.length ? only.map((x) => ALIASES[x] || x) : Object.keys(TOOLS);
  const unknown = ids.filter((x) => !TOOLS[x]);
  if (unknown.length) throw new Error(`未知工具: ${unknown.join(', ')}。可用：${Object.keys(TOOLS).join(', ')}`);

  const results = [];

  // Fresh clone: seed config.json from config.example.json so installs have a
  // base to merge into (config.json is gitignored).
  if (!dryRun && !fs.existsSync(ctx.configPath)) {
    const example = path.join(root, 'config.example.json');
    if (fs.existsSync(example)) {
      fs.mkdirSync(path.dirname(ctx.configPath), { recursive: true });
      fs.copyFileSync(example, ctx.configPath);
      log(`        seeded config.json from config.example.json`);
    }
  }

  for (const id of ids) {
    try {
      results.push(await installOne(id, ctx));
    } catch (err) {
      results.push({ tool: id, ok: false, error: String(err.message || err) });
      logLine(log, 'FAIL', `${id}: ${err.message || err}`);
    }
  }
  return {
    root,
    dryRun,
    installed: results.filter((r) => r.ok && !r.skipped && !r.dryRun).map((r) => r.tool),
    skipped: results.filter((r) => r.skipped).map((r) => r.tool),
    planned: results.filter((r) => r.dryRun).map((r) => r.tool),
    failed: results.filter((r) => !r.ok).map((r) => ({ tool: r.tool, error: r.error })),
    results,
  };
}

export function installedStatus(root = PROJECT_ROOT, cfg = loadConfig()) {
  const out = {};
  for (const [id, spec] of Object.entries(TOOLS)) {
    const p = spec.check(root) || configInstalled(id, cfg);
    out[id] = { installed: !!p, path: p };
  }
  return out;
}
