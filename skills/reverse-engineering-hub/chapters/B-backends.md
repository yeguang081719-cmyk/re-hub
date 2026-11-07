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
| frida | ❌ | 动态插桩 |
| ida / binja | ❌ | 商业授权 |
| js-reverse-mcp | ⚠️ 已克隆未构建 | Web 断点/Hook 增强 |

## B.2 缺了怎么装

```powershell
# adb
# 下载 Android platform-tools，解压后把 adb.exe 路径写入 config.json 的 adbExe

# frida
pip install frida-tools
# 设备端按 ABI 推 frida-server（需 root）

# js-reverse-mcp（可选，增强 Web 链）
cd D:\work\deepseekhharness\re-hub\vendor\js-reverse-mcp
npm install
npm run build
# 入口 dist/index.js，写进 config.json 的 mcpBackends

# IDA / Binary Ninja：需商业许可；装好后把对应 MCP 服务写进 mcpBackends
```

## B.3 REA 专属环境变量

| 变量 | 作用 | 本机值 |
|---|---|---|
| `GHIDRA_INSTALL_DIR` | REA 的 Ghidra provider | `D:\AI\apps\ghidra_12.1.4_PUBLIC` |
| `JAVA_HOME` | Ghidra 启动 JDK | `D:\AI\apps\jdk-21` |
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
