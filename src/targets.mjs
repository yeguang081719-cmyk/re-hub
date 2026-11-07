// Target-object taxonomy: classify WHAT is being reversed, then assign the
// static / dynamic / UI chains for that object.
//
// Orthogonal to scenarios.mjs:
//   scenarios.mjs  -> "what task shape is this" (native / apk / web / ...)
//   targets.mjs    -> "what object is it" + "which modes apply"
//
// The four top classes follow the service menu:
//   网站逆向 / App逆向 / 软件逆向 / AI 自动化逆向
// Each class (or subtype) declares three mode chains: static / dynamic / ui.

import { extOf, resolveArgs } from './scenarios.mjs';

export const MODE_ORDER = ['static', 'dynamic', 'ui'];

export const MODE_META = {
  static: { label: '静态链路', short: '静态' },
  dynamic: { label: '动态链路', short: '动态' },
  ui: { label: 'UI 链路', short: 'UI/UX' },
};

/** Boundary-aware term match: latin terms match whole tokens ("ai" ≠ "said"). */
function hit(text, term) {
  const t = String(term || '').toLowerCase().trim();
  if (!t) return false;
  if (/[\u4e00-\u9fff]/.test(t)) return text.includes(t);
  const esc = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    return new RegExp(`(?:^|[^a-z0-9])${esc}(?:[^a-z0-9]|$)`).test(text);
  } catch {
    return text.includes(t);
  }
}

const st = (backend, op, args, why) => ({ backend, op, args, why });

/* ------------------------------------------------------------------ */
/* Chain definitions                                                    */
/* ------------------------------------------------------------------ */

const WEB_CHAINS = {
  static: {
    label: '静态链路：前端源码 / 脚本 / bundle',
    chapter: '04-web-js',
    scenario: 'web-js',
    require: ['chrome'],
    optional: ['js-reverse-mcp', 'rea'],
    steps: [
      st('rea', 'raw', { args: ['list-browser-targets', '--endpoint', '{{cdpEndpoint}}', '--format', 'json'] }, '列出调试端口上的页面 target；没有端口就先以 --remote-debugging-port=9222 打开页面。'),
      st('rea', 'web-bundle', { endpoint: '{{cdpEndpoint}}', targetId: '{{targetId}}' }, '抓取页面脚本做静态分析：源码映射、路由、接口候选。'),
      st('js-reverse-mcp', 'list_tools', {}, '列出 JS 逆向子 MCP 的搜索/断点/hook 工具。'),
      st('js-reverse-mcp', 'call', { tool: '{{tool}}', args: {} }, '按需调用：搜索脚本 → 断点/hook → 回溯 XHR/fetch 调用栈。'),
    ],
    notes: ['签名/加密参数优先按 XHR/fetch 调用栈回溯，走第 04 章。', '只有 URL 时先拿到脚本 bundle，再定位生成参数的函数。'],
  },
  dynamic: {
    label: '动态链路：页面被动观察 / 网络',
    chapter: '05-web-runtime',
    scenario: 'web-runtime',
    require: ['chrome'],
    optional: ['rea'],
    steps: [
      st('rea', 'raw', { args: ['list-browser-targets', '--endpoint', '{{cdpEndpoint}}', '--format', 'json'] }, '枚举可观察页面。'),
      st('rea', 'raw', { args: ['inspect-web-page', '--endpoint', '{{cdpEndpoint}}', '--target-id', '{{targetId}}', '--format', 'json'] }, '被动抓 DOM/脚本/网络/storage，不改页面。'),
      st('rea', 'web-screenshot', { endpoint: '{{cdpEndpoint}}', targetId: '{{targetId}}' }, '留存可视证据。'),
    ],
    notes: ['被动观察不注入；要抓包时用浏览器 DevTools 导出 HAR，再走第 09 章。'],
  },
  ui: {
    label: 'UI 链路：DOM/CSS 结构 → clean-room 原型',
    chapter: '15-ui',
    scenario: 'ui-reverse',
    require: ['chrome'],
    optional: ['rea'],
    steps: [
      st('rea', 'raw', { args: ['list-browser-targets', '--endpoint', '{{cdpEndpoint}}', '--format', 'json'] }, '找到页面 target。'),
      st('rea', 'raw', { args: ['inspect-web-page', '--endpoint', '{{cdpEndpoint}}', '--target-id', '{{targetId}}', '--format', 'json'] }, '拿 DOM 结构、样式资源、脚本清单。'),
      st('rea', 'web-screenshot', { endpoint: '{{cdpEndpoint}}', targetId: '{{targetId}}' }, '截图作为布局参考。'),
    ],
    notes: ['按第 15 章分级：A 有 CSS/JS 资源 / B 内联脚本+原生桥 / C 只能截图重画。', 'clean-room：结构可参考，专有 CSS/字体/图片不要拷进交付物。'],
  },
};

