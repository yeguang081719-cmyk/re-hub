// Backend adapters. Each op maps to a real command; results are normalized
// so the router/skill can treat native/Android/Web/dynamic/UI chains uniformly.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { run, clip } from './lib/exec.mjs';
import { loadConfig, PROJECT_ROOT } from './detect.mjs';

const isWin = process.platform === 'win32';

function isBatch(bin) {
  return /\.(bat|cmd)$/i.test(bin || '');
}

/** Spawn a batch file correctly on Windows. */
function runBin(bin, args, opts = {}) {
  if (isWin && isBatch(bin)) return run('cmd.exe', ['/c', bin, ...args], opts);
  return run(bin, args, opts);
}

function parseJsonMaybe(text) {
  if (typeof text !== 'string') return undefined;
  const t = text.trim();
  if (!t || (t[0] !== '{' && t[0] !== '[')) return undefined;
  try { return JSON.parse(t); } catch { return undefined; }
}

function normalize(backend, op, r, extra = {}) {
  const data = parseJsonMaybe(r.stdout);
  return {
    backend,
    op,
    ok: r.ok,
    exitCode: r.code,
    timedOut: r.timedOut,
    truncated: r.truncated,
    ms: r.ms,
    data,
    stdout: data ? undefined : clip(r.stdout, 40000),
    stderr: clip(r.stderr, 20000) || undefined,
    ...extra,
  };
}

function requireTarget(args) {
  const target = args?.path || args?.target;
  if (!target) throw new Error('缺少参数 path/target（目标文件绝对路径）');
  if (!fs.existsSync(target)) throw new Error(`目标不存在: ${target}`);
  return path.resolve(target);
}

/* ------------------------------------------------------------------ */
/* REA CLI                                                             */
/* ------------------------------------------------------------------ */

function reaEnv(cfg) {
  const env = {};
  if (cfg.ghidraDir) env.GHIDRA_INSTALL_DIR = cfg.ghidraDir;
  if (cfg.javaHome) env.JAVA_HOME = cfg.javaHome;
  if (cfg.reaJadxMcpJar && fs.existsSync(cfg.reaJadxMcpJar)) env.REA_JADX_MCP_JAR = cfg.reaJadxMcpJar;
  // Let REA discover the locally downloaded JADX / apktool without global installs.
  const extraPath = [];
  if (cfg.jadxHome) extraPath.push(path.join(cfg.jadxHome, 'bin'));
  if (cfg.toolsDir) extraPath.push(cfg.toolsDir);
  if (extraPath.length) env.PATH = [...extraPath, process.env.PATH || ''].join(path.delimiter);
  return env;
}

function reaArgv(op, args) {
  const t = args?.path || args?.target;
  const fmt = ['--format', 'json'];
  switch (op) {
    case 'capabilities': return ['capabilities', ...fmt];
    case 'doctor': return ['doctor', ...fmt, ...(t ? ['--target', t] : [])];
    case 'analyze': return ['analyze', t, ...fmt, ...(args.provider ? ['--provider', args.provider] : [])];
    case 'inspect': return ['inspect', t, ...fmt];
    case 'decompile': return ['decompile', t, ...(args.procedure ? ['--procedure', args.procedure] : []), ...fmt];
    case 'function': return ['function', t, ...(args.procedure ? ['--procedure', args.procedure] : []), ...fmt];
    case 'inspect-artifact': return ['inspect-artifact', t, ...fmt];
    case 'binary-layout': return ['inspect-binary-layout', t, ...fmt];
    case 'android-package': return ['inspect-android-package', t, ...fmt];
    case 'android-class': return ['inspect-android-class', t, args.className, ...fmt];
    case 'android-method': return ['inspect-android-method', t, args.className, args.methodName, ...(args.overloadIndex != null ? ['--overload-index', String(args.overloadIndex)] : []), ...fmt];
    case 'android-signature': return ['inspect-apk-signature', t, ...fmt];
    case 'decode-resources': return ['decode-android-resources', t, ...(args.locale ? ['--locale', args.locale] : []), ...fmt];
    case 'js-application': return ['analyze-javascript-application', t, ...fmt];
    case 'firmware': return ['extract-firmware', t, args.out, ...fmt];
    case 'firmware-regions': return ['inspect-firmware-regions', t, ...fmt];
    case 'web-bundle': return ['analyze-web-bundle', args.endpoint, args.targetId, ...fmt];
    case 'web-screenshot': return ['capture-web-screenshot', '--endpoint', args.endpoint, '--target-id', args.targetId, ...fmt];
    case 'raw': {
      const argv = args?.args;
      if (!Array.isArray(argv) || argv.length === 0) throw new Error('raw 需要 args 数组，例如 ["analyze","D:/x.exe","--format","json"]');
      return argv;
    }
    default:
      throw new Error(`rea 不支持 op: ${op}（支持 capabilities/doctor/analyze/inspect/decompile/function/inspect-artifact/binary-layout/android-*/decode-resources/js-application/firmware*/web-*/raw）`);
  }
}

