// Capability registry: upper layers request CAPABILITIES, not backend names.
// The registry maps a capability to an ordered candidate list of (backend, op)
// pairs so a missing primary backend can fall back to an equivalent one.

export const CAPABILITIES = {
  inspect_binary: {
    label: '二进制/程序概览', modes: ['static'], sideEffects: false,
    candidates: [{ backend: 'rea', op: 'analyze' }, { backend: 'rea', op: 'inspect' }, { backend: 'ghidra', op: 'functions' }],
  },
  list_functions: {
    label: '函数清单', modes: ['static'], sideEffects: false,
    candidates: [{ backend: 'ghidra', op: 'functions' }, { backend: 'rea', op: 'function' }],
  },
  decompile_function: {
    label: '函数反编译', modes: ['static'], sideEffects: false,
    candidates: [{ backend: 'rea', op: 'decompile' }, { backend: 'ghidra', op: 'decompile' }],
  },
  static_metrics: {
    label: '静态度量/缓解措施', modes: ['static'], sideEffects: false,
    candidates: [{ backend: 'rea', op: 'binary-layout' }],
  },
  inspect_artifact: {
    label: '安装包/归档清单', modes: ['static'], sideEffects: false,
    candidates: [{ backend: 'rea', op: 'inspect-artifact' }],
  },
  extract_artifact: {
    label: '安全提取归档', modes: ['static'], sideEffects: true,
    candidates: [{ backend: 'rea', op: 'extract-artifact' }, { backend: 'rea', op: 'extract-firmware' }],
  },
  inspect_apk: {
    label: 'APK 包/Manifest 概览', modes: ['static'], sideEffects: false,
    candidates: [{ backend: 'rea', op: 'android-package' }],
  },
  decompile_apk: {
    label: 'APK 反编译', modes: ['static'], sideEffects: false,
    candidates: [{ backend: 'jadx', op: 'decompile' }, { backend: 'apktool', op: 'decode' }, { backend: 'rea', op: 'android-class' }],
  },
  inspect_apk_class: {
    label: 'APK 类结构', modes: ['static'], sideEffects: false,
    candidates: [{ backend: 'rea', op: 'android-class' }],
  },
  inspect_apk_method: {
    label: 'APK 方法反编译', modes: ['static'], sideEffects: false,
    candidates: [{ backend: 'rea', op: 'android-method' }],
  },
  decode_resources: {
    label: '资源/Manifest 解码', modes: ['static'], sideEffects: false,
    candidates: [{ backend: 'apktool', op: 'decode' }, { backend: 'rea', op: 'decode-resources' }],
  },
  inspect_signature: {
    label: 'APK 签名信息', modes: ['static'], sideEffects: false,
    candidates: [{ backend: 'rea', op: 'android-signature' }],
  },
  js_bundle: {
    label: 'Web bundle 静态分析', modes: ['static'], sideEffects: false,
    candidates: [{ backend: 'rea', op: 'web-bundle' }],
  },
  web_screenshot: {
    label: '页面截图', modes: ['static', 'dynamic', 'ui'], sideEffects: false,
    candidates: [{ backend: 'rea', op: 'web-screenshot' }],
  },
  browser_targets: {
    label: '浏览器 target 枚举', modes: ['static', 'dynamic', 'ui'], sideEffects: false,
    candidates: [{ backend: 'rea', op: 'raw' }],
  },
  web_page_inspect: {
    label: '页面 DOM/网络观察', modes: ['dynamic', 'ui'], sideEffects: false,
    candidates: [{ backend: 'rea', op: 'raw' }],
  },
  js_reverse: {
    label: 'JS 断点/hook 子 MCP', modes: ['static'], sideEffects: false,
    candidates: [{ backend: 'js-reverse-mcp', op: 'list_tools' }, { backend: 'js-reverse-mcp', op: 'call' }],
  },
  managed_inspect: {
    label: '.NET 元数据/CIL', modes: ['static'], sideEffects: false,
    candidates: [{ backend: 'rea', op: 'raw' }],
  },
  js_application: {
    label: 'Electron/JS 应用图', modes: ['static'], sideEffects: false,
    candidates: [{ backend: 'rea', op: 'js-application' }],
  },
  firmware_regions: {
    label: '固件区域识别', modes: ['static'], sideEffects: false,
    candidates: [{ backend: 'rea', op: 'firmware-regions' }],
  },
  extract_firmware: {
    label: '固件提取', modes: ['static'], sideEffects: true,
    candidates: [{ backend: 'rea', op: 'firmware' }],
  },
  device_control: {
    label: 'Android 设备只读控制', modes: ['dynamic', 'ui'], sideEffects: false,
    candidates: [{ backend: 'adb', op: 'devices' }, { backend: 'adb', op: 'shell' }, { backend: 'adb', op: 'pull' }],
  },
  android_pull: {
    label: 'Android 拉取文件', modes: ['ui'], sideEffects: false,
    candidates: [{ backend: 'adb', op: 'pull' }],
  },
  frida_runtime: {
    label: 'Frida 运行时采样', modes: ['dynamic'], sideEffects: false,
    candidates: [{ backend: 'frida', op: 'ps' }, { backend: 'frida', op: 'raw' }],
  },
  debugger_probe: {
    label: '调试器自检', modes: ['dynamic'], sideEffects: false,
    candidates: [{ backend: 'x64dbg', op: 'info' }],
  },
  debugger_control: {
    label: '调试器启动/附加', modes: ['dynamic'], sideEffects: true,
    candidates: [{ backend: 'x64dbg', op: 'launch' }, { backend: 'x64dbg', op: 'attach' }],
  },
  memory_scan: {
    label: '内存扫描', modes: ['dynamic'], sideEffects: false,
    candidates: [{ backend: 'pe-sieve', op: 'scan' }],
  },
  memory_dump: {
    label: '内存 dump', modes: ['dynamic'], sideEffects: true,
    candidates: [{ backend: 'pe-sieve', op: 'dump' }],
  },
  ui_tree: {
    label: 'UI 控件树', modes: ['ui'], sideEffects: false,
    candidates: [{ backend: 'uia', op: 'tree' }],
  },
  ui_screenshot: {
    label: '窗口截图', modes: ['ui'], sideEffects: false,
    candidates: [{ backend: 'uia', op: 'screenshot' }],
  },
  ui_find: {
    label: 'UI 控件定位', modes: ['ui'], sideEffects: false,
    candidates: [{ backend: 'uia', op: 'find' }],
  },
  rea_capabilities: {
    label: 'REA 能力自检', modes: ['static', 'dynamic', 'ui'], sideEffects: false,
    candidates: [{ backend: 'rea', op: 'capabilities' }, { backend: 'rea', op: 'doctor' }],
  },
};