const ANDROID_CHAINS = {
  static: {
    label: '静态链路：APK/DEX 反编译',
    chapter: '02-android-static',
    scenario: 'android-apk',
    require: ['rea', 'jadx', 'apktool'],
    optional: ['adb', 'frida'],
    steps: [
      st('rea', 'android-package', { path: '{{target}}' }, 'Manifest/包名/SDK/权限/组件概览。'),
      st('jadx', 'decompile', { path: '{{target}}', out: '{{workdir}}/jadx-out' }, '整包反编译成 Java 源码，供类/方法检索。'),
      st('rea', 'android-class', { path: '{{target}}', className: '{{className}}' }, '精确类成员清单；再取单方法。'),
      st('apktool', 'decode', { path: '{{target}}', out: '{{workdir}}/apktool-out' }, '解资源与 Manifest 原文（加固/资源混淆）。'),
    ],
    notes: ['SO 深挖时转第 01 章 native 链。'],
  },
  dynamic: {
    label: '动态链路：adb + Frida 插桩',
    chapter: '03-android-dynamic',
    scenario: 'android-dynamic',
    require: ['adb', 'frida'],
    optional: ['rea'],
    steps: [
      st('adb', 'devices', {}, '确认设备/模拟器在线。'),
      st('adb', 'shell', { args: ['getprop', 'ro.product.cpu.abi'] }, '确认 ABI 以选择 frida-server 版本。'),
      st('frida', 'ps', { device: '{{device}}' }, '列出进程，确定 attach 目标。'),
      st('frida', 'raw', { args: ['-U', '-f', '{{package}}', '-l', '{{hookScript}}'] }, '用 raw 传真实 frida 参数加载 hook 脚本（backend 只封装 version/ps/raw）。'),
    ],
    notes: ['需要真机/模拟器 + frida-server；无 root 时仅可调试 debuggable 包。'],
  },
  ui: {
    label: 'UI 链路：adb 截图 + uiautomator 控件树',
    chapter: '15-ui',
    scenario: 'ui-reverse',
    require: ['adb'],
    optional: [],
    steps: [
      st('adb', 'shell', { args: ['screencap', '-p', '/sdcard/rehub-ui.png'] }, '设备端截图。'),
      st('adb', 'pull', { remote: '/sdcard/rehub-ui.png', local: '{{workdir}}/android-ui.png' }, '拉回截图作为布局参考。'),
      st('adb', 'shell', { args: ['uiautomator', 'dump', '/sdcard/rehub-ui.xml'] }, '导出 Android 控件树。'),
      st('adb', 'pull', { remote: '/sdcard/rehub-ui.xml', local: '{{workdir}}/android-ui.xml' }, '拉回控件树 XML（bounds 为像素坐标）。'),
    ],
    notes: ['Android 控件树用 uiautomator dump，不是 Windows UIA；高 DPI 坐标按第 15 章换算。', '原型坚持 clean-room。'],
  },
};

const IOS_CHAINS = {
  static: {
    label: '静态链路：IPA 解包 + Mach-O',
    chapter: '10-artifact',
    scenario: 'artifact-inventory',
    require: ['rea'],
    optional: ['ghidra'],
    steps: [
      st('rea', 'raw', { args: ['inspect-artifact', '{{target}}', '--format', 'json'] }, 'IPA 成员清单、bundle/plist、完整性观察。'),
      st('rea', 'raw', { args: ['extract-artifact', '{{target}}', '--output-directory', '{{workdir}}/ipa-out', '--format', 'json'] }, '安全提取 Payload/*.app。'),
      st('ghidra', 'functions', { path: '{{binary}}' }, '对 Mach-O 主二进制跑函数清单，再走第 01 章深挖。'),
    ],
    notes: ['Swift 符号可先用第 01 章的符号/字符串线索定位。'],
  },
  dynamic: {
    label: '动态链路：Frida（需越狱/可注入设备）',
    chapter: '14-dynamic',
    scenario: 'dynamic-analysis',
    require: ['frida'],
    optional: [],
    steps: [
      st('frida', 'ps', { device: '{{device}}' }, '列出设备进程。'),
      st('frida', 'raw', { args: ['-U', '-f', '{{bundleId}}', '-l', '{{hookScript}}'] }, '加载 hook 脚本采样参数/返回值。'),
    ],
    notes: ['iOS 需要越狱设备 + frida-server；本网关无 iOS 专用后端，属受限链路，不保证可用。'],
    limitations: ['需要越狱/已注入设备；普通设备不可用。'],
  },
  ui: {
    label: 'UI 链路：Xcode 辅助功能/截图（受限）',
    chapter: '15-ui',
    scenario: 'ui-reverse',
    require: ['rea'],
    optional: [],
    steps: [],
    notes: ['iOS UI 需 Xcode Accessibility Inspector / simctl screenshot 人工采集；本网关没有 iOS UI 后端。', '拿到的截图与层级按第 15 章 C 级（截图重画）处理。'],
    limitations: ['无 iOS UI 自动化后端；仅能人工配合。'],
  },
};

