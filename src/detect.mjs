// Environment detection: which reverse-engineering engines/backends are actually usable here.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { run, which } from './lib/exec.mjs';
import { capabilityCatalog } from './capabilities.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, '..');

let cached = null;
let cachedAt = 0;
const TTL_MS = 30_000;

/** Drop the detection cache (call when config.json changes). */
export function invalidateDetectCache() {
  cached = null;
  cachedAt = 0;
}

export function loadConfig() {
  const file = process.env.REHUB_CONFIG || path.join(PROJECT_ROOT, 'config.json');
  let cfg = {};
  if (fs.existsSync(file)) {
    cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
  } else {
    // Fresh clone: config.json is gitignored. Start empty; backends just show
    // as unavailable until `node scripts/bootstrap.mjs` writes real paths.
    const example = path.join(PROJECT_ROOT, 'config.example.json');
    if (fs.existsSync(example)) {
      try { cfg = JSON.parse(fs.readFileSync(example, 'utf8')); } catch { cfg = {}; }
    }
  }
  // env overrides
  const overrides = {
    reaScript: process.env.REHUB_REA_SCRIPT,
    ghidraDir: process.env.REHUB_GHIDRA_DIR || process.env.GHIDRA_INSTALL_DIR,
    javaHome: process.env.REHUB_JAVA_HOME || process.env.JAVA_HOME,
    chrome: process.env.REHUB_CHROME,
    adbExe: process.env.REHUB_ADB,
    fridaExe: process.env.REHUB_FRIDA,
    jadxHome: process.env.REHUB_JADX_HOME,
    apktoolJar: process.env.REHUB_APKTOOL_JAR,
  };
  for (const [k, v] of Object.entries(overrides)) if (v) cfg[k] = v;
  return cfg;
}

function exists(p) {
  try { return !!p && fs.existsSync(p); } catch { return false; }
}