const REVERSE = new Map();
for (const [id, cap] of Object.entries(CAPABILITIES)) {
  for (const c of cap.candidates) REVERSE.set(`${c.backend}:${c.op}`, id);
}

/** Capability id for a concrete backend/op pair (falls back to a generic id). */
export function capabilityFor(backend, op) {
  // `raw` passes arbitrary argv; its capability is unknown by construction.
  if (op === 'raw') return 'raw_call';
  return REVERSE.get(`${backend}:${op}`) || 'custom';
}

const SIDE_EFFECTS = new Set([
  'x64dbg:launch', 'x64dbg:attach', 'frida:raw', 'pe-sieve:dump',
  'adb:install', 'rea:firmware', 'rea:extract-artifact', 'rea:extract-firmware',
]);

/** Whether executing this concrete step changes external state (needs explicit confirm). */
export function isSideEffect(backend, op, args = {}) {
  if (SIDE_EFFECTS.has(`${backend}:${op}`)) return true;
  if (backend === 'rea' && op === 'raw') {
    const argv = Array.isArray(args?.args) ? args.args.join(' ') : '';
    return /(^|\s)(extract-artifact|extract-firmware|install-adb-package|push-adb-file)(\s|$)/.test(argv);
  }
  return false;
}

export function backendAvailable(env, name) {
  if (!env) return false;
  if (env.mcp && env.mcp[name]) return !!env.mcp[name].available;
  return !!env.backends?.[name]?.available;
}

/**
 * Enrich one plan step with capability, side-effect flag, availability and a
 * fallback candidate when the primary backend is unavailable.
 */
export function resolveStep(env, step, { allowFallback = true } = {}) {
  const capability = step.capability || capabilityFor(step.backend, step.op);
  const cap = CAPABILITIES[capability] || null;
  const primaryAvailable = backendAvailable(env, step.backend);
  const sideEffects = step.sideEffects != null ? !!step.sideEffects : isSideEffect(step.backend, step.op, step.args);
  let chosen = { backend: step.backend, op: step.op };
  let fallback = null;
  if (!primaryAvailable && allowFallback && cap) {
    for (const c of cap.candidates) {
      if (c.backend === step.backend && c.op === step.op) continue;
      if (backendAvailable(env, c.backend)) {
        fallback = { from: { backend: step.backend, op: step.op }, to: { backend: c.backend, op: c.op }, reason: `首选后端 ${step.backend} 不可用，使用等效能力 ${capability}` };
        chosen = { backend: c.backend, op: c.op };
        break;
      }
    }
  }
  return {
    capability,
    capabilityLabel: cap?.label || null,
    sideEffects,
    availability: {
      ready: primaryAvailable,
      backend: step.backend,
      fallback,
    },
    effective: chosen,
    alternatives: (cap?.candidates || []).filter((c) => !(c.backend === step.backend && c.op === step.op)),
  };
}

/** Catalog of capabilities, optionally annotated with current availability. */
export function capabilityCatalog(env = null) {
  return Object.entries(CAPABILITIES).map(([id, cap]) => ({
    id,
    label: cap.label,
    modes: cap.modes,
    sideEffects: !!cap.sideEffects,
    candidates: cap.candidates.map((c) => ({ backend: c.backend, op: c.op, available: env ? backendAvailable(env, c.backend) : null })),
    available: env ? cap.candidates.some((c) => backendAvailable(env, c.backend)) : null,
  }));
}