const MINIPROGRAM_CHAINS = {
  static: {
    label: '静态链路：小程序包解包 + JS 分析',
    chapter: '10-artifact',
    scenario: 'artifact-inventory',
    require: ['rea'],
    optional: ['js-reverse-mcp'],
    steps: [
      st('rea', 'raw', { args: ['inspect-artifact', '{{target}}', '--format', 'json'] }, 'wxapkg 包结构/文件清单/哈希。'),
      st('rea', 'raw', { args: ['analyze', '{{extractedJs}}', '--format', 'json'] }, '对解包后的 app-service.js 做静态概览（需先用社区脚本解 wxapkg）。'),
      st('js-reverse-mcp', 'call', { tool: '{{tool}}', args: {} }, '搜索签名/加密逻辑并回溯调用栈。'),
    ],
    notes: ['wxapkg 解包不在网关内：先解出 app-service.js / page-frame.js，再按 JS bundle 分析。'],
  },
  dynamic: {
    label: '动态链路：微信开发者工具 CDP',
    chapter: '05-web-runtime',
    scenario: 'web-runtime',
    require: ['chrome'],
    optional: ['rea'],
    steps: [
      st('rea', 'raw', { args: ['list-browser-targets', '--endpoint', '{{cdpEndpoint}}', '--format', 'json'] }, '开发者工具开启调试端口后列出页面 target。'),
      st('rea', 'raw', { args: ['inspect-web-page', '--endpoint', '{{cdpEndpoint}}', '--target-id', '{{targetId}}', '--format', 'json'] }, '拿页面 DOM/脚本/请求。'),
      st('rea', 'web-screenshot', { endpoint: '{{cdpEndpoint}}', targetId: '{{targetId}}' }, '截图留证。'),
    ],
    notes: ['需要小程序开发者工具并开启 --remote-debugging-port；真机调试同样走 DevTools 协议。'],
  },
  ui: {
    label: 'UI 链路：WXML/WXSS 结构 → clean-room 原型',
    chapter: '15-ui',
    scenario: 'ui-reverse',
    require: ['chrome'],
    optional: ['rea'],
    steps: [
      st('rea', 'raw', { args: ['list-browser-targets', '--endpoint', '{{cdpEndpoint}}', '--format', 'json'] }, '找到小程序页面 target。'),
      st('rea', 'raw', { args: ['inspect-web-page', '--endpoint', '{{cdpEndpoint}}', '--target-id', '{{targetId}}', '--format', 'json'] }, '拿 DOM/WXSS 结构。'),
      st('rea', 'web-screenshot', { endpoint: '{{cdpEndpoint}}', targetId: '{{targetId}}' }, '截图作为布局参考。'),
    ],
    notes: ['按第 15 章分级；clean-room，不拷贝专有样式与图片。'],
  },
};

const WIN_CHAINS = {
  static: {
    label: '静态链路：原生二进制反编译',
    chapter: '01-native-binary',
    scenario: 'native-binary',
    require: ['rea', 'ghidra'],
    optional: ['ida', 'binja'],
    steps: [
      st('rea', 'analyze', { path: '{{target}}' }, '整体概览（格式/架构/符号/依赖）。'),
      st('rea', 'decompile', { path: '{{target}}', procedure: '{{procedure}}' }, '按函数名/地址取伪代码与汇编。'),
      st('ghidra', 'functions', { path: '{{target}}' }, 'headless Ghidra 函数清单做交叉验证。'),
    ],
    notes: ['先看导出/符号再定点，别整包硬读。'],
  },
  dynamic: {
    label: '动态链路：x64dbg + pe-sieve',
    chapter: '14-dynamic',
    scenario: 'dynamic-analysis',
    require: ['x64dbg', 'pe-sieve'],
    optional: ['frida', 'rea'],
    steps: [
      st('x64dbg', 'info', {}, '确认调试器可用（不启动 GUI）。'),
      st('x64dbg', 'launch', { path: '{{target}}' }, '启动目标；断点/单步在调试器里做。'),
      st('frida', 'ps', { device: 'local' }, '列出本机进程，确定 attach 目标。'),
      st('pe-sieve', 'scan', { pid: '{{pid}}' }, '扫描 hook/注入/可疑模块。'),
      st('pe-sieve', 'dump', { pid: '{{pid}}' }, 'dump 内存镜像用于脱壳与静态回填。'),
    ],
    notes: ['Medium（未提权）会话：pe-sieve 会 Access Denied；以管理员启动 DSH。', 'x64dbg 在 Medium 下只能调试自己启动的进程。', '需要 AI 直接控制断点可接 x64dbg-mcp-server。'],
  },
  ui: {
    label: 'UI 链路：UIA 控件树 + 截图',
    chapter: '15-ui',
    scenario: 'ui-reverse',
    require: ['uia'],
    optional: ['chrome', 'rea'],
    steps: [
      st('uia', 'tree', { process: '{{process}}' }, '导出控件树（名称/类型/AutomationId/类名/坐标）。'),
      st('uia', 'screenshot', { process: '{{process}}', out: '{{workdir}}/ui.png' }, '窗口截图作为布局参考。'),
      st('uia', 'find', { process: '{{process}}', query: '{{query}}' }, '按名称定位具体控件。'),
      st('rea', 'raw', { args: ['list-browser-targets', '--endpoint', '{{cdpEndpoint}}', '--format', 'json'] }, '若界面是 CEF/Electron，用 CDP 拿 DOM/样式（可高保真）。'),
    ],
    notes: ['Qt 自绘控件 UIA 树很浅 → 截图重画（第 15 章 C 级）。', 'clean-room：不拷贝专有 CSS/字体/图片。'],
  },
};

const DOTNET_CHAINS = {
  static: {
    label: '静态链路：.NET 元数据/CIL',
    chapter: '07-dotnet',
    scenario: 'dotnet-managed',
    require: ['rea'],
    optional: [],
    steps: [
      st('rea', 'raw', { args: ['inspect-managed-artifact', '{{target}}', '--format', 'json'] }, '程序集身份/模块/引用/资源。'),
      st('rea', 'raw', { args: ['inspect-managed-members', '{{target}}', '--format', 'json'] }, '类型/方法/签名/调用边。'),
      st('rea', 'raw', { args: ['inspect-managed-native-boundaries', '{{target}}', '--format', 'json'] }, 'P/Invoke 与原生边界。'),
    ],
    notes: ['静态不执行；需要反编译到 C# 可配合 ILSpy/dnSpy（非网关后端）。'],
  },
  dynamic: {
    label: '动态链路：进程/内存侧证据',
    chapter: '14-dynamic',
    scenario: 'dynamic-analysis',
    require: ['x64dbg', 'pe-sieve'],
    optional: ['rea'],
    steps: [
      st('x64dbg', 'info', {}, '确认调试器可用。'),
      st('x64dbg', 'launch', { path: '{{target}}' }, '启动目标进程。'),
      st('pe-sieve', 'dump', { pid: '{{pid}}' }, 'dump 进程镜像，观察 JIT 后代码/加载模块。'),
    ],
    notes: ['托管方法级调试用 dnSpy/ILSpy 人工配合；本网关提供进程/内存侧证据。'],
  },
  ui: {
    label: 'UI 链路：UIA 控件树（WinForms/WPF）',
    chapter: '15-ui',
    scenario: 'ui-reverse',
    require: ['uia'],
    optional: ['chrome'],
    steps: [
      st('uia', 'tree', { process: '{{process}}' }, 'WinForms/WPF 一般有完整 UIA 树。'),
      st('uia', 'screenshot', { process: '{{process}}', out: '{{workdir}}/ui.png' }, '截图留证。'),
      st('uia', 'find', { process: '{{process}}', query: '{{query}}' }, '定位具体控件。'),
    ],
    notes: ['Avalonia/Qt 自绘控件可能偏浅，按截图重画处理。'],
  },
};