const REA_NEEDS_TARGET = new Set([
  'analyze', 'inspect', 'decompile', 'function', 'inspect-artifact', 'binary-layout',
  'android-package', 'android-class', 'android-method', 'android-signature', 'decode-resources',
  'js-application', 'firmware', 'firmware-regions', 'web-bundle', 'web-screenshot',
]);

export async function execRea(args = {}, cfg = loadConfig()) {
  if (!cfg.reaScript || !fs.existsSync(cfg.reaScript)) {
    throw new Error(`REA CLI 不可用：${cfg.reaScript} 不存在`);
  }
  if (REA_NEEDS_TARGET.has(args.op)) {
    requireTarget({ path: args.path || args.target });
  }
  const argv = reaArgv(args.op, args);
  const r = await run(cfg.nodeExe || 'node', [cfg.reaScript, ...argv], {
    timeoutMs: args.timeoutMs || cfg.defaultTimeoutMs,
    env: reaEnv(cfg),
    maxBytes: cfg.maxOutputBytes,
  });
  return normalize('rea', args.op, r, { command: ['rea', ...argv].join(' ') });
}

/* ------------------------------------------------------------------ */
/* JADX                                                               */
/* ------------------------------------------------------------------ */

function jadxBin(cfg) {
  if (cfg.jadxHome) {
    for (const n of ['jadx.bat', 'jadx', 'jadx.cmd']) {
      const p = path.join(cfg.jadxHome, 'bin', n);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

export async function execJadx(args = {}, cfg = loadConfig()) {
  const bin = jadxBin(cfg);
  if (!bin) {
    const err = new Error('JADX 未安装：下载 skylot/jadx release 解压到 re-hub/tools/jadx，并把 jadxHome 写进 config.json');
    err.code = 'backend-unavailable';
    throw err;
  }
  const op = args.op || 'version';
  if (op === 'version') {
    const r = await runBin(bin, ['--version'], { timeoutMs: 30000 });
    return normalize('jadx', op, r);
  }
  const target = requireTarget(args);
  const out = args.out || path.join(cfg.stateDir, 'work', `jadx-${Date.now()}`);
  fs.mkdirSync(out, { recursive: true });
  let argv;
  if (op === 'decompile') {
    argv = ['-d', out, '--no-res', '--no-debug-info', target];
  } else if (op === 'class') {
    if (!args.className) throw new Error('class op 需要 className');
    argv = ['-d', out, '--no-res', '--single-class', args.className, target];
  } else if (op === 'info') {
    argv = ['--version'];
  } else {
    throw new Error(`jadx 不支持 op: ${op}（version/decompile/class/info）`);
  }
  const r = await runBin(bin, argv, {
    timeoutMs: args.timeoutMs || 900000,
    env: cfg.javaHome ? { JAVA_HOME: cfg.javaHome } : {},
    maxBytes: cfg.maxOutputBytes,
  });
  let produced = [];
  if (fs.existsSync(out)) {
    const stack = [out];
    while (stack.length && produced.length < 5000) {
      const cur = stack.pop();
      let entries = [];
      try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
      for (const e of entries) {
        const p = path.join(cur, e.name);
        if (e.isDirectory()) stack.push(p);
        else if (/\.java$/i.test(e.name)) produced.push(path.relative(out, p));
      }
    }
  }
  // JADX exits 1 when some classes fail to decompile but still emits usable sources.
  const partial = !r.ok && /finished with errors/i.test(r.stdout || '') && produced.length > 0;
  return normalize('jadx', op, r, {
    ok: r.ok || partial,
    partialSuccess: partial,
    javaFileCount: produced.length,
    javaFilesSample: produced.slice(0, 40),
    outDir: out,
  });
}

/* ------------------------------------------------------------------ */
/* apktool                                                            */
/* ------------------------------------------------------------------ */

export async function execApktool(args = {}, cfg = loadConfig()) {
  const jar = cfg.apktoolJar && fs.existsSync(cfg.apktoolJar) ? cfg.apktoolJar : null;
  if (!jar) {
    const err = new Error('apktool 未安装：下载 iBotPeaches/Apktool 的 apktool_x.jar 到 re-hub/tools/apktool.jar');
    err.code = 'backend-unavailable';
    throw err;
  }
  const java = cfg.javaHome ? path.join(cfg.javaHome, 'bin', 'java.exe') : 'java';
  const op = args.op || 'version';
  if (op === 'version') {
    const r = await run(java, ['-jar', jar, '--version'], { timeoutMs: 60000 });
    return normalize('apktool', op, r);
  }
  const target = requireTarget(args);
  if (op === 'decode') {
    const out = args.out || path.join(cfg.stateDir, 'work', `apktool-${Date.now()}`);
    fs.mkdirSync(out, { recursive: true });
    const r = await run(java, ['-jar', jar, 'd', '-f', '-o', out, target], {
      timeoutMs: args.timeoutMs || 300000,
      env: cfg.javaHome ? { JAVA_HOME: cfg.javaHome } : {},
      maxBytes: cfg.maxOutputBytes,
    });
    const hasManifest = fs.existsSync(path.join(out, 'AndroidManifest.xml'));
    return normalize('apktool', op, r, { outDir: out, hasManifest });
  }
  throw new Error(`apktool 不支持 op: ${op}（version/decode）`);
}

/* ------------------------------------------------------------------ */
/* Ghidra headless（直连，不依赖 GUI 扩展）                              */
/* ------------------------------------------------------------------ */

export async function execGhidra(args = {}, cfg = loadConfig()) {
  const headless = cfg.ghidraDir ? path.join(cfg.ghidraDir, 'support', 'analyzeHeadless.bat') : null;
  if (!headless || !fs.existsSync(headless)) {
    const err = new Error('Ghidra 未安装：把 Ghidra 12.x 安装目录写入 config.json 的 ghidraDir');
    err.code = 'backend-unavailable';
    throw err;
  }
  const op = args.op || 'functions';
  if (op === 'version') {
    const r = await run('cmd.exe', ['/c', headless], { timeoutMs: 30000, env: cfg.javaHome ? { JAVA_HOME: cfg.javaHome } : {} });
    return normalize('ghidra', op, r);
  }
  const target = requireTarget(args);
  const projectRoot = path.join(cfg.stateDir, 'ghidra');
  fs.mkdirSync(projectRoot, { recursive: true });
  const projName = `rehub_${crypto.createHash('md5').update(target + Date.now()).digest('hex').slice(0, 10)}`;
  const outJson = path.join(projectRoot, `${projName}.json`);
  const scriptDir = path.join(PROJECT_ROOT, 'scripts', 'ghidra');
  const maxDecompile = op === 'decompile' ? String(args.maxDecompile ?? 50) : '0';
  const argv = [
    projectRoot,
    projName,
    '-import', target,
    '-scriptPath', scriptDir,
    '-postScript', 'DumpFunctions.java', outJson, maxDecompile,
    '-deleteProject',
  ];
  const r = await run('cmd.exe', ['/c', headless, ...argv], {
    timeoutMs: args.timeoutMs || 900000,
    env: cfg.javaHome ? { JAVA_HOME: cfg.javaHome } : {},
    maxBytes: cfg.maxOutputBytes,
  });
  let dump = null;
  try { if (fs.existsSync(outJson)) dump = JSON.parse(fs.readFileSync(outJson, 'utf8')); } catch { /* ignore */ }
  try { if (fs.existsSync(outJson)) fs.unlinkSync(outJson); } catch { /* ignore */ }
  const normalized = normalize('ghidra', op, r, {
    project: projName,
    dump: dump ? {
      program: dump.program,
      language: dump.language,
      imageBase: dump.imageBase,
      functionCount: dump.functionCount,
      functions: (dump.functions || []).slice(0, args.maxFunctions ?? 300),
    } : null,
  });
  if (!r.ok && /script|PostScript|ERROR/i.test(r.stderr || '')) {
    normalized.hint = 'Ghidra 脚本执行失败；可改用 rea backend（provider=ghidra）或检查 scripts/ghidra/DumpFunctions.java。';
  }
  return normalized;
}

/* ------------------------------------------------------------------ */
/* adb / frida（动态链）                                                */
/* ------------------------------------------------------------------ */

export async function execAdb(args = {}, cfg = loadConfig()) {
  const adb = cfg.adbExe && fs.existsSync(cfg.adbExe) ? cfg.adbExe : 'adb';
  const op = args.op || 'devices';
  const map = {
    devices: ['devices', '-l'],
    version: ['version'],
    shell: ['shell', ...(args.args || [])],
    pull: ['pull', args.remote, args.local],
    install: ['install', '-r', args.path],
    logcat: ['logcat', '-d', '-t', String(args.count || 200)],
  };
  if (!map[op]) throw new Error(`adb 不支持 op: ${op}（devices/version/shell/pull/install/logcat）`);
  const r = await run(adb, map[op], { timeoutMs: args.timeoutMs || 60000 });
  return normalize('adb', op, r);
}

export async function execFrida(args = {}, cfg = loadConfig()) {
  const frida = cfg.fridaExe || 'frida';
  const op = args.op || 'version';
  const map = {
    version: ['--version'],
    ps: [...(args.device === 'local' ? [] : ['-U']), '-ps'],
    raw: args.args || [],
  };
  if (!map[op]) throw new Error(`frida 不支持 op: ${op}（version/ps/raw）`);
  const r = await run(frida, map[op], { timeoutMs: args.timeoutMs || 60000 });
  return normalize('frida', op, r);
}

/* ------------------------------------------------------------------ */
/* UI Automation (UIA) — window control tree / screenshot              */
/* ------------------------------------------------------------------ */

export async function execUia(args = {}, cfg = loadConfig()) {
  const script = path.join(PROJECT_ROOT, 'scripts', 'uia', 'uia.ps1');
  if (!fs.existsSync(script)) throw new Error(`UIA 脚本缺失: ${script}`);
  const action = args.op || 'tree';
  if (!['tree', 'screenshot', 'find'].includes(action)) throw new Error(`uia 不支持 op: ${action}（tree/screenshot/find）`);
  const argv = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Action', action];
  if (args.process) argv.push('-ProcessName', String(args.process));
  if (args.pid) argv.push('-ProcessId', String(args.pid));
  if (args.title) argv.push('-Title', String(args.title));
  if (args.query) argv.push('-Query', String(args.query));
  if (args.out) {
    const out = path.isAbsolute(args.out) ? args.out : path.join(cfg.stateDir, 'uia', args.out);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    argv.push('-Out', out);
  }
  if (args.maxDepth) argv.push('-MaxDepth', String(args.maxDepth));
  if (args.maxNodes) argv.push('-MaxNodes', String(args.maxNodes));
  const r = await run('powershell', argv, { timeoutMs: args.timeoutMs || 60000, maxBytes: cfg.maxOutputBytes });
  // script prints one JSON object to stdout
  let data;
  try { data = JSON.parse(r.stdout); } catch { data = undefined; }
  return normalize('uia', action, r, { data });
}

/* ------------------------------------------------------------------ */
/* x64dbg / pe-sieve (dynamic analysis)                                */
/* ------------------------------------------------------------------ */

function findByName(root, name) {
  if (!root || !fs.existsSync(root)) return null;
  const stack = [root];
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

export async function execX64dbg(args = {}, cfg = loadConfig()) {
  const exe = (cfg.x64dbgExe && fs.existsSync(cfg.x64dbgExe))
    ? cfg.x64dbgExe
    : findByName(path.join(cfg.toolsDir || path.join(PROJECT_ROOT, 'tools'), 'x64dbg'), 'x64dbg.exe');
  if (!exe) {
    const err = new Error('x64dbg 未安装：node scripts/bootstrap.mjs --only x64dbg --yes，或把 x64dbg.exe 路径写入 config.json 的 x64dbgExe');
    err.code = 'backend-unavailable';
    throw err;
  }
  const op = args.op || 'info';
  if (op === 'info') {
    // 不启动 GUI：只报告路径/大小，避免 -v 在某些版本弹窗阻塞
    const st = fs.statSync(exe);
    return { backend: 'x64dbg', op, ok: true, path: exe, bytes: st.size, note: 'x64dbg 已就绪；launch/attach 会打开 GUI。' };
  }
  if (op === 'launch') {
    const target = requireTarget(args);
    const child = spawn(exe, [target], { detached: true, stdio: 'ignore', windowsHide: false });
    child.unref();
    // 等 2 秒确认进程存活
    await new Promise((r) => setTimeout(r, 2000));
    return {
      backend: 'x64dbg', op, ok: true, pid: child.pid, target,
      note: 'x64dbg 已启动；标准控制请接 x64dbg-mcp-server（MCP），或在本机手动操作后回来记录证据。',
    };
  }
  if (op === 'attach') {
    if (!args.pid) throw new Error('attach 需要 pid');
    const child = spawn(exe, ['-p', String(args.pid)], { detached: true, stdio: 'ignore', windowsHide: false });
    child.unref();
    return { backend: 'x64dbg', op, ok: true, pid: args.pid, note: 'x64dbg 已尝试附加；控制请用 x64dbg-mcp-server。' };
  }
  throw new Error(`x64dbg 不支持 op: ${op}（info/launch/attach）`);
}

let _elevated = null;
/** Windows: is this session elevated (High integrity)? pe-sieve/x64dbg need it for other processes. */
async function isElevated() {
  if (process.platform !== 'win32') return true;
  if (_elevated !== null) return _elevated;
  try {
    const r = await run('net', ['session'], { timeoutMs: 8000 });
    _elevated = r.code === 0;
  } catch {
    _elevated = false;
  }
  return _elevated;
}

export async function execPeSieve(args = {}, cfg = loadConfig()) {
  const exe = (cfg.peSieveExe && fs.existsSync(cfg.peSieveExe))
    ? cfg.peSieveExe
    : findByName(path.join(cfg.toolsDir || path.join(PROJECT_ROOT, 'tools'), 'pe-sieve'), 'pe-sieve.exe');
  if (!exe) {
    const err = new Error('pe-sieve 未安装：node scripts/bootstrap.mjs --only pe-sieve --yes');
    err.code = 'backend-unavailable';
    throw err;
  }
  const op = args.op || 'scan';
  if (!['scan', 'dump'].includes(op)) throw new Error(`pe-sieve 不支持 op: ${op}（scan/dump）`);
  if (!args.pid) throw new Error(`${op} 需要 pid`);

  // pe-sieve 打开目标进程需要 SeDebugPrivilege：Medium 完整性会话会 Access Denied
  if (!(await isElevated())) {
    const err = new Error('pe-sieve 需要管理员权限（High 完整性级别）：当前会话是 Medium，打开进程会 Access Denied。请以管理员身份启动 DSH/终端后重试。');
    err.code = 'needs-elevation';
    throw err;
  }

  const out = args.out || path.join(cfg.stateDir, 'pesieve', `${op}-${args.pid}-${Date.now()}`);
  fs.mkdirSync(out, { recursive: true });
  const argv = ['/pid', String(args.pid), '/dir', out, ...(op === 'dump' ? ['/dmode', '3', '/shellc'] : []), '/json'];
  const r = await run(exe, argv, { timeoutMs: args.timeoutMs || 300000 });
  const data = parseJsonMaybe(r.stdout);
  const res = normalize('pe-sieve', op, r, { outDir: out, data });
  if (/Could not set debug privilege|Access Denied|Could not open the process/i.test(`${r.stdout}\n${r.stderr}`)) {
    res.ok = false;
    res.code = 'needs-elevation';
    res.error = 'pe-sieve 打开目标失败（Access Denied）：需要管理员权限。';
  }
  return res;
}

/* ------------------------------------------------------------------ */
/* Dispatcher                                                          */
/* ------------------------------------------------------------------ */

export async function execBackend(backend, args = {}, cfg = loadConfig()) {
  switch (backend) {
    case 'rea': return execRea(args, cfg);
    case 'jadx': return execJadx(args, cfg);
    case 'apktool': return execApktool(args, cfg);
    case 'ghidra': return execGhidra(args, cfg);
    case 'adb': return execAdb(args, cfg);
    case 'frida': return execFrida(args, cfg);
    case 'uia': return execUia(args, cfg);
    case 'x64dbg': return execX64dbg(args, cfg);
    case 'pe-sieve': return execPeSieve(args, cfg);
    default:
      throw new Error(`未知 backend: ${backend}。可用：rea/jadx/apktool/ghidra/adb/frida/uia/x64dbg/pe-sieve，以及 mcp:<name>（走 rehub_mcp）`);
  }
}
