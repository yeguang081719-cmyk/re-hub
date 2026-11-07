# 附录 B 后端与依赖速查

> `rehub_detect` 是唯一事实来源；本附录解释每个后端能干什么、缺了怎么装。

## B.1 本机当前状态（2026-11-07）

| 后端 | 状态 | 用法入口 |
|---|---|---|
| rea 6.4.0 | ✅ | `rehub_exec backend=rea` / `mcp__rea__*` |
| ghidra 12.1.4 | ✅ | `rehub_exec backend=ghidra op=functions|decompile` |
| jadx 1.5.6 | ✅ | `rehub_exec backend=jadx op=decompile|class` |
| apktool 3.0.3 | ✅ | `rehub_exec backend=apktool op=decode` |
| chrome | ✅ | CDP 端口 9222 |
| dotnet | ✅ | 辅助 |
| jadx-headless-mcp 0.7.1 | ✅（REA 桥） | `rea android-*` |
| adb | ❌ | 动态链前置 |
| frida | ❌ | 动态插桩（pip install frida-tools） |
| x64dbg | ✅（bootstrap 安装） | 动态调试（断点/单步/内存）；Medium 会话只能调自己启动的进程 |
| pe-sieve | ✅（bootstrap 安装，需管理员） | 内存 dump / 注入检测；未提权会 Access Denied（`needs-elevation`） |
| uia | ✅ 内置 | UI 控件树/截图（scripts/uia/uia.ps1） |
| ida / binja | ❌ | 商业授权 |
| js-reverse-mcp | ⚠️ 已克隆未构建 | Web 断点/Hook 增强 |

## B.2 缺了怎么装（按需自举）

```powershell
node scripts/bootstrap.mjs --check                     # 看缺什么
node scripts/bootstrap.mjs --only jadx,apktool --yes   # 只装需要的
node scripts/bootstrap.mjs --all --yes                 # 全部（含 REA / Ghidra，较大）
```

Agent 侧等价：`rehub_install { only:["jadx"], dryRun:false }`（默认 dry-run 只规划，确认后再装）。
已存在（含 config 指向的现成安装）会自动跳过；GitHub 提供 digest 时校验 sha256。

| id | 来源 | 约大小 |
|---|---|---|
| `jadx` | skylot/jadx | 70MB |
| `apktool` | iBotPeaches/Apktool | 15MB |
| `jadx-headless-mcp` | 1013503897/jadx-headless-mcp v0.7.1 | 41MB |
| `rea` | morluto/rea | clone + npm |
| `ghidra` | NationalSecurityAgency/ghidra | ~400MB（需 JDK21） |
| `x64dbg` | x64dbg/x64dbg | ~50MB（快照包） |
| `pe-sieve` | hasherezade/pe-sieve | ~1MB |

不走 GitHub release 的：adb（platform-tools）、frida（pip）、IDA/Binary Ninja（商业授权）、UIA（系统内置）——见 B.5。

## B.3 REA 专属环境变量

| 变量 | 作用 | 示例值 |
|---|---|---|
| `GHIDRA_INSTALL_DIR` | REA 的 Ghidra provider | `D:\Tools\ghidra_12.x_PUBLIC` |
| `JAVA_HOME` | Ghidra 启动 JDK | `D:\Tools\jdk-21` |
| `REA_JADX_MCP_JAR` | Android provider | `tools\jadx-headless-mcp-0.7.1-clean.jar` |

## B.4 子 MCP 接入

任何 MCP 服务都能挂：写进 `config.json` 的 `mcpBackends`，然后：
`rehub_mcp { action:"list", backend:"<name>" }` / `action:"call"`。

## B.5 能力矩阵（简版）

| 目标类型 | 首选 | 备选 |
|---|---|---|
| 原生 | rea(provider=ghidra) | ghidra 直连；IDA/BN（需许可） |
| APK | rea android + jadx | apktool（资源） |
| Web/JS | rea CDP + chrome | js-reverse-mcp（构建后） |
| Electron | rea js-application | — |
| .NET | rea managed | — |
| 固件 | rea 区域识别 | WSL 上 binwalk/unblob |
| 抓包 | rea HAR | pcap 需 tshark |
| 动态 | frida + adb | — |