const ELECTRON_CHAINS = {
  static: {
    label: '静态链路：ASAR/应用图',
    chapter: '06-electron',
    scenario: 'electron-desktop',
    require: ['rea'],
    optional: [],
    steps: [
      st('rea', 'js-application', { path: '{{target}}' }, '重建 JS/Electron 应用图（模块/import/IPC/原生插件）。'),
      st('rea', 'raw', { args: ['trace-application-feature', '--help'] }, '了解 feature trace 用法后按种子追踪。'),
      st('rea', 'raw', { args: ['list-electron-targets', '--endpoint', '{{cdpEndpoint}}', '--format', 'json'] }, '若有调试端口，观察运行中页面。'),
    ],
    notes: ['主进程逻辑可转第 01/14 章；渲染进程走 CDP。'],
  },
  dynamic: {
    label: '动态链路：CDP + 进程调试',
    chapter: '05-web-runtime',
    scenario: 'web-runtime',
    require: ['chrome'],
    optional: ['rea', 'x64dbg'],
    steps: [
      st('rea', 'raw', { args: ['list-browser-targets', '--endpoint', '{{cdpEndpoint}}', '--format', 'json'] }, '枚举渲染进程页面。'),
      st('rea', 'raw', { args: ['inspect-web-page', '--endpoint', '{{cdpEndpoint}}', '--target-id', '{{targetId}}', '--format', 'json'] }, '拿 DOM/脚本/网络。'),
      st('rea', 'web-screenshot', { endpoint: '{{cdpEndpoint}}', targetId: '{{targetId}}' }, '截图留证。'),
    ],
    notes: ['Electron 需 --remote-debugging-port 或 inspect 参数；主进程可用 x64dbg attach（第 14 章）。'],
  },
  ui: {
    label: 'UI 链路：渲染进程 DOM（高保真）',
    chapter: '15-ui',
    scenario: 'ui-reverse',
    require: ['chrome'],
    optional: ['uia', 'rea'],
    steps: [
      st('rea', 'raw', { args: ['list-browser-targets', '--endpoint', '{{cdpEndpoint}}', '--format', 'json'] }, '找到渲染页面。'),
      st('rea', 'raw', { args: ['inspect-web-page', '--endpoint', '{{cdpEndpoint}}', '--target-id', '{{targetId}}', '--format', 'json'] }, '拿 DOM/CSS/资源，按第 15 章 A/B 级评估。'),
      st('uia', 'tree', { process: '{{process}}' }, '兜底：CEF 窗口的 UIA 树（通常很浅）。'),
    ],
    notes: ['渲染进程是 Web → 可高保真；clean-room 不拷贝资产。'],
  },
};

const DESKTOP_OTHER_CHAINS = {
  static: {
    label: '静态链路：Mach-O/ELF',
    chapter: '01-native-binary',
    scenario: 'native-binary',
    require: ['rea'],
    optional: ['ghidra'],
    steps: [
      st('rea', 'raw', { args: ['inspect-artifact', '{{target}}', '--format', 'json'] }, '包/二进制清单与格式识别。'),
      st('ghidra', 'functions', { path: '{{target}}' }, '函数清单；深挖按第 01 章。'),
    ],
    notes: ['macOS .app/.dmg 先解包；.dmg 在 Linux 上不可挂载时用只读提取。'],
  },
  dynamic: {
    label: '动态链路：受限（需目标系统 lldb/gdb）',
    chapter: '14-dynamic',
    scenario: 'dynamic-analysis',
    require: [],
    optional: ['rea'],
    steps: [],
    notes: ['本网关未接 lldb/gdb；动态分析需在目标系统本地执行并用 rea capture-process 采证。'],
    limitations: ['无 macOS/Linux 调试器后端。'],
  },
  ui: {
    label: 'UI 链路：受限（系统截图/辅助功能）',
    chapter: '15-ui',
    scenario: 'ui-reverse',
    require: [],
    optional: [],
    steps: [],
    notes: ['非 Windows 平台 UIA 不可用；用系统截图与辅助功能 API 人工采集。'],
    limitations: ['无 macOS/Linux UI 后端。'],
  },
};

