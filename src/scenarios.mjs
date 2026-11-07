// Scenario catalog + intent router + chain planner.
// This is the "brain" the official skill tells the agent to consult first.

export const SCENARIOS = [
  {
    id: 'native-binary',
    chapter: '01-native-binary',
    title: '原生二进制静态分析',
    summary: 'exe/dll/so/elf/macho 等原生目标：概览、函数、反编译、字符串、交叉引用、补丁。',
    category: 'native',
    exts: ['.exe', '.dll', '.sys', '.ocx', '.cpl', '.so', '.elf', '.dylib', '.macho', '.o', '.a', '.lib'],
    phrases: ['原生二进制', 'native binary', '反编译', 'decompile', '伪代码', 'pseudocode', '汇编', 'assembly', '交叉引用', 'xref', '函数调用', 'call graph'],
    keywords: ['exe', 'dll', 'so', 'elf', 'macho', '二进制', '二进制文件', '反汇编', '逆向', '逆向分析', '函数', '符号', '导入表', '字符串', '补丁', 'patch', 'hook 点', 'cve', '漏洞', 'vuln'],
    requires: ['rea', 'ghidra'],
    optional: ['ida', 'binja'],
    chain: [
      { step: 1, backend: 'rea', op: 'analyze', args: { path: '{{target}}' }, why: '拿整体概览（格式/架构/符号/依赖），Ghidra 作为深分析 provider。' },
      { step: 2, backend: 'rea', op: 'decompile', args: { path: '{{target}}', procedure: '{{procedure}}' }, why: '按函数名/地址取伪代码与汇编；先看导出/符号再定点。' },
      { step: 3, backend: 'rea', op: 'raw', args: { args: ['function', '{{target}}', '--procedure', '{{procedure}}', '--format', 'json'] }, why: '单函数完整证据（调用者/被调用者/引用/字符串）。' },
      { step: 4, backend: 'ghidra', op: 'functions', args: { path: '{{target}}' }, why: '绕开 provider 限制，直接 headless Ghidra 导出函数清单作为交叉验证。' },
    ],
    reaTools: ['mcp__rea__open_binary', 'mcp__rea__analyze_function', 'mcp__rea__procedure_pseudo_code', 'mcp__rea__procedure_assembly', 'mcp__rea__xrefs', 'mcp__rea__list_strings', 'mcp__rea__search_functions'],
    install: { ghidra: '已检测到 D:/AI/apps/ghidra_12.1.4_PUBLIC；无需安装。', ida: '商业授权，装好后在 config.json 的 mcpBackends 注册 ida-mcp。' },
  },
  {
    id: 'android-apk',
    chapter: '02-android-static',
    title: 'Android APK 静态逆向',
    summary: 'APK 包结构、Manifest、DEX 类/方法反编译、资源、签名校验；SO 深挖时转 native 链。',
    category: 'android',
    exts: ['.apk', '.xapk', '.apks', '.aab'],
    phrases: ['安卓逆向', 'apk 逆向', 'apk逆向', '反编译 apk', '反编译apk', '脱壳', '加固', 'signature 校验', '签名校验', 'smali'],
    keywords: ['apk', 'android', '安卓', 'dex', 'smali', 'manifest', 'jadx', 'apktool', '资源', '加固', '壳', '签名', 'so 文件', 'so文件', 'applicationid'],
    requires: ['rea', 'jadx', 'apktool'],
    optional: ['adb', 'frida'],
    chain: [
      { step: 1, backend: 'rea', op: 'android-package', args: { path: '{{target}}' }, why: 'Manifest/包名/SDK/权限/组件概览（REA 需 REA_JADX_MCP_JAR；未配置时跳过，直接用 jadx/apktool 链）。' },
      { step: 2, backend: 'jadx', op: 'decompile', args: { path: '{{target}}', out: '{{workdir}}/jadx-out' }, why: '整包反编译成 Java 源码，供类与方法检索。' },
      { step: 3, backend: 'rea', op: 'android-class', args: { path: '{{target}}', className: '{{className}}' }, why: '精确类成员清单（含重载），再按需取方法。' },
      { step: 4, backend: 'rea', op: 'android-method', args: { path: '{{target}}', className: '{{className}}', methodName: '{{methodName}}' }, why: '单方法反编译，带 overload 选择。' },
      { step: 5, backend: 'apktool', op: 'decode', args: { path: '{{target}}', out: '{{workdir}}/apktool-out' }, why: '解资源与 Manifest 原文（加固/资源混淆场景）。' },
    ],
    reaTools: ['mcp__rea__inspect_android_package', 'mcp__rea__inspect_android_class', 'mcp__rea__inspect_android_method', 'mcp__rea__decode_android_resources', 'mcp__rea__inspect_apk_signature'],
    install: {
      jadx: '从 github.com/skylot/jadx/releases 下载 zip，解压到 re-hub/tools/jadx 并把 bin/jadx.bat 路径写进 config.json 的 jadxHome。',
      apktool: '下载 github.com/iBotPeaches/Apktool/releases 的 apktool_x.jar 存为 re-hub/tools/apktool.jar（需要 JDK）。',
    },
  },
  {
    id: 'android-dynamic',
    chapter: '03-android-dynamic',
    title: 'Android 动态插桩 / 脱壳',
    summary: 'Frida hook、内存 DEX dump、反检测绕过、运行时参数采样。需要真机/模拟器 + adb + frida。',
    category: 'android',
    exts: ['.apk'],
    phrases: ['动态调试', '动态分析', 'frida', '脱壳', '内存 dump', '内存dump', 'dump dex', '反检测', '反调试', '运行时'],
    keywords: ['hook', '插桩', 'adb', '模拟器', '真机', 'frida', 'spawn', 'attach', '绕过', '检测', 'so hook', 'native hook'],
    requires: ['adb', 'frida'],
    optional: ['rea'],
    chain: [
      { step: 1, backend: 'adb', op: 'devices', args: {}, why: '确认设备/模拟器在线。' },
      { step: 2, backend: 'adb', op: 'shell', args: { args: ['getprop', 'ro.product.cpu.abi'] }, why: '确认 ABI 以选择 frida-server 版本。' },
      { step: 3, backend: 'frida', op: 'ps', args: { device: '{{device}}' }, why: '列出进程，确定 attach 目标。' },
      { step: 4, backend: 'frida', op: 'hook', args: { package: '{{package}}', script: '{{hookScript}}' }, why: '注入 hook 脚本，采样参数/返回值。' },
      { step: 5, backend: 'rea', op: 'raw', args: { args: ['inspect-adb-package', '{{package}}', '--format', 'json'] }, why: 'REA 的 ADB 只读观察：版本、安装器、dumpsys 事实。' },
    ],
    reaTools: ['mcp__rea__list_adb_devices', 'mcp__rea__inspect_adb_package', 'mcp__rea__list_adb_processes', 'mcp__rea__read_adb_logcat', 'mcp__rea__pull_adb_package'],
    install: {
      adb: '安装 Android platform-tools 并把 adb.exe 路径写入 config.json 的 adbExe。',
      frida: 'pip install frida-tools；设备端推送 frida-server（需 root 或可调试 App）。',
    },
  },
  {
    id: 'web-js',
    chapter: '04-web-js',
    title: 'Web/JS 前端逆向（签名、加密参数、反爬）',
    summary: '定位前端签名/加密逻辑：脚本检索、断点、Hook XHR/fetch、调用栈还原、混淆还原、反检测。',
    category: 'web',
    exts: ['.js', '.html', '.htm', '.mjs'],
    phrases: ['前端逆向', 'js 逆向', 'js逆向', '签名算法', '加密参数', '反爬', '反爬虫', '混淆还原', 'webpack 打包', '登录参数', '请求参数加密', '接口加密', 'sign 参数', '参数怎么生成', '怎么生成的', '前端 js', '找算法', '登录的 sign'],
    keywords: ['js', 'javascript', 'sign', '签名', '加密', '解密', 'token', 'cookie', 'hook', '断点', 'debugger', 'xhr', 'fetch', 'websocket', '变量名还原', 'sojson', 'obfuscator', '极验', '滑块'],
    requires: ['chrome'],
    optional: ['js-reverse-mcp', 'rea'],
    chain: [
      { step: 1, backend: 'js-reverse-mcp', op: 'list_tools', args: {}, why: '列出 JS 逆向子 MCP 的工具（脚本检索/断点/hook/网络）。' },
      { step: 2, backend: 'js-reverse-mcp', op: 'call', args: { tool: '{{tool}}', args: {} }, why: '按需调用：先搜索脚本，再设断点/hook。' },
      { step: 3, backend: 'rea', op: 'raw', args: { args: ['list-browser-targets', '--endpoint', '{{cdpEndpoint}}', '--format', 'json'] }, why: '若已有 Chrome 会话，用 REA 被动观察页面与网络（无侵入）。' },
      { step: 4, backend: 'rea', op: 'web-bundle', args: { endpoint: '{{cdpEndpoint}}', targetId: '{{targetId}}' }, why: '抓取页面脚本做静态分析（源码映射/路由/接口候选）。' },
    ],
    reaTools: ['mcp__rea__list_browser_targets', 'mcp__rea__inspect_web_page', 'mcp__rea__analyze_web_bundle', 'mcp__rea__capture_web_screenshot', 'mcp__rea__trace_application_feature'],
    install: {
      'js-reverse-mcp': 'cd vendor/js-reverse-mcp && npm install && npm run build（依赖 Patchright 浏览器下载，国内网络可能较慢）。',
      chrome: '已检测到 C:/Program Files/Google/Chrome/Application/chrome.exe。',
    },
  },
  {
    id: 'web-runtime',
    chapter: '05-web-runtime',
    title: 'Web 运行时被动观察',
    summary: '针对已打开的页面/网站：页面结构、脚本、网络请求、storage、截图，不执行注入。',
    category: 'web',
    exts: ['.har'],
    phrases: ['被动分析', '页面分析', '网站分析', '网络请求分析', 'websocket 帧', 'storage', 'localstorage'],
    keywords: ['网站', '页面', '浏览器', 'cdp', 'devtools', '网络', '请求', '响应', '抓包', 'har', '域名', '接口'],
    requires: ['chrome'],
    optional: ['rea'],
    chain: [
      { step: 1, backend: 'rea', op: 'raw', args: { args: ['list-browser-targets', '--endpoint', '{{cdpEndpoint}}', '--format', 'json'] }, why: '列举可观测页面 target。' },
      { step: 2, backend: 'rea', op: 'raw', args: { args: ['inspect-web-page', '--endpoint', '{{cdpEndpoint}}', '--target-id', '{{targetId}}', '--format', 'json'] }, why: '被动抓取 DOM/脚本/网络/存储清单。' },
      { step: 3, backend: 'rea', op: 'web-screenshot', args: { endpoint: '{{cdpEndpoint}}', targetId: '{{targetId}}' }, why: '留存可视证据。' },
    ],
    reaTools: ['mcp__rea__list_browser_targets', 'mcp__rea__inspect_web_page', 'mcp__rea__capture_web_screenshot', 'mcp__rea__observe_web_session'],
    install: { chrome: '启动带 --remote-debugging-port=9222 的 Chrome 实例即可。' },
  },
  {
    id: 'electron-desktop',
    chapter: '06-electron',
    title: 'Electron / 桌面 JS 应用',
    summary: 'ASAR/打包目录：模块、import、IPC、原生插件边界、页面结构；必要时接运行中的 Electron。',
    category: 'desktop',
    exts: ['.asar'],
    phrases: ['electron', 'asar', '桌面应用', '客户端逆向', 'electron-builder', 'preload', 'ipc 通信'],
    keywords: ['electron', 'asar', 'desktop', '桌面', '客户端', 'preload', 'ipc', 'renderer', 'main process', 'nw.js', 'tauri'],
    requires: ['rea'],
    chain: [
      { step: 1, backend: 'rea', op: 'js-application', args: { path: '{{target}}' }, why: '静态重建 JS/Electron 应用图（模块/import/IPC/原生插件）。' },
      { step: 2, backend: 'rea', op: 'raw', args: { args: ['trace-application-feature', '--help'] }, why: '了解 feature trace 用法后按种子追踪。' },
      { step: 3, backend: 'rea', op: 'raw', args: { args: ['list-electron-targets', '--endpoint', '{{cdpEndpoint}}', '--format', 'json'] }, why: '若应用已带调试端口，观察运行中页面。' },
    ],
    reaTools: ['mcp__rea__analyze_javascript_application', 'mcp__rea__trace_application_feature', 'mcp__rea__list_electron_targets', 'mcp__rea__inspect_electron_page'],
    install: { rea: '已就绪（本机 rea 6.4.0）。' },
  },
  {
    id: 'dotnet-managed',
    chapter: '07-dotnet',
    title: '.NET 托管程序集逆向',
    summary: 'PE/CLI 元数据、CIL、引用、资源、P/Invoke 边界、版本对比；静态不执行。',
    category: 'managed',
    exts: ['.dll', '.exe'],
    phrases: ['.net 逆向', 'c# 逆向', '托管代码', 'cil', 'il 代码', 'dnspy', 'ilspy', 'assembly'],
    keywords: ['dotnet', '.net', 'c#', 'csharp', 'il', 'cil', 'managed', '托管', '程序集', 'dnspy', 'ilspy', 'unity'],
    requires: ['rea'],
    chain: [
      { step: 1, backend: 'rea', op: 'raw', args: { args: ['inspect-managed-artifact', '{{target}}', '--format', 'json'] }, why: '程序集身份/模块/引用/资源清单。' },
      { step: 2, backend: 'rea', op: 'raw', args: { args: ['inspect-managed-members', '{{target}}', '--format', 'json'] }, why: '类型/方法/签名/调用边/字段访问锚点。' },
      { step: 3, backend: 'rea', op: 'raw', args: { args: ['inspect-managed-native-boundaries', '{{target}}', '--format', 'json'] }, why: 'P/Invoke 与原生边界，衔接 native 链。' },
    ],
    reaTools: ['mcp__rea__inspect_managed_artifact', 'mcp__rea__inspect_managed_members', 'mcp__rea__inspect_managed_native_boundaries'],
    install: { rea: '已就绪（静态分析，不需要 Windows 运行时）。' },
  },
  {
    id: 'firmware',
    chapter: '08-firmware',
    title: '固件 / 镜像提取',
    summary: '识别固件区域、提取文件系统、把提取物交给 native 链；IoT/路由器/嵌入式。',
    category: 'firmware',
    exts: ['.bin', '.img', '.rom', '.trx', '.chk'],
    phrases: ['固件', 'firmware', '路由器', '提取固件', 'unblob', 'binwalk', '文件系统提取'],
    keywords: ['固件', 'firmware', 'rom', 'squashfs', 'uboot', 'iot', '嵌入式', '路由器', '摄像头', '提取'],
    requires: ['rea'],
    optional: ['binwalk', 'unblob'],
    chain: [
      { step: 1, backend: 'rea', op: 'raw', args: { args: ['inspect-firmware-regions', '{{target}}', '--format', 'json'] }, why: 'Binwalk 识别区域与置信度（Linux 需要 binwalk）。' },
      { step: 2, backend: 'rea', op: 'firmware', args: { path: '{{target}}', out: '{{workdir}}/firmware-out' }, why: 'Unblob 提取文件系统与子文件，返回摘要。' },
      { step: 3, backend: 'rea', op: 'analyze', args: { path: '{{workdir}}/firmware-out/{{extractedBinary}}' }, why: '把提取到的 ELF 交给 native 链继续。' },
    ],
    reaTools: ['mcp__rea__inspect_firmware_regions', 'mcp__rea__extract_firmware'],
    install: { rea: '固件提取需要 Linux 上的 binwalk/unblob；Windows 上可先用 REA 的只读区域识别，或把镜像搬到 WSL。' },
  },
  {
    id: 'protocol-capture',
    chapter: '09-capture',
    title: '抓包 / 协议分析',
    summary: 'HAR、pcap、WebSocket 帧：请求响应、TLS SNI、端点、字段与重放；不访问录制 URL。',
    category: 'capture',
    exts: ['.har', '.pcap', '.pcapng', '.saz'],
    phrases: ['抓包分析', '协议分析', '报文分析', '流量分析', 'har 分析', 'pcap 分析'],
    keywords: ['har', 'pcap', '抓包', '报文', '流量', '协议', '请求', '响应', 'tls', 'sni', '重放', 'fiddler', 'mitm'],
    requires: ['rea'],
    chain: [
      { step: 1, backend: 'rea', op: 'raw', args: { args: ['inspect-web-network-capture', '{{target}}', '--format', 'json'] }, why: 'HAR/mitmproxy 录制记录的结构化观察（离线）。' },
      { step: 2, backend: 'rea', op: 'raw', args: { args: ['inspect-pcap', '{{target}}', '--format', 'json'] }, why: 'pcap 摘要：端点/DNS/SNI/协议分布。' },
      { step: 3, backend: 'rea', op: 'raw', args: { args: ['inspect-recorded-packets', '{{target}}', '--format', 'json'] }, why: '选定字段、重复值、过滤与 decode-as。' },
    ],
    reaTools: ['mcp__rea__inspect_web_network_capture', 'mcp__rea__inspect_pcap', 'mcp__rea__inspect_recorded_packets'],
    install: { rea: '需要 Linux 上的 tshark 才能做 pcap 原生解析；HAR 在 Windows 可直接分析。' },
  },
  {
    id: 'artifact-inventory',
    chapter: '10-artifact',
    title: '安装包 / 归档清单',
    summary: 'APK/IPA/MSIX/AppX/DMG/ZIP 成员清单、哈希、plist/Apple bundle 解剖、安全提取。',
    category: 'artifact',
    exts: ['.zip', '.ipa', '.msix', '.appx', '.dmg', '.pkg', '.jar', '.whl', '.tar', '.gz', '.7z'],
    phrases: ['安装包分析', '包结构', '归档清单', '解包', 'ipa 分析', 'msix 分析', 'dmg 分析'],
    keywords: ['zip', 'ipa', 'msix', 'appx', 'dmg', 'pkg', 'jar', '安装包', '归档', '解包', '清单', 'bundle', 'plist'],
    requires: ['rea'],
    chain: [
      { step: 1, backend: 'rea', op: 'raw', args: { args: ['inspect-artifact', '{{target}}', '--format', 'json'] }, why: '一次拿到成员清单、根/完整性观察、下一步探针。' },
      { step: 2, backend: 'rea', op: 'raw', args: { args: ['extract-artifact', '{{target}}', '--output-directory', '{{workdir}}/artifact-out', '--format', 'json'] }, why: '安全提取到独立目录（防穿越/符号链接逃逸）。' },
      { step: 3, backend: 'rea', op: 'js-application', args: { path: '{{workdir}}/artifact-out' }, why: '若提取物是 JS/Electron 应用，转 Electron 链。' },
    ],
    reaTools: ['mcp__rea__inspect_artifact', 'mcp__rea__extract_artifact', 'mcp__rea__inspect_plist', 'mcp__rea__inspect_pe_resources'],
    install: { rea: '已就绪。' },
  },
  {
    id: 'process-behavior',
    chapter: '11-process',
    title: '进程行为采集（黑盒）',
    summary: 'PTY 捕获终端输出、交互、退出码、文件系统观察，做行为对比；不读源码。',
    category: 'runtime',
    exts: [],
    phrases: ['进程行为', '黑盒测试', 'pty 捕获', '行为对比', '运行时行为'],
    keywords: ['进程', '启动参数', '环境变量', '行为', '黑盒', 'pty', '输出', '退出码', '文件系统'],
    requires: ['rea'],
    chain: [
      { step: 1, backend: 'rea', op: 'raw', args: { args: ['capture-process', '--executable', '{{exe}}', '--arguments', '{{argsJson}}', '--timeout-ms', '30000', '--format', 'json'] }, why: '一次有界运行，拿终端/生命周期/文件系统证据。' },
      { step: 2, backend: 'rea', op: 'raw', args: { args: ['compare-process-captures', '{{captureA}}', '{{captureB}}', '--format', 'json'] }, why: '两次运行差异对比（行为回归）。' },
    ],
    reaTools: ['mcp__rea__capture_process_scenario', 'mcp__rea__compare_process_captures'],
    install: { rea: 'PTY 捕获在 Linux/macOS 上支持最完整；Windows 受限。' },
  },
  {
    id: 'vuln-research',
    chapter: '12-vuln',
    title: '漏洞研究 / 补丁分析',
    summary: '在 native 链上叠加：补丁对比、崩溃/核心转储、攻击面枚举；可参考 AIxCC 的 buttercup 思路。',
    category: 'security',
    exts: ['.exe', '.dll', '.so', '.elf', '.core'],
    phrases: ['漏洞挖掘', '0day', '安全研究', '补丁对比', '崩溃分析', 'core dump', 'fuzzing'],
    keywords: ['漏洞', 'vuln', 'cve', '0day', '崩溃', 'crash', 'core', 'patch 对比', 'diff', '攻击面', 'fuzz'],
    requires: ['rea', 'ghidra'],
    chain: [
      { step: 1, backend: 'rea', op: 'raw', args: { args: ['inspect-binary-layout', '{{target}}', '--format', 'json'] }, why: '静态度量：段/符号/重定位/缓解措施（PIE/NX/RELRO/CFG）。' },
      { step: 2, backend: 'ghidra', op: 'functions', args: { path: '{{target}}' }, why: '函数清单，定位攻击面入口。' },
      { step: 3, backend: 'rea', op: 'raw', args: { args: ['inspect-recorded-crash', '{{target}}', '--format', 'json'] }, why: '若是 core：线程/寄存器/信号/映射候选。' },
      { step: 4, backend: 'rea', op: 'raw', args: { args: ['compare-functions', '--help'] }, why: '补丁前后函数级对比（需两份证据）。' },
    ],
    reaTools: ['mcp__rea__inspect_binary_layout', 'mcp__rea__inspect_recorded_crash', 'mcp__rea__compare_functions', 'mcp__rea__verify_reconstruction'],
    install: { rea: '已就绪；buttercup 仅作方法参考（AIxCC CRS，不是 MCP）。' },
  },
  {
    id: 'dynamic-analysis',
    chapter: '14-dynamic',
    title: '动态分析 / 运行时追踪',
    summary: '对运行中的程序下断点、跟踪调用、hook 关键函数、dump 内存镜像；用于静态受阻（VMProtect/混淆）或确认行为。',
    category: 'runtime',
    exts: ['.exe', '.dll', '.sys'],
    phrases: ['动态分析', '动态调试', '下断点', '断点跟踪', '运行时追踪', '内存 dump', '内存dump', '跑起来看', '动态跟踪', 'hook 函数', '反调试', '脱壳', '虚拟化', 'vmprotect'],
    keywords: ['动态', '调试', '断点', '单步', 'trace', '追踪', 'hook', 'frida', 'x64dbg', 'windbg', 'ttd', 'pe-sieve', 'dump', '内存', '运行时', '反调试', '壳', '加壳', 'vmp', '虚拟化'],
    requires: ['x64dbg', 'frida'],
    optional: ['pe-sieve', 'rea'],
    chain: [
      { step: 1, backend: 'x64dbg', op: 'info', args: {}, why: '确认调试器可用（动态分析的控制台）。' },
      { step: 2, backend: 'x64dbg', op: 'launch', args: { path: '{{target}}' }, why: '启动目标；断点/单步在调试器里做（或接 x64dbg-mcp-server 让 AI 控制）。' },
      { step: 3, backend: 'frida', op: 'ps', args: {}, why: '列出进程，确定 attach 目标；高层 hook 用 frida。' },
      { step: 4, backend: 'pe-sieve', op: 'dump', args: { pid: '{{pid}}' }, why: '抓内存镜像，用于脱壳/静态回填。' },
      { step: 5, backend: 'rea', op: 'raw', args: { args: ['inspect-artifact', '{{target}}', '--format', 'json'] }, why: '动态拿到镜像后回静态侧复核。' },
    ],
    reaTools: ['mcp__rea__open_binary', 'mcp__rea__capture_process_scenario', 'mcp__rea__compare_process_captures'],
    install: {
      x64dbg: 'node scripts/bootstrap.mjs --only x64dbg --yes；完整 AI 控制可再接 x64dbg-mcp-server（MCP）。',
      frida: 'pip install frida-tools（设备端需 frida-server）。',
      'pe-sieve': 'node scripts/bootstrap.mjs --only pe-sieve --yes。',
    },
  },
  {
    id: 'ui-reverse',
    chapter: '15-ui',
    title: 'UI 逆向 / 界面结构恢复',
    summary: '从运行中的应用恢复控件树/布局/资源/样式，评估可复现性并生成可运行 UI 原型。',
    category: 'ui',
    exts: ['.exe', '.dll'],
    phrases: ['ui逆向', '界面逆向', '界面还原', '控件树', 'ui 自动化', '界面结构', '复刻界面', '重建界面', 'ui 复现', '界面复刻', '控件分析', '对话框结构', '菜单结构', '界面分析'],
    keywords: ['ui', '界面', '控件', '布局', '对话框', '菜单', '工具栏', '状态栏', 'uia', 'accessibility', '控件树', '截图', '原型', '复刻', '还原', '主题', '样式'],
    requires: ['uia'],
    optional: ['chrome', 'rea'],
    chain: [
      { step: 1, backend: 'uia', op: 'tree', args: { process: '{{process}}' }, why: '导出控件树（名称/类型/AutomationId/类名/位置）。' },
      { step: 2, backend: 'uia', op: 'screenshot', args: { process: '{{process}}', out: '{{workdir}}/ui.png' }, why: '截取窗口，作为布局/视觉参考。' },
      { step: 3, backend: 'uia', op: 'find', args: { process: '{{process}}', query: '{{query}}' }, why: '按名称定位具体控件（菜单项/按钮）。' },
      { step: 4, backend: 'rea', op: 'raw', args: { args: ['list-browser-targets', '--endpoint', '{{cdpEndpoint}}', '--format', 'json'] }, why: '若 UI 是 CEF/Electron 页面，用 CDP 直接拿 DOM/样式。' },
    ],
    reaTools: ['mcp__rea__list_browser_targets', 'mcp__rea__inspect_web_page', 'mcp__rea__capture_web_screenshot'],
    install: {
      uia: '内置（scripts/uia/uia.ps1，Windows 自带 UIAutomation）。',
      chrome: 'CEF 页面需要应用开启远程调试端口（--remote-debugging-port）。',
    },
  },
  {
    id: 'triage',
    chapter: '13-triage',
    title: '目标分诊（信息不足）',
    summary: '当意图或目标类型不明确时，先问清楚再路由；不要瞎猜链路。',
    category: 'meta',
    exts: [],
    phrases: [],
    keywords: [],
    requires: [],
    chain: [{ step: 1, backend: 'rea', op: 'capabilities', args: {}, why: '先展示本机能力面，帮助用户选择。' }],
    reaTools: ['mcp__rea__binary_session'],
  },
];

