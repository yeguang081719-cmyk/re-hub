# BACKENDS — 后端接入与实际状态

> 生成于 2026-11-07。`node src/cli.mjs detect` 会实时输出同样的状态（含版本/路径/安装提示）。

## 1. 状态总览

| 后端 | 状态 | 版本/路径 | 参与链路 |
|---|---|---|---|
| `rea` | ✅ 可用 | 6.4.0，`D:/path/to/rea/scripts/rea.mjs` | 原生、.NET、Electron、Web、Android(需 JADX 桥)、固件、抓包、进程 |
| `ghidra` | ✅ 可用 | 12.1.4，`D:/path/to/ghidra_12.x_PUBLIC` | 原生直连 headless（函数清单/伪代码） |
| `jadx` | ✅ 可用 | 1.5.6，`tools/jadx/bin/jadx.bat` | Android 静态（反编译 Java 源码） |
| `apktool` | ✅ 可用 | 3.0.3，`tools/apktool_3.0.3.jar` + JDK21 | Android 资源/Manifest |
| `chrome` | ✅ 可用 | `C:/Program Files/Google/Chrome/Application/chrome.exe` | Web/JS、页面观察 |
| `dotnet` | ✅ 可用 | `dotnet` | .NET 辅助 |
| `jadx-headless-mcp` (REA 桥) | ✅ 已配置 | `tools/jadx-headless-mcp-0.7.1-clean.jar` | REA 的 `inspect-android-*` |
| `adb` | ❌ 缺失 | — | Android 动态链前置 |
| `frida` | ❌ 缺失 | — | 动态插桩/脱壳 |
| `ida` | ❌ 缺失 | — | 需商业许可 |
| `binja` | ❌ 缺失 | — | 需商业许可 |
| `js-reverse-mcp`（子 MCP） | ⚠️ 已克隆，未构建 | `vendor/js-reverse-mcp` | Web/JS 动态（断点/Hook/反检测） |
| `ghidra-mcp`（子 MCP） | ⚠️ 已克隆，未装扩展 | `vendor/ghidra-mcp` | 200+ Ghidra 工具（可选，替代直连） |

## 1.5 按需自举（bootstrap）

仓库只含代码，不含引擎。缺失的引擎从**官方 GitHub release** 按需下载、校验 sha256、解压并写回 `config.json`：

```powershell
node scripts/bootstrap.mjs --check                     # 看缺什么 / 已有什么
node scripts/bootstrap.mjs --only jadx,apktool --yes   # 只装需要的
node scripts/bootstrap.mjs --all --yes                 # 全部（含 REA / Ghidra，较大）
```

MCP 侧等价：`rehub_install { only:["jadx"], dryRun:false }`（默认 dry-run 只规划）。

| id | 来源 | 约大小 | 落地位置 |
|---|---|---|---|
| `jadx` | skylot/jadx | 70MB | `tools/jadx/`（config.jadxHome） |
| `apktool` | iBotPeaches/Apktool | 15MB | `tools/apktool.jar`（config.apktoolJar） |
| `jadx-headless-mcp` | 1013503897/jadx-headless-mcp v0.7.1 | 41MB | `tools/jadx-headless-mcp-0.7.1-clean.jar`（自动重打包去重） |
| `rea` | morluto/rea | clone + npm | `tools/rea/`（config.reaScript） |
| `ghidra` | NationalSecurityAgency/ghidra | ~400MB | `tools/ghidra/`（config.ghidraDir，需 JDK21） |

- 已存在或 `config.json` 已指向可用副本 → 自动跳过，不重复下载。
- GitHub 提供 digest 时校验 sha256（实测 apktool 通过）。
- adb / frida / IDA / Binary Ninja 不走 GitHub release，按 §2/§5 手动接入。

## 2. 各后端用法

### rea（主执行层）
```powershell
node src/cli.mjs exec rea capabilities
node src/cli.mjs exec rea analyze --path C:\Windows\System32\where.exe
node src/cli.mjs exec rea decompile --path X.exe --procedure FUN_140001010
node src/cli.mjs exec rea android-package --path app.apk
node src/cli.mjs exec rea android-class --path app.apk --className org.example.MainActivity
node src/cli.mjs exec rea raw --argsJson '["list-browser-targets","--endpoint","http://127.0.0.1:9222","--format","json"]'
```
环境：`GHIDRA_INSTALL_DIR`、`JAVA_HOME`、`REA_JADX_MCP_JAR` 由网关按 config.json 注入；`PATH` 会额外包含 `tools/jadx/bin`。