const FIRMWARE_CHAINS = {
  static: {
    label: '静态链路：固件区域识别 + 提取',
    chapter: '08-firmware',
    scenario: 'firmware',
    require: ['rea'],
    optional: ['binwalk', 'unblob'],
    steps: [
      st('rea', 'raw', { args: ['inspect-firmware-regions', '{{target}}', '--format', 'json'] }, '识别固件区域与置信度。'),
      st('rea', 'firmware', { path: '{{target}}', out: '{{workdir}}/firmware-out' }, '提取文件系统与子文件。'),
      st('rea', 'analyze', { path: '{{workdir}}/firmware-out/{{extractedBinary}}' }, '把提取到的 ELF 交给 native 链。'),
    ],
    notes: ['提取需要 Linux 上的 binwalk/unblob；Windows 上可先做只读区域识别。'],
  },
  dynamic: {
    label: '动态链路：需设备/仿真（不在网关内）',
    chapter: '14-dynamic',
    scenario: 'dynamic-analysis',
    require: [],
    optional: [],
    steps: [],
    notes: ['固件没有可直接调试的进程；动态分析需真实设备或 QEMU 仿真，属外部链路。'],
    limitations: ['无固件运行时后端。'],
  },
  ui: {
    label: 'UI 链路：不适用',
    chapter: '15-ui',
    scenario: 'ui-reverse',
    require: [],
    optional: [],
    steps: [],
    notes: ['固件镜像本身没有 UI；需要设备启动后按对应平台采集。'],
    limitations: ['不适用。'],
  },
};

const AI_CHAINS = {
  static: {
    label: '静态自动化：MCP 批量分析',
    chapter: '01-native-binary',
    scenario: 'native-binary',
    require: ['rea', 'ghidra'],
    optional: [],
    steps: [
      st('rea', 'analyze', { path: '{{target}}' }, '批量概览。'),
      st('rea', 'decompile', { path: '{{target}}', procedure: '{{procedure}}' }, '按函数批量取伪代码。'),
      st('ghidra', 'functions', { path: '{{target}}' }, '函数清单做交叉验证。'),
      st('rea', 'raw', { args: ['inspect-binary-layout', '{{target}}', '--format', 'json'] }, '静态度量：段/符号/缓解措施。'),
    ],
    notes: ['编排：rehub_detect → rehub_route → rehub_plan → rehub_exec → rehub_evidence，全流程可复现。'],
  },
  dynamic: {
    label: '动态自动化：调试器/内存 dump',
    chapter: '14-dynamic',
    scenario: 'dynamic-analysis',
    require: ['x64dbg', 'pe-sieve'],
    optional: ['frida', 'rea'],
    steps: [
      st('x64dbg', 'info', {}, '确认调试器。'),
      st('x64dbg', 'launch', { path: '{{target}}' }, '启动目标。'),
      st('pe-sieve', 'scan', { pid: '{{pid}}' }, '自动扫描 hook/注入。'),
      st('pe-sieve', 'dump', { pid: '{{pid}}' }, '自动 dump 内存镜像。'),
    ],
    notes: ['AI 直接控制断点可接 x64dbg-mcp-server；Medium 会话需管理员跑 pe-sieve。', '批量动态任务用 rehub_plan + rehub_exec 循环，每步写 rehub_evidence。'],
  },
  ui: {
    label: 'UI 自动化：控件树/截图采集',
    chapter: '15-ui',
    scenario: 'ui-reverse',
    require: ['uia'],
    optional: ['chrome', 'rea'],
    steps: [
      st('uia', 'tree', { process: '{{process}}' }, '批量导出控件树。'),
      st('uia', 'screenshot', { process: '{{process}}', out: '{{workdir}}/ui.png' }, '批量截图。'),
      st('uia', 'find', { process: '{{process}}', query: '{{query}}' }, '按名称批量定位控件。'),
      st('rea', 'raw', { args: ['list-browser-targets', '--endpoint', '{{cdpEndpoint}}', '--format', 'json'] }, 'CEF 页面改走 CDP。'),
    ],
    notes: ['适合批量界面盘点；原型坚持 clean-room。'],
  },
};

/* ------------------------------------------------------------------ */
/* Object classes                                                       */
/* ------------------------------------------------------------------ */