const EXT_ALIASES = {
  '.exe': ['.exe', '.dll', '.sys', '.ocx', '.cpl'],
  '.dll': ['.dll', '.exe'],
  '.dylib': ['.dylib', '.macho', '.so'],
};

function extOf(target) {
  if (!target || typeof target !== 'string') return null;
  const t = target.trim();
  if (/^https?:\/\//i.test(t) || /^www\./i.test(t)) return null; // URL is not a file extension
  const m = /(\.[A-Za-z0-9]{1,8})$/.exec(t);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Classify a user task into a scenario.
 * @param {{task:string, target?:string, hints?:string[]}} input
 */
export function routeTask({ task = '', target = '', hints = [] } = {}) {
  const text = `${task} ${target} ${(hints || []).join(' ')}`.toLowerCase();
  const ext = extOf(target);
  const isUrl = !!target && (/^https?:\/\//i.test(target.trim()) || /^www\./i.test(target.trim()));

  const scored = SCENARIOS.map((s) => {
    let score = 0;
    const reasons = [];
    const hitPhrases = new Set();
    for (const p of s.phrases) {
      const lp = p.toLowerCase();
      if (text.includes(lp) && !hitPhrases.has(lp)) {
        hitPhrases.add(lp);
        score += 4;
        reasons.push(`phrase:${p}`);
      }
    }
    const hitKw = new Set();
    for (const k of s.keywords) {
      const lk = k.toLowerCase();
      if (text.includes(lk) && !hitKw.has(lk)) {
        hitKw.add(lk);
        score += 2;
        reasons.push(`kw:${k}`);
      }
    }
    let extMatch = 0;
    if (ext) {
      const exts = EXT_ALIASES[ext] || [ext];
      if (s.exts.some((e) => exts.includes(e))) {
        score += 6;
        extMatch = 1;
        reasons.push(`ext:${ext}`);
      }
    }
    if (isUrl && s.category === 'web') {
      score += 3;
      reasons.push('url:web');
    }
    return { scenario: s, score, reasons, extMatch };
  }).sort((a, b) => (b.score - a.score) || (b.extMatch - a.extMatch));

  const best = scored[0];
  const second = scored[1];
  const isWeak = best.score === 0 || best.scenario.id === 'triage';
  const isAmbiguous = !isWeak && !!second && best.score - second.score <= 2 && best.score < 9 && second.scenario.category !== best.scenario.category;

  const confidence = isWeak ? 'low' : best.score >= 9 ? 'high' : best.score >= 5 ? 'medium' : 'low';
  const chosen = isWeak ? SCENARIOS.find((s) => s.id === 'triage') : best.scenario;

  const clarify = [];
  if (isWeak || confidence === 'low') {
    clarify.push('目标是什么形态：可执行文件/二进制、APK、网页或前端脚本、Electron 桌面应用、.NET 程序、固件镜像、抓包文件，还是安装包？');
    clarify.push('你要的产出是什么：功能说明、算法/参数还原、脱壳、补丁、漏洞定位，还是可运行的重实现？');
  }
  if (isAmbiguous) {
    clarify.push(`最接近的是「${best.scenario.title}」与「${second.scenario.title}」，目标更偏哪一类？（可同时给出 target 路径/URL）`);
  }

  return {
    scenario: chosen.id,
    title: chosen.title,
    chapter: chosen.chapter,
    summary: chosen.summary,
    confidence,
    score: best.score,
    reasons: best.reasons,
    alternatives: scored.slice(1, 4).filter((x) => x.score > 0).map((x) => ({ scenario: x.scenario.id, title: x.scenario.title, score: x.score })),
    targetKind: ext || null,
    clarify,
    requires: chosen.requires,
    optional: chosen.optional || [],
  };
}

/** Resolve {{placeholders}} in a step's args. */
function resolveArgs(args = {}, ctx = {}) {
  const out = {};
  for (const [k, v] of Object.entries(args)) {
    if (typeof v === 'string') {
      out[k] = v.replace(/\{\{(\w+)\}\}/g, (_, name) => {
        const val = ctx[name];
        return val == null ? `{{${name}}}` : String(val);
      });
    } else if (Array.isArray(v)) {
      out[k] = v.map((x) => (typeof x === 'string' ? x.replace(/\{\{(\w+)\}\}/g, (_, name) => (ctx[name] == null ? `{{${name}}}` : String(ctx[name]))) : x));
    } else if (v && typeof v === 'object') {
      out[k] = resolveArgs(v, ctx);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Build an executable plan for a scenario + target. */
export function planScenario({ scenario, target = '', goal = '', options = {} } = {}) {
  const s = SCENARIOS.find((x) => x.id === scenario);
  if (!s) throw new Error(`unknown scenario: ${scenario}`);
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
    ...options,
  };
  const steps = s.chain.map((st) => {
    const resolved = resolveArgs(st.args, ctx);
    const needsArgs = Array.isArray(st.args?.args) && st.args.args.some((x) => typeof x === 'string' && /\{\{/.test(x));
    return {
      step: st.step,
      backend: st.backend,
      op: st.op,
      why: st.why,
      args: resolved,
      // marker for still-unresolved template params
      needs: Object.entries(resolved)
        .flatMap(([k, v]) => (typeof v === 'string' && /\{\{/.test(v) ? [k] : []))
        .concat(needsArgs ? ['args'] : []),
    };
  });

  const unresolved = new Set();
  for (const st of steps) {
    const flat = JSON.stringify(st.args);
    for (const m of flat.matchAll(/\{\{(\w+)\}\}/g)) unresolved.add(m[1]);
  }

  return {
    scenario: s.id,
    title: s.title,
    chapter: s.chapter,
    target,
    goal,
    workdir,
    requires: s.requires,
    optional: s.optional || [],
    unresolved: [...unresolved],
    steps,
    reaTools: s.reaTools || [],
    install: s.install || {},
    evidencePlan: [
      '每完成一步，用 rehub_evidence action=append 记录：backend/op、关键发现、证据定位（地址/类名/方法/请求 ID）、置信度、未知项。',
      '最终交付必须区分 observed / inferred / unknown，并列出未验证的假设。',
    ],
  };
}

export function scenarioCatalog() {
  return SCENARIOS.map((s) => ({
    id: s.id,
    title: s.title,
    chapter: s.chapter,
    summary: s.summary,
    category: s.category,
    requires: s.requires,
    optional: s.optional || [],
    steps: s.chain.map((c) => `${c.backend}:${c.op}`),
  }));
}