/** Windows 完整性级别：pe-sieve/x64dbg 打开其它进程需要 High（管理员）。 */
function isElevatedSession() {
  if (process.platform !== 'win32') return true;
  try {
    execFileSync('net', ['session'], { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function findIn(dir, names) {
  if (!exists(dir)) return null;
  for (const n of names) {
    const p = path.join(dir, n);
    if (exists(p)) return p;
  }
  return null;
}

/** Depth-first search for a file name under a directory. */
function findFileRecursive(dir, name) {
  if (!exists(dir)) return null;
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

async function versionOf(cmd, args, opts = {}) {
  const r = await run(cmd, args, { timeoutMs: 12_000, ...opts });
  if (!r.ok && !r.stdout) return null;
  const line = (r.stdout || r.stderr || '').split(/\r?\n/).map((s) => s.trim()).find(Boolean) || null;
  return line;
}

export async function detectEnvironment(cfg = loadConfig(), { refresh = false } = {}) {
  const now = Date.now();
  if (!refresh && cached && now - cachedAt < TTL_MS) {
    return { ...cached, cache: { cached: true, ageMs: now - cachedAt } };
  }

  const backends = {};
  const elevated = isElevatedSession();
  const elevationNote = elevated
    ? null
    : '当前会话未提权（Medium 完整性）：pe-sieve 打开其它进程会 Access Denied（需 SeDebugPrivilege）；x64dbg 只能调试自己启动的进程。以管理员身份启动 DSH/终端即可。';

  // --- REA (CLI, 主执行层) ---
  {
    const bin = cfg.reaScript;
    let available = exists(bin);
    let version = null;
    if (available) version = await versionOf(cfg.nodeExe || 'node', [bin, '--version']);
    backends.rea = {
      available,
      version,
      path: bin,
      role: '原生/.NET/Electron/Web/Android/固件/抓包/进程 的统一执行层（229 工具）',
      install: available ? null : 'git clone https://github.com/morluto/rea 到本地，或 npm i -g rea-agents，然后把 scripts/rea.mjs 路径写进 config.json。',
    };
  }

  // --- Ghidra headless ---
  {
    const dir = cfg.ghidraDir;
    const headless = dir ? path.join(dir, 'support', 'analyzeHeadless.bat') : null;
    const available = exists(headless);
    backends.ghidra = {
      available,
      version: available ? path.basename(dir) : null,
      path: headless,
      role: '原生二进制直连 headless（函数清单/伪代码），也是 REA 的首选 provider',
      install: available ? null : '安装 Ghidra 12.x 并把安装目录写入 config.json 的 ghidraDir（需要 JDK21）。',
    };
  }

  // --- JADX ---
  {
    let bin = null;
    if (cfg.jadxHome) bin = findIn(path.join(cfg.jadxHome, 'bin'), ['jadx.bat', 'jadx']);
    if (!bin) bin = await which('jadx');
    backends.jadx = {
      available: !!bin,
      version: bin ? await versionOf(bin, ['--version']) : null,
      path: bin,
      role: 'APK/DEX 反编译成 Java 源码（Android 静态链主力）',
      install: '下载 skylot/jadx release 解压到 re-hub/tools/jadx，并把 jadxHome 写入 config.json。',
    };
  }

  // --- apktool ---
  {
    let jar = cfg.apktoolJar && exists(cfg.apktoolJar) ? cfg.apktoolJar : null;
    if (!jar) {
      const alt = await which('apktool');
      if (alt) jar = alt;
    }
    const java = cfg.javaHome ? path.join(cfg.javaHome, 'bin', 'java.exe') : 'java';
    backends.apktool = {
      available: !!jar && exists(java),
      version: jar ? await versionOf(java, ['-jar', jar, '--version']) : null,
      path: jar,
      role: 'APK 资源/Manifest 解码（加固与资源混淆场景）',
      install: '下载 iBotPeaches/Apktool 的 apktool_x.jar 存为 re-hub/tools/apktool.jar（需要 JDK）。',
    };
  }

  // --- Chrome (Web/JS 链) ---
  {
    const candidates = [cfg.chrome, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'];
    const chrome = candidates.find((p) => exists(p)) || null;
    backends.chrome = {
      available: !!chrome,
      version: chrome ? 'present' : null,
      path: chrome,
      role: 'CDP 浏览器：Web 逆向、页面观察、脚本抓取',
      install: chrome ? null : '安装 Chrome/Edge，或把可执行文件路径写入 config.json 的 chrome。',
    };
  }

  // --- adb ---
  {
    let adb = cfg.adbExe && exists(cfg.adbExe) ? cfg.adbExe : null;
    if (!adb) adb = await which('adb');
    backends.adb = {
      available: !!adb,
      version: adb ? await versionOf(adb, ['version']) : null,
      path: adb,
      role: 'Android 设备观察/拉取/安装（动态链前置）',
      install: '安装 Android platform-tools，把 adb.exe 路径写入 config.json 的 adbExe。',
    };
  }

  // --- frida ---
  {
    let frida = cfg.fridaExe && exists(cfg.fridaExe) ? cfg.fridaExe : null;
    if (!frida) frida = await which('frida');
    if (!frida) {
      const r = await run('python', ['-m', 'frida', '--version'], { timeoutMs: 12_000 });
      if (r.ok) frida = 'python -m frida';
    }
    backends.frida = {
      available: !!frida,
      version: frida ? await versionOf(frida === 'python -m frida' ? 'python' : frida, frida === 'python -m frida' ? ['-m', 'frida', '--version'] : ['--version']) : null,
      path: frida,
      role: '动态插桩/Hook/脱壳（需要设备与 frida-server）',
      install: 'pip install frida-tools；设备端按 ABI 推送 frida-server。',
    };
  }

  // --- x64dbg（动态调试） ---
  {
    const candidates = [cfg.x64dbgExe, 'C:/Program Files/x64dbg/release/x64dbg.exe', 'D:/Tools/x64dbg/release/x64dbg.exe'];
    let exe = candidates.find((p) => exists(p)) || null;
    if (!exe && exists(path.join(cfg.toolsDir || '', 'x64dbg'))) {
      const found = findFileRecursive(path.join(cfg.toolsDir, 'x64dbg'), 'x64dbg.exe');
      if (found) exe = found;
    }
    backends.x64dbg = {
      available: !!exe,
      version: exe ? 'present' : null,
      path: exe,
      role: 'Windows 用户态调试器（断点/单步/内存/调用栈）；VMProtect 场景配合 ScyllaHide/HyperHide',
      install: 'node scripts/bootstrap.mjs --only x64dbg --yes（GitHub release zip），或手动安装 x64dbg 后写 config.x64dbgExe。',
      note: exe && elevationNote ? elevationNote : null,
    };
  }

  // --- pe-sieve（内存 dump / 注入检测） ---
  {
    let exe = cfg.peSieveExe && exists(cfg.peSieveExe) ? cfg.peSieveExe : null;
    if (!exe && exists(path.join(cfg.toolsDir || '', 'pe-sieve'))) {
      exe = findFileRecursive(path.join(cfg.toolsDir, 'pe-sieve'), 'pe-sieve.exe');
    }
    backends['pe-sieve'] = {
      available: !!exe,
      version: exe ? 'present' : null,
      path: exe,
      role: '进程内存扫描/dump（脱壳后镜像、检测 hook/注入）',
      install: 'node scripts/bootstrap.mjs --only pe-sieve --yes（GitHub release exe）',
      note: exe && elevationNote ? elevationNote : null,
    };
  }

  // --- UIA（UI 逆向：控件树/截图） ---
  {
    const script = path.join(PROJECT_ROOT, 'scripts', 'uia', 'uia.ps1');
    backends.uia = {
      available: process.platform === 'win32' && exists(script),
      version: exists(script) ? 'builtin' : null,
      path: script,
      role: 'UI Automation 控件树导出/窗口截图（UI 逆向与原型参考）',
      install: exists(script) ? null : 'scripts/uia/uia.ps1 缺失（重新拉取仓库即可）',
    };
  }

  // --- .NET ---
  backends.dotnet = {
    available: !!(await which('dotnet')),
    version: await versionOf('dotnet', ['--version']),
    path: 'dotnet',
    role: '.NET 运行时（可选，用于托管程序辅助分析）',
    install: null,
  };

  // --- IDA / Binary Ninja（商业，检测为主） ---
  {
    const idaCandidates = [process.env.IDA_PATH, process.env.IDA_DIR, 'C:/Program Files/IDA Pro 9.0', 'C:/Program Files/IDA Pro 8.4'];
    let ida = null;
    for (const c of idaCandidates) {
      if (!c) continue;
      const p = exists(c) && fs.statSync(c).isDirectory() ? findIn(c, ['ida64.exe', 'ida.exe']) : (exists(c) ? c : null);
      if (p) { ida = p; break; }
    }
    if (!ida) ida = await which('ida64');
    backends.ida = {
      available: !!ida,
      version: ida ? 'present' : null,
      path: ida,
      role: 'IDA Pro 深分析（需商业许可；可注册 mrexodia/ida-pro-mcp 或官方 HexRays ida-mcp 为子 MCP）',
      install: '购买/安装 IDA Pro 9.x，注册 IDA MCP；本项目已克隆 ida-pro-mcp 与 ida-mcp 到 vendor/。',
    };
  }
  {
    const bn = (await which('binaryninja')) || (process.env.BINJA_PATH && exists(process.env.BINJA_PATH) ? process.env.BINJA_PATH : null);
    backends.binja = {
      available: !!bn,
      version: bn ? 'present' : null,
      path: bn,
      role: 'Binary Ninja 深分析（需商业许可；可注册 binary_ninja_mcp）',
      install: '购买/安装 Binary Ninja，注册 vendor/binary_ninja_mcp。',
    };
  }

  // --- 子 MCP 后端 ---
  const mcp = {};
  for (const [name, spec] of Object.entries(cfg.mcpBackends || {})) {
    if (spec.disabled) { mcp[name] = { available: false, disabled: true, description: spec.description }; continue; }
    const entry = spec.args?.[0];
    const entryOk = entry ? exists(entry) : true;
    const cmdOk = spec.command ? !!(await which(spec.command)) : false;
    mcp[name] = {
      available: !!(entryOk && cmdOk),
      command: spec.command,
      entry,
      description: spec.description,
      install: entryOk ? null : `先按 vendor 里的说明安装该子 MCP（入口 ${entry}）。`,
    };
  }

  // --- vendor 仓库 ---
  let vendor = { count: 0, repos: [] };
  if (exists(cfg.vendorDir)) {
    vendor.repos = fs.readdirSync(cfg.vendorDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
    vendor.count = vendor.repos.length;
  }

  const ready = Object.entries(backends).filter(([, b]) => b.available).map(([k]) => k);
  const missing = Object.entries(backends).filter(([, b]) => !b.available).map(([k, b]) => ({ backend: k, install: b.install, role: b.role }));

  // installed / runnable / usable are distinct: "检测到程序" ≠ "能执行任务".
  const REQ = {
    'pe-sieve': { elevation: true, note: '打开其它进程需要管理员（SeDebugPrivilege）' },
    x64dbg: { windows: true, note: 'Medium（未提权）下只能调试自己启动的进程' },
    uia: { windows: true },
    adb: { device: true, note: '需要设备/模拟器（执行时确认）' },
    frida: { device: true, note: '需要设备 + frida-server（执行时确认）' },
  };
  for (const [name, b] of Object.entries(backends)) {
    const req = REQ[name] || {};
    const installed = !!b.available;
    const platformOk = !req.windows || process.platform === 'win32';
    const permissionOk = !req.elevation || elevated;
    const runnable = installed && platformOk;
    const usable = runnable && permissionOk;
    b.requirements = { windows: !!req.windows, elevation: !!req.elevation, device: !!req.device };
    b.status = {
      installed,
      runnable,
      usable,
      reason: !installed ? 'not-installed' : !platformOk ? 'wrong-platform' : !permissionOk ? 'needs-elevation' : req.device ? 'needs-device-at-run' : 'ready',
      note: req.note || null,
    };
  }

  const result = {
    generatedAt: new Date().toISOString(),
    host: { platform: process.platform, arch: process.arch, node: process.version },
    elevation: {
      elevated,
      note: elevated
        ? 'High（管理员）：pe-sieve/x64dbg 可打开其它进程'
        : 'Medium（未提权）：pe-sieve 会 Access Denied；x64dbg 只能调自己启动的进程',
    },
    backends,
    mcp,
    vendor,
    ready,
    missing,
    summary: `可用后端 ${ready.length} 个：${ready.join(', ') || '无'}；缺失 ${missing.length} 个。vendor 已克隆 ${vendor.count} 个仓库。`,
    autoInstall:
      '缺失后端可自动下载（官方 GitHub release，sha256 校验）：rehub_install { only: ["jadx"], dryRun: false }；' +
      '命令行等价：node scripts/bootstrap.mjs --only jadx --yes；只看状态：node scripts/bootstrap.mjs --check',
  };
  result.cache = { cached: false, ageMs: 0 };
  result.capabilities = capabilityCatalog(result);
  result.registry = {
    schemaVersion: '2.0',
    capabilityCount: result.capabilities.length,
    updatedAt: result.generatedAt,
    note: '上层按 capability 请求能力；后端只是候选实现。usable=false 时不应承诺可执行。',
  };
  cached = result;
  cachedAt = now;
  return result;
}

/** Annotate a scenario's requires/optional against the detected environment. */
export function annotateScenario(env, scenario) {
  const check = (name) => {
    if (name === 'rea') return env.backends.rea.available;
    if (name === 'ghidra') return env.backends.ghidra.available;
    if (name === 'jadx') return env.backends.jadx.available;
    if (name === 'apktool') return env.backends.apktool.available;
    if (name === 'chrome') return env.backends.chrome.available;
    if (name === 'adb') return env.backends.adb.available;
    if (name === 'frida') return env.backends.frida.available;
    if (env.mcp[name]) return env.mcp[name].available;
    return !!env.backends[name]?.available;
  };
  return {
    requiresReady: (scenario.requires || []).map((r) => ({ backend: r, ready: check(r) })),
    optionalReady: (scenario.optional || []).map((r) => ({ backend: r, ready: check(r) })),
  };
}
