# RE Hub — 逆向场景路由网关（MCP + 官方 Skill）

把 20+ 个逆向项目的能力收敛成**一套 MCP 工具 + 一个路由 Skill**：
Agent 先识别意图与目标形态，再路由到对应逆向链路（原生 / Android / Web-JS / Electron / .NET /
固件 / 抓包 / 归档 / 进程 / 漏洞），执行时由网关调用真实后端，并把证据写进账本。

> 定位：**不是又造一个反编译器**，而是"逆向任务的操作系统" —— 统一入口、统一编排、统一证据。
> 深分析能力复用 REA（本机 6.4.0）、Ghidra 12.1.4、JADX 1.5.6、apktool 3.0.3 等现成引擎。

## 1. 结构

```
re-hub/
├─ src/
│  ├─ server.mjs        # MCP stdio 服务：7 个工具 + 2 个官方 prompt
│  ├─ scenarios.mjs     # 13 个场景目录 + 意图路由（关键词/扩展名加权）+ 链路规划
│  ├─ backends.mjs      # 真实执行适配器：rea / ghidra / jadx / apktool / adb / frida
│  ├─ detect.mjs        # 环境侦察（可用性/版本/安装提示，30s 缓存）
│  ├─ evidence.mjs      # 证据账本（JSONL）与 Markdown 报告
│  ├─ cli.mjs           # 命令行版（调试/脚本用）
│  └─ lib/{mcp,exec}.mjs# 最小 MCP 协议实现 + 子进程执行器
├─ scripts/ghidra/DumpFunctions.java   # Ghidra headless post-script（函数清单/伪代码）
├─ skills/reverse-engineering-hub/
│  ├─ SKILL.md          # 封面：书名/简介/目录/三个索引/标准动作
│  └─ chapters/         # 正文：00 使用说明 + 01–13 场景章 + A/B/C 附录（按需加载）
├─ install/register.mjs # 一键注册到 DSH（MCP + Skill），幂等
├─ tests/smoke.mjs      # 28 项冒烟测试（真实 MCP 客户端）
├─ vendor/              # 全部同类项目源码（27 个仓库，见 VENDOR.md）
├─ tools/               # 下载的 JADX / apktool
└─ state/               # 证据账本、Ghidra 工程、大输出落盘
```

## 2. 快速开始

```powershell
cd D:\work\deepseekhharness\re-hub

# 0) 从 GitHub 克隆后初始化（本仓库不包含 vendor/tools/state）
git clone https://github.com/yeguang112/re-hub.git
cd re-hub
Copy-Item config.example.json config.json    # 按本机路径修改
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\vendor-clone.ps1  # 拉 25 个第三方仓库

# 工具按需自举（官方 GitHub release + sha256 校验，写入 config.json）
node scripts/bootstrap.mjs --check                  # 只看缺什么
node scripts/bootstrap.mjs --only jadx,apktool --yes  # 只装需要的
node scripts/bootstrap.mjs --all --yes                # 全部（含 REA ~ 与 Ghidra ~400MB）

# 1) 冒烟测试（不需要 DSH）
node tests/smoke.mjs

# 2) 环境侦察
node src/cli.mjs detect

# 3) 意图路由
node src/cli.mjs route --task "这个 APK 的登录参数怎么加密的" --target D:\x\app.apk

# 4) 生成链路
node src/cli.mjs plan --scenario android-apk --target D:\x\app.apk

# 5) 执行一步
node src/cli.mjs exec rea analyze --path C:\Windows\System32\where.exe

# 6) 全链路演示（Android：detect→route→plan→rea→jadx→apktool→证据→报告）
node scripts/demo-android.mjs

# 7) 注册到 DSH（MCP + Skill）
node install/register.mjs
#   重启 DSH 后工具出现为 mcp__rehub__*

# 8) 校验 DSH patch 文件（编码/YAML）
node scripts/validate-patch.mjs E:\AI\.dsh\cordis.patch.yml
```

后端细节、坑与接入方法见 [docs/BACKENDS.md](docs/BACKENDS.md)；已整合仓库清单见 [VENDOR.md](VENDOR.md)。

## 3. MCP 工具（注册后前缀 `mcp__rehub__`）

| 工具 | 作用 |
|---|---|
| `detect` | 侦察本机后端可用性、版本、缺失项安装提示、vendor 数量 |
| `scenarios` | 列出 13 个场景及链路（带 chapter 指针） |
| `route` | **意图识别**：task(+target) → 场景/置信度/理由/**该读哪一章(chapter)**/缺失依赖/澄清问题 |
| `book` | **这本书**：不带参数返回目录；带 chapter（`04`/`04-web-js`/`web-js`）返回该章正文 |
| `plan` | 生成可执行链路：每步 backend/op/参数、未解析参数、证据要求、chapter |
| `exec` | 执行一步（rea/jadx/apktool/ghidra/adb/frida），超大输出自动落盘 |
| `mcp` | 子 MCP 多路复用（js-reverse-mcp、ghidra-mcp、ida-mcp…） |
| `evidence` | 证据账本 append/list/report |

Prompt：`reverse-engineering-router`（封面+目录索引全文）、`scenario-chain`（单场景链路）、`chapter`（单章正文）。

## 3. 官方 Skill：一本可查的书

`skills/reverse-engineering-hub/` 是按「书」组织的 skill：

- **封面** `SKILL.md`：书名/简介/**目录**/**三个速查索引**（按目标形态、按用户说法、按产出）/标准动作。
- **正文** `chapters/`：00 使用说明 + 01–13 场景章 + A 证据与交付 + B 后端与依赖 + C 坑与故障排查。
- **按需加载**：先 `rehub_route` 拿到 `chapter`，再 `rehub_book { chapter }` 只读那一章，不必整本读。
- **三索引**让 agent 或人 30 秒内定位："这个报错看哪章、这个目标看哪章、要这种产出看哪章"。