### ghidra（直连 headless）
```powershell
node src/cli.mjs exec ghidra functions --path X.exe            # 函数清单（198 个/约 38s 含分析）
node src/cli.mjs exec ghidra decompile --path X.exe --maxDecompile 5  # 带伪代码
```
实现：`support/analyzeHeadless.bat` + `-postScript DumpFunctions.java`，输出 JSON；每个工程独立命名并 `-deleteProject`。
适合：CI/无 GUI、需要绕过 REA provider 限制做交叉验证。

### jadx（Android 反编译）
```powershell
node src/cli.mjs exec jadx version
node src/cli.mjs exec jadx decompile --path app.apk --out D:\out\jadx
node src/cli.mjs exec jadx class --path app.apk --className org.example.Foo --out D:\out\cls
```
注意：JADX 对部分类反编译失败时退出码为 1，但源码仍产出；网关标记 `partialSuccess=true` 且 `ok=true`。

### apktool（资源/Manifest）
```powershell
node src/cli.mjs exec apktool decode --path app.apk --out D:\out\apktool
```
输出目录含 `AndroidManifest.xml`；`hasManifest=true` 表示成功。

### adb / frida（动态链，当前不可用）
```powershell
node src/cli.mjs exec adb devices
node src/cli.mjs exec frida version
```
接入方法：
- adb：Android platform-tools，`config.json` 填 `adbExe`。
- frida：`pip install frida-tools`，设备端按 ABI 推 `frida-server`；`config.json` 填 `fridaExe`（或留空走 PATH）。
- 装好后 `rehub_route` 会自动把 `android-dynamic` 标记为就绪。

## 3. 子 MCP 后端（多路复用）

任意 MCP 服务都可以挂进来，不需要改代码：

```json
"mcpBackends": {
  "ida-mcp": {
    "command": "python",
    "args": ["D:/path/to/ida-mcp/server.py"],
    "cwd": "D:/path/to/ida-mcp",
    "description": "IDA Pro MCP"
  }
}
```
然后：
```powershell
node src/cli.mjs ... # 或 MCP 工具
rehub_mcp { action: "list", backend: "ida-mcp" }
rehub_mcp { action: "call", backend: "ida-mcp", tool: "<tool>", args: {...} }
```
实现：`src/lib/mcp.mjs` 的 `McpClient` 按需 spawn、initialize、转发 `tools/list`/`tools/call`，生命周期随网关退出回收。

已预置（未启用/未构建）：
- `js-reverse-mcp`：`cd vendor/js-reverse-mcp && npm install && npm run build`，入口 `dist/index.js`（依赖 Patchright 浏览器，网络较慢）。
- `ghidra-mcp`：需先安装 Ghidra 扩展（`vendor/ghidra-mcp` README），再启用。

## 4. 已知坑（实测）

1. **REA 的 JADX 桥需要 `REA_JADX_MCP_JAR`**：官方 release 的 fat jar 含重复 `META-INF/LICENSE.txt` 条目，REA 的归档完整性检查会拒绝（`Artifact path collision`）。解决：用 JDK `jar xf` 展开后重新打包（本项目 `tools/jadx-headless-mcp-0.7.1-clean.jar` 即如此生成），条目唯一后正常加载（5023 类/1584 资源）。
2. **JADX 部分失败不算错**：退出码 1 + `finished with errors` 时源码仍完整，网关按 partial success 处理。
3. **Ghidra 首次分析会写用户缓存**（`%APPDATA%\ghidra`、`%LOCALAPPDATA%\ghidra`），重复分析会快很多。
4. **DSH 的 MCP 注册需重启**：`cordis.patch.yml` 变更后新进程才会加载；网关内部的 `config.json` 支持热更新（文件 mtime 变化即重读），但 `server.mjs` 代码变更必须重启 DSH 才生效。
5. **编码**：`%DSH_HOME%\cordis.patch.yml` 必须是 UTF-8（本机曾出现 GBK/UTF-8 混乱）；`install/register.mjs` 用 Node 写文件，避免 PowerShell 默认编码破坏中文注释。可用 `node scripts/validate-patch.mjs %DSH_HOME%\cordis.patch.yml` 校验。

## 5. 商业工具接入（IDA / Binary Ninja / JEB）

- 网关**不内置**任何商业工具，也不提供许可。
- IDA：`vendor/ida-pro-mcp`（社区）或 `vendor/ida-mcp`（Hex-Rays 官方），按各自 README 启动后写进 `mcpBackends`。
- Binary Ninja：`vendor/binary_ninja_mcp` / `vendor/binary-ninja-headless-mcp`。
- REA 原生侧也可直接绑定 IDA provider（`--provider ida`），前提是装好 `mrexodia/ida-pro-mcp` 的桥。