export const OBJECT_TYPES = [
  {
    id: 'web',
    label: '网站逆向',
    desc: '前端源码、接口 API、网页功能复现',
    detect: {
      url: true,
      exts: ['.js', '.html', '.htm', '.mjs', '.har', '.pcap', '.pcapng', '.saz', '.css'],
      phrases: ['网站逆向', '网页逆向', '前端逆向', '网页功能复现', '接口 api', '网站分析', '网页分析', '登录参数', '参数加密', '接口加密', 'sign 参数', '反爬', '前端源码'],
      keywords: ['js', 'javascript', 'sign', 'cookie', 'token', 'xhr', 'fetch', '浏览器', '域名', '接口', '抓包', 'har', 'devtools', 'webpack', '混淆', '反爬', '滑块', '验证码', 'dom', 'css', 'h5', 'api'],
    },
    subtypes: [
      { id: 'web-sign', label: '签名 / 加密参数', phrases: ['sign 参数', '签名算法', '加密参数', '参数加密', '加密算法', 'token 生成'], keywords: ['sign', '签名', '加密', '解密', 'hook', '断点'] },
      { id: 'web-frontend', label: '前端源码 / 功能复现', phrases: ['前端源码', '源码还原', '功能复现', '页面复刻', '网站还原', '网页还原'], keywords: ['源码', '还原', '复刻'] },
      { id: 'web-api', label: '接口 API', phrases: ['接口 api', 'api 接口', '接口分析', '接口采集'], keywords: ['接口', 'api', '请求', '响应'] },
    ],
    chains: WEB_CHAINS,
  },
  {
    id: 'app',
    label: 'App 逆向',
    desc: 'Android APK、iOS、微信小程序',
    detect: {
      exts: ['.apk', '.aab', '.xapk', '.apks', '.ipa', '.wxapkg', '.so'],
      phrases: ['app 逆向', 'app逆向', '移动端逆向', '安卓逆向', 'android 逆向', 'ios 逆向', '逆向 app', '小程序逆向', '微信小程序'],
      keywords: ['apk', 'android', '安卓', 'ios', 'ipa', '小程序', 'wxapkg', 'dex', 'smali', 'frida', 'adb', 'jadx', 'apktool', 'so 文件', 'so文件', '移动端'],
    },
    chains: ANDROID_CHAINS,
    subtypes: [
      { id: 'android', label: 'Android（APK/AAB/SO）', exts: ['.apk', '.aab', '.xapk', '.apks', '.so'], phrases: ['安卓逆向', 'android 逆向', 'apk 逆向', 'apk逆向', '反编译 apk', '反编译apk'], keywords: ['apk', 'android', '安卓', 'dex', 'smali', 'jadx', 'apktool', 'frida', 'adb'], chains: ANDROID_CHAINS },
      { id: 'ios', label: 'iOS（IPA/App）', exts: ['.ipa'], phrases: ['ios 逆向', 'ios逆向', 'ipa 分析', '苹果逆向'], keywords: ['ios', 'ipa', 'mach-o', 'swift', 'objc', 'xcode'], chains: IOS_CHAINS },
      { id: 'miniprogram', label: '微信小程序（wxapkg）', exts: ['.wxapkg'], phrases: ['小程序逆向', '微信小程序', 'wxapkg', '小程序分析'], keywords: ['wxapkg', '小程序', 'wxml', 'wxss', 'appservice', '微信'], chains: MINIPROGRAM_CHAINS },
    ],
  },
  {
    id: 'software',
    label: '软件逆向',
    desc: 'Windows EXE、DLL、桌面程序',
    detect: {
      exts: ['.exe', '.dll', '.sys', '.ocx', '.cpl', '.msi', '.msix', '.appx', '.asar', '.elf', '.bin', '.img', '.rom', '.jar', '.dmg', '.pkg', '.app', '.dylib'],
      phrases: ['软件逆向', '桌面程序', '桌面应用', 'windows 程序', 'windows程序', '客户端逆向', '反编译软件', '软件分析', 'exe 逆向', 'dll 逆向'],
      keywords: ['exe', 'dll', 'sys', 'windows', '桌面', '桌面程序', '客户端', '软件', '程序', '原生', '反编译', '反汇编', '加壳', '脱壳', 'vmprotect', 'vmp', '驱动', 'driver', '安装包', 'asar'],
    },
    chains: WIN_CHAINS,
    subtypes: [
      { id: 'windows-native', label: 'Windows 原生程序（EXE/DLL/驱动）', exts: ['.exe', '.dll', '.sys', '.ocx', '.cpl', '.msi'], phrases: ['windows 程序', 'windows程序', 'exe 逆向', 'dll 逆向', '原生程序'], keywords: ['exe', 'dll', 'sys', 'windows', '原生', '驱动', 'driver'], chains: WIN_CHAINS },
      { id: 'dotnet', label: '.NET 托管程序集', exts: ['.dll', '.exe'], phrases: ['.net 逆向', 'c# 逆向', '托管代码', 'il 代码', 'dnspy', 'ilspy'], keywords: ['dotnet', '.net', 'c#', 'csharp', 'il', 'cil', 'managed', '托管', '程序集', 'dnspy', 'ilspy', 'unity'], chains: DOTNET_CHAINS },
      { id: 'electron', label: 'Electron / 桌面 JS', exts: ['.asar'], phrases: ['electron', 'asar', '桌面 js', '客户端逆向'], keywords: ['electron', 'asar', 'preload', 'ipc', 'renderer', 'nw.js', 'tauri'], chains: ELECTRON_CHAINS },
      { id: 'desktop-other', label: 'macOS/Linux 桌面程序', exts: ['.dmg', '.pkg', '.app', '.elf', '.dylib'], phrases: ['macos 程序', 'linux 程序', 'mac 应用', 'dmg 分析'], keywords: ['macos', 'mac', 'linux', 'dmg', 'pkg', 'elf', 'mach-o'], chains: DESKTOP_OTHER_CHAINS },
      { id: 'firmware', label: '固件 / 嵌入式镜像', exts: ['.bin', '.img', '.rom', '.trx', '.chk'], phrases: ['固件', 'firmware', '路由器固件', '提取固件', '文件系统提取'], keywords: ['固件', 'firmware', 'rom', 'squashfs', 'uboot', 'iot', '嵌入式', '路由器', '摄像头'], chains: FIRMWARE_CHAINS },
    ],
  },
  {
    id: 'ai-automation',
    label: 'AI 自动化逆向',
    desc: 'MCP、Agent、AI 反编译 —— 把逆向流程自动化',
    detect: {
      exts: [],
      phrases: ['ai 逆向', 'ai逆向', 'ai 辅助逆向', 'ai 反编译', 'ai反编译', '自动化逆向', 'mcp 逆向', 'mcp 自动化', 'agent 逆向', '全自动逆向', '批量逆向', '用 mcp', 'mcp 工具链'],
      keywords: ['mcp', 'agent', 'ai', 'llm', '大模型', '自动化', '批量', 'workflow', 'pipeline', '全自动', '编排', '网关', 'rehub'],
    },
    chains: AI_CHAINS,
    subtypes: [
      { id: 'mcp-pipeline', label: 'MCP 工具链', phrases: ['mcp 逆向', 'mcp 自动化', '用 mcp', 'mcp 工具链'], keywords: ['mcp', '网关', 'rehub'], chains: AI_CHAINS },
      { id: 'agent-loop', label: 'Agent 自动编排', phrases: ['agent 逆向', '全自动逆向', '自动化逆向', '批量逆向'], keywords: ['agent', '自动化', '批量', 'workflow', 'pipeline', '编排'], chains: AI_CHAINS },
      { id: 'ai-decompile', label: 'AI 反编译/辅助', phrases: ['ai 反编译', 'ai反编译', 'ai 逆向', 'ai逆向', 'ai 辅助逆向'], keywords: ['ai', 'llm', '大模型'], chains: AI_CHAINS },
    ],
  },
];