| 章 | 内容 | 章 | 内容 |
|---|---|---|---|
| 00 | 使用说明 | 07 | .NET/托管 |
| 01 | 原生二进制 | 08 | 固件/镜像 |
| 02 | Android 静态 | 09 | 抓包/协议 |
| 03 | Android 动态 | 10 | 安装包/归档 |
| 04 | Web/JS（签名/加密） | 11 | 进程行为 |
| 05 | Web 运行时观察 | 12 | 漏洞研究/补丁 |
| 06 | Electron/桌面 JS | 13 | 分诊（信息不足） |
| A | 证据与交付 | B | 后端与依赖 |
| C | 坑与故障排查 | — | — |

## 3.5 工具自举（别人 clone 下来没有引擎怎么办）

仓库只含代码，不含引擎。缺失的引擎可以从**官方 GitHub release** 按需下载，自动解压并写回 `config.json`：

| 工具 | 来源仓库 | 约大小 | 说明 |
|---|---|---|---|
| `jadx` | skylot/jadx | 70MB | APK → Java 反编译 |
| `apktool` | iBotPeaches/Apktool | 15MB | APK 资源/Manifest |
| `jadx-headless-mcp` | 1013503897/jadx-headless-mcp（固定 v0.7.1） | 41MB | REA 的 Android 桥（自动重打包去重） |
| `rea` | morluto/rea | 仓库 + npm 依赖 | 统一执行层 |
| `ghidra` | NationalSecurityAgency/ghidra | ~400MB | 原生深分析（需 JDK21） |

两种用法：
- **Agent 侧**：`rehub_install { only:["jadx","apktool"], dryRun:false }`（默认 dry-run，只报告计划）
- **命令行**：`node scripts/bootstrap.mjs --only jadx,apktool --yes`；`--check` 只看状态

特性：已存在（含 config 指向的现成安装）自动跳过；GitHub 提供 digest 时校验 sha256；只装缺的，不重复下载。

## 4. 场景与后端矩阵

| 场景 | 首选后端 | 依赖 |
|---|---|---|
| native-binary | rea(provider=ghidra) + ghidra headless | Ghidra 12.1.4 ✅ |
| android-apk | rea(android provider) + jadx + apktool | JADX 1.5.6 ✅ / apktool 3.0.3 ✅ / jadx-headless-mcp 0.7.1 ✅ |
| android-dynamic | adb + frida | ❌ 未安装（无设备） |
| web-js | js-reverse-mcp + rea CDP | Chrome ✅ / 子 MCP 需 npm build |
| web-runtime | rea CDP | Chrome ✅ |
| electron-desktop | rea analyze-javascript-application | REA ✅ |
| dotnet-managed | rea inspect-managed-* | REA ✅ |
| firmware | rea binwalk/unblob | Windows 受限（建议 WSL） |
| protocol-capture | rea HAR/pcap | HAR ✅ / pcap 需 tshark |
| artifact-inventory | rea inspect/extract artifact | REA ✅ |
| process-behavior | rea capture-process | Windows 受限 |
| vuln-research | rea layout + ghidra functions | ✅ |
| triage | 提问澄清 | — |

实测（2026-11-07，样本 APK，计算器 6.7MB）：
`rea android-package` 5023 类/1584 资源 → `jadx decompile` 5021 个 Java 文件（partial success）
→ `apktool decode` Manifest 成功 → `rea android-class` 定位 MainActivity → 证据/报告落盘。
复现：`node scripts/demo-android.mjs`。

## 5. 已整合项目（vendor/）

见 `VENDOR.md`：REA、IDA MCP（社区版/官方/headless）、GhidraMCP 系（4 个）、Binary Ninja MCP、
ReVA、JADX MCP 系、apktool MCP、js-reverse-mcp、JSReverser-MCP、Frida MCP、MobileRE-Skill、
LLM4Decompile、buttercup、Marrow/revula 等 26 个仓库（25 个 clone 到 vendor/，REA 6.4.0 在本机 downloads/rea 运行）。

集成方式分三档：
1. **直接可用**：REA（本机）、Ghidra（本机 headless）、JADX/apktool（已下载）、Chrome。
2. **注册即用**：任意 MCP 服务写进 `config.json` 的 `mcpBackends`，用 `rehub_mcp` 调用。
3. **需商业许可/设备**：IDA Pro、Binary Ninja、JEB、真机 Frida —— 只做检测与接入说明。

## 6. 证据纪律

- 每条记录 `kind=observation|inference|unknown`，带 target/backend/op/证据定位。
- `evidence report` 输出 Markdown，按场景分组，未验证假设单列。
- 不把"工具热度/star"当结论；不把未执行计划写成已完成。

## 7. 安全与边界

- 只用于**自有或已获授权**的软件分析；不做未授权的绕过/破解。
- 商业工具（IDA/Hex-Rays/Hopper/BN/JEB）需自备合法授权，REA 与本网关不提供许可。
- 动态链（Frida/adb）会改变运行时状态，执行前确认测试设备与数据备份。

## 8. 已知限制

- Windows 上 binwalk/unblob、PTY 捕获、pcap 原生解析能力受限（Linux/WSL 更完整）。
- `js-reverse-mcp` 需 npm 安装 + Patchright 浏览器，尚未构建（`rehub_detect` 会标缺失）。
- IDA/Binary Ninja 未安装，仅检测。
- 本网关不复制 REA 的 229 个工具：REA 已有 `mcp__rea__*`，网关负责**路由与编排**，避免工具面翻倍。