const UNKNOWN_TYPE = {
  id: 'unknown',
  label: '未识别对象',
  desc: '信息不足：先确认对象形态，再分配链路。',
  chains: {},
};

function typeById(id) {
  return OBJECT_TYPES.find((t) => t.id === id) || null;
}

function subtypeOf(type, id) {
  if (!type || !id) return null;
  return (type.subtypes || []).find((s) => s.id === id) || null;
}

function chainsOf(type, subtypeId) {
  if (!type) return {};
  const sub = subtypeOf(type, subtypeId);
  return (sub && sub.chains) || type.chains || {};
}

function scoreOne(entry, text, ext, isUrl, weights = {}) {
  const phraseW = weights.phrase ?? 4;
  const kwW = weights.keyword ?? 2;
  const extW = weights.ext ?? 10;
  let score = 0;
  const reasons = [];
  const d = entry.detect || entry || {};
  for (const p of d.phrases || []) {
    if (hit(text, p)) { score += phraseW; reasons.push(`phrase:${p}`); }
  }
  for (const k of d.keywords || []) {
    if (hit(text, k)) { score += kwW; reasons.push(`kw:${k}`); }
  }
  if (ext && (d.exts || []).includes(ext)) { score += extW; reasons.push(`ext:${ext}`); }
  if (isUrl && d.url) { score += extW; reasons.push('url'); }
  return { score, reasons };
}

function isUrlTarget(target) {
  return !!target && (/^https?:\/\//i.test(String(target).trim()) || /^www\./i.test(String(target).trim()));
}

/**
 * Classify the object being reversed into web / app / software / ai-automation,
 * then pick a subtype (android/ios/miniprogram, dotnet/electron/..., etc.).
 * @param {{task?:string,target?:string,hints?:string[]}} input
 */
export function classifyTarget({ task = '', target = '', hints = [] } = {}) {
  const text = `${task} ${target} ${(hints || []).join(' ')}`.toLowerCase();
  const ext = extOf(target);
  const isUrl = isUrlTarget(target);

  const scored = OBJECT_TYPES.map((t) => {
    let { score, reasons } = scoreOne(t, text, ext, isUrl);
    // AI-automation is an intent about HOW to work: an explicit mention is a strong
    // signal, but the real artifact is still reported via `underlying`.
    if (t.id === 'ai-automation' && score >= 6) { score += 6; reasons.push('intent:automation'); }
    return { type: t, score, reasons };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0];
  const second = scored[1];
  const weak = !best || best.score === 0;
  const ambiguous = !weak && !!second && best.score - second.score <= 2 && best.score < 9;
  const confidence = weak ? 'low' : best.score >= 9 ? 'high' : best.score >= 5 ? 'medium' : 'low';

  const type = weak ? UNKNOWN_TYPE : best.type;
  let subtype = null;
  if (!weak && type.subtypes?.length) {
    const subs = type.subtypes
      .map((s) => ({ sub: s, ...scoreOne(s, text, ext, isUrl, { ext: 12 }) }))
      .sort((a, b) => b.score - a.score);
    if (subs[0] && subs[0].score > 0) subtype = subs[0].sub;
  }

  const clarify = [];
  if (weak) {
    clarify.push('要逆向的对象是哪一类：网站/网页、App（Android/iOS/微信小程序）、软件（Windows EXE/DLL/桌面程序），还是想用 AI/MCP 自动化整个流程？');
    clarify.push('给出目标文件路径或 URL（例如 app.apk / demo.exe / https://…），路由会立刻明确。');
  } else if (confidence === 'low' || ambiguous) {
    clarify.push(`最接近的是「${type.label}」${second && second.score > 0 ? `与「${second.type.label}」` : ''}；目标是哪一类？（建议给出 target 路径/URL）`);
  }

  // AI-automation is orthogonal to the real artifact: also classify the underlying object.
  let underlying = null;
  if (type.id === 'ai-automation') {
    const under = OBJECT_TYPES
      .filter((t) => t.id !== 'ai-automation')
      .map((t) => ({ type: t, ...scoreOne(t, text, ext, isUrl) }))
      .sort((a, b) => b.score - a.score)[0];
    if (under && under.score > 0) {
      let sub = null;
      if (under.type.subtypes?.length) {
        const s = under.type.subtypes
          .map((x) => ({ sub: x, ...scoreOne(x, text, ext, isUrl, { ext: 12 }) }))
          .sort((a, b) => b.score - a.score)[0];
        if (s && s.score > 0) sub = s.sub;
      }
      underlying = { objectType: under.type.id, label: under.type.label, subtype: sub ? { id: sub.id, label: sub.label } : null, score: under.score };
    }
  }

  const modes = weak ? [] : summarizeModes(type.id, subtype?.id);

  return {
    objectType: type.id,
    label: type.label,
    desc: type.desc,
    confidence,
    score: weak ? 0 : best.score,
    reasons: weak ? [] : best.reasons,
    subtype: subtype ? { id: subtype.id, label: subtype.label } : null,
    underlying,
    alternativeTypes: scored
      .slice(1, 4)
      .filter((x) => x.score > 0)
      .map((x) => ({ objectType: x.type.id, label: x.type.label, score: x.score })),
    clarify,
    modes,
  };
}

/** Summary of the three mode chains for an object (type + optional subtype). */
export function summarizeModes(objectType, subtypeId) {
  const type = typeById(objectType);
  if (!type) return [];
  const chains = chainsOf(type, subtypeId);
  return MODE_ORDER.filter((m) => !!chains[m]).map((m) => {
    const c = chains[m];
    return {
      mode: m,
      label: c.label,
      chapter: c.chapter,
      scenario: c.scenario,
      require: c.require || [],
      optional: c.optional || [],
      steps: (c.steps || []).length,
      notes: c.notes || [],
      limitations: c.limitations || [],
    };
  });
}

/** Build an executable plan for one object + one mode (static/dynamic/ui). */
export function planTargetMode({ objectType, subtype = null, mode = 'static', target = '', goal = '', options = {} } = {}) {
  const type = typeById(objectType);
  if (!type) {
    throw new Error(`unknown objectType: ${objectType}（可选 web/app/software/ai-automation；固件用 software + subtype=firmware）`);
  }
  if (subtype && !subtypeOf(type, subtype)) {
    const available = (type.subtypes || []).map((s) => s.id);
    throw new Error(`${type.label} 没有子类 ${subtype}${available.length ? `（可选：${available.join(', ')}）` : ''}`);
  }
  const chains = chainsOf(type, subtype);
  const modeKey = String(mode || 'static').toLowerCase();
  if (!MODE_ORDER.includes(modeKey)) throw new Error(`mode 必须是 static/dynamic/ui（收到 ${mode}）`);
  const chain = chains[modeKey];
  if (!chain) throw new Error(`${type.label} 没有 ${modeKey} 链路`);

  const workdir = options.workdir || `D:/work/deepseekhharness/re-hub/state/work/${Date.now()}`;
  const ctx = {
    target,
    workdir,
    goal,
    procedure: options.procedure || '{{procedure}}',
    className: options.className || '{{className}}',
    methodName: options.methodName || '{{methodName}}',
    cdpEndpoint: options.cdpEndpoint || 'http://127.0.0.1:9222',
    targetId: options.targetId || '{{targetId}}',
    package: options.package || '{{package}}',
    device: options.device || '{{device}}',
    process: options.process || '{{process}}',
    query: options.query || '{{query}}',
    pid: options.pid || '{{pid}}',
    binary: options.binary || '{{binary}}',
    extractedJs: options.extractedJs || '{{extractedJs}}',
    extractedBinary: options.extractedBinary || '{{extractedBinary}}',
    ...options,
  };
  // Keep the documented template placeholders when the caller did not pass a value:
  // options spread above may inject undefined, so re-apply defaults only for empty strings.
  for (const [k, v] of Object.entries({ procedure: '{{procedure}}', className: '{{className}}', targetId: '{{targetId}}', package: '{{package}}', device: '{{device}}', process: '{{process}}', query: '{{query}}', pid: '{{pid}}', binary: '{{binary}}', extractedJs: '{{extractedJs}}', extractedBinary: '{{extractedBinary}}' })) {
    if (ctx[k] == null || ctx[k] === '') ctx[k] = v;
  }

  const steps = (chain.steps || []).map((s, i) => {
    const resolved = resolveArgs(s.args, ctx);
    const needsArgs = Array.isArray(resolved.args) && resolved.args.some((x) => typeof x === 'string' && /\{\{/.test(x));
    return {
      step: i + 1,
      backend: s.backend,
      op: s.op,
      why: s.why,
      args: resolved,
      needs: Object.entries(resolved)
        .flatMap(([k, v]) => (typeof v === 'string' && /\{\{/.test(v) ? [k] : []))
        .concat(needsArgs ? ['args'] : []),
    };
  });

  const unresolved = new Set();
  for (const s of steps) {
    for (const m of JSON.stringify(s.args).matchAll(/\{\{(\w+)\}\}/g)) unresolved.add(m[1]);
  }

  return {
    objectType: type.id,
    label: type.label,
    subtype: subtype ? (subtypeOf(type, subtype)?.label || subtype) : null,
    mode: modeKey,
    modeLabel: MODE_META[modeKey].label,
    chainLabel: chain.label,
    chapter: chain.chapter,
    scenario: chain.scenario,
    target,
    goal,
    workdir,
    requires: chain.require || [],
    optional: chain.optional || [],
    unresolved: [...unresolved],
    steps,
    notes: chain.notes || [],
    limitations: chain.limitations || [],
    evidencePlan: [
      '每完成一步，用 rehub_evidence action=append 记录：backend/op、关键发现、证据定位、置信度、未知项。',
      '交付时区分 observed / inferred / unknown；UI 原型注明 clean-room、未拷贝资产。',
    ],
  };
}

/** Catalog of the taxonomy (for rehub_classify without a task). */
export function taxonomyCatalog() {
  return OBJECT_TYPES.map((t) => ({
    id: t.id,
    label: t.label,
    desc: t.desc,
    signals: {
      url: !!t.detect.url,
      exts: t.detect.exts || [],
      phrases: t.detect.phrases || [],
      keywords: t.detect.keywords || [],
    },
    subtypes: (t.subtypes || []).map((s) => ({ id: s.id, label: s.label, exts: s.exts || [] })),
    modes: MODE_ORDER.filter((m) => !!chainsOf(t, null)[m]).map((m) => ({ mode: m, chapter: chainsOf(t, null)[m].chapter, steps: (chainsOf(t, null)[m].steps || []).length })),
  }));
}
