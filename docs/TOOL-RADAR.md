# TOOL RADAR — 逆向工具雷达

> 持续维护：每天扫描 GitHub 上**新出现**的逆向工具，识别其逆向对象与场景，和 re-hub 现有工具/后端做优劣对比，再决定是否接入。
> 首次：2026-11-07 · 最近更新：2026-11-07 · 下次自动扫描：2026-11-08 09:30（Asia/Shanghai）

## 为什么要有这个雷达

re-hub 的定位是“逆向任务的操作系统”：统一入口、统一编排、统一证据，而不是再造一个反编译器。  
所以新增工具的判断标准不是“热不热”，而是：

1. 它补的是哪条**对象 × 场景 × 模式**链路？
2. 它和现有后端（REA / Ghidra / JADX / apktool / Frida / x64dbg / pe-sieve）是**替代**还是**互补**？
3. 许可、设备、安装成本是否允许接入？失败能否回退？

## 方法

- 数据源：GitHub Search API，`created:>=<today-7d>`、`fork:false`、`sort=stars`、`per_page=100`，38 组查询（reverse engineering / decompiler / disassembler / malware / frida / ghidra / android / iOS / firmware / MCP / unpacker / il2cpp / .NET / Electron / pcap / WASM / JS deobf / UI automation 等）。
- 去重：所有扫过的仓库写入 `seen` 账本；star 翻倍且 ≥50 的旧噪声会“复活”复查。
- 过滤：排除 awesome/教程/数据集、静态重编译游戏移植、游戏 cheat、纯防护工具。
- 评估：读 README + 元数据（stars/license/created/pushed/release），按附录 D 的对象分类和第 01–15 章场景落位，再与现有工具逐项对比。
- 证据：`observed`（API/元数据/真实执行）、`inferred`（README 自述）、`unknown`。**README 的基准不算证据。**

## 当前结论（2026-11-07）

| 工具 | 对象 | 场景 | 许可 | 结论 | 一句话 |
|---|---|---|---|---|---|
| [rust_ASC](https://github.com/MG1937/rust_ASC) | App/Android | 02 | Apache-2.0 | **PILOT** | 无状态 APK/DEX 快查；JADX 之前的毫秒级侦察层 |
| [apkscope](https://github.com/suffixing/apkscope) | App/Android | 02/03/10 | Apache-2.0 | **PILOT** | 单 exe 一体化；v0.7.0 新增 Flutter libapp.so recon；基准待复现 |
| [rust-deobf](https://github.com/VAHPEM/rust-deobf) | 软件/原生 | 01/12 | Apache-2.0 core | **PILOT** | Rust 恶意样本去混淆；补 FLOSS 的空白 |
| [rea-rust](https://github.com/nanashili/rea-rust) | 软件/App/JS | 多章 | MIT | **PILOT（对拍）** | REA 的 Rust 重写；去掉 Node 依赖的战略项 |
| [vesper](https://github.com/Wtrwx/vesper) | App/iOS | 10/14 | MIT | WATCH | iOS 的 MCP 平台；需越狱设备 |
| [unthemidator](https://github.com/x86rc/unthemidator) | 软件/Windows | 14 | 无 | WATCH | Themida 静态脱壳；许可缺失 |
| [eleven](https://github.com/Zfinix/eleven) | 软件 + Android | 01/02/14 | Apache-2.0 | REFERENCE | Agent-first 桌面工作台；交互/审批可参考 |
| [binny](https://github.com/openbin-ai/binny) | 软件 + Android | 01/02/12 | AGPL-3.0 | REFERENCE | 模型无关 harness；沙箱/预算/报告可参考 |
| [Exuvia](https://github.com/Huai-Tian/Exuvia) | App/Android | 02/03 | AGPL-3.0 | WATCH | 脱壳 + dump 修复；root/AGPL |
| [paranoia](https://github.com/Altumptic/paranoia) | 软件/原生 | 01/14 | Apache-2.0 | WATCH | 轻量原生引擎；反编译仅 x86/x64 |
| [aidbg](https://github.com/A-new/aidbg) | 软件/Windows | 14 | 无 | WATCH | AI 调试器（JSONL/MCP）；许可缺失 |
| [dexsql](https://github.com/LSPosed/dexsql-release) | App/Android | 02 | NOASSERTION | WATCH | APK/DEX 的 SQL 查询；许可待审 |
| [dsh-rea](https://github.com/Fanqi89/dsh-rea) | AI 自动化 | — | MIT | REFERENCE | REA-only DSH 插件；安装/能力矩阵可参考 |
| [metis-reverse](https://github.com/Wholiver/metis-reverse) | 软件/Web | 01/04 | MIT | REFERENCE | 另一套 RE MCP 网关；同层竞争 |
| [retrokit](https://github.com/nautilusbits/retrokit) | 软件/DOS | 01 | Apache-2.0 | CATALOG | DOS LE/LX + Watcom 复古游戏 Ghidra 扩展 |
| [gore](https://github.com/figurophobia/gore) | 软件/游戏资源 | 10 | MIT | CATALOG | Godot PCK 解包 + 自动找密钥 |
| [Ghidra-Rare](https://github.com/aleph-void/Ghidra-Rare) | 软件/固件 | 01/08 | MIT | CATALOG | Ghidra 稀有 ISA 的 SLEIGH 支持 |
| [Malvex](https://github.com/JoasASantos/Malvex) | 多对象 | 多章 | 无（README 称 MIT） | CATALOG | 126 工具的恶意分析编排；与 re-hub 同层 |
| [hw-harness](https://github.com/cschalle/hw-harness) | 硬件/驱动 | 09/11 | MIT | CATALOG | VM + usbmon 外部观测写 Linux 驱动 |
| [html-disasm](https://github.com/MarketKernel/html-disasm) | 多对象 | 01/10 | MIT | CATALOG | 离线多格式反汇编 |
| [decomp.wtf](https://github.com/i12bp8/decomp.wtf) | 软件/游戏 | 01 | MIT | REJECT | 已归档；社区反对 AI 反编译 |
| [BLA](https://github.com/qybaihe/bla) | 防护/对抗 | — | MIT | REJECT（非逆向） | 反 AI 逆向防护盾，作为对抗面跟踪 |

### 补扫新增（同日，按对象缺口 + 补漏）

| 工具 | 对象 | 场景 | 许可 | 结论 | 一句话 |
|---|---|---|---|---|---|
| [mcp-dotnet](https://github.com/jumpifequal/mcp-dotnet) | 软件/.NET | 07 | MIT | **PILOT** | dnlib + ILSpy，36 个 MCP 工具；读/改 IL 并保存，补第 07 章 patch 闭环 |
| [dsh-apk-vm](https://github.com/yuxiaole-bili/dsh-apk-vm) | App/Android | 03/15 | Apache-2.0 | WATCH | 本地 root AOSP VM + UIAutomator + CDP；无真机跑 APK |
| [loupe](https://github.com/bmcreations/loupe) | App/Android+iOS | 03/15 | Apache-2.0 | WATCH | 设备串流 + 可访问性树 + MCP；claim/human-hold 人机共驾 |
| [dsh-asar-patch](https://github.com/loyalchiiina/dsh-asar-patch) | 软件/Electron | 06 | MIT | CATALOG | app.asar 等长就地补丁 + integrity 同步；只改不析 |
| [ReaDroid](https://github.com/Mcsd7/ReaDroid) | App/Android | 02/10 | MIT | CATALOG | Termux 上的 APK 静态 + 重打包/签名工具箱 |
| [IDA-Ghidra-bridge](https://github.com/oscarsantanaarias/IDA-Ghidra-bridge) | 软件/原生 | 01 | 无 | WATCH | IDA/Ghidra 的 TCP JSON 桥；跨反编译器互操作 |
| [dump-tool](https://github.com/tcmmm/dump-tool) | App/Android (il2cpp) | 01/03 | MIT | CATALOG | il2cpp dump.cs 浏览/翻译/Hook 生成 + 30 个 MCP 工具 |

完整评估、对比表与风险见 [tool-radar/2026-11-07.md](tool-radar/2026-11-07.md)；对象缺口补扫见 [tool-radar/2026-11-07-supplement.md](tool-radar/2026-11-07-supplement.md)。

### Web/JS 缺口补扫（同日）

05（Web 运行时）从 0 → 3 个候选，但**均为 0–1★ 的 WATCH/CATALOG**；没有成熟的新 Web/JS 工具，继续保留 `js-reverse-mcp` + Chrome CDP 主线。详见 [tool-radar/2026-11-07-webgap.md](tool-radar/2026-11-07-webgap.md)。

### 固件/抓包缺口补扫（同日）

08/09 从 2/2 → 5/5 个候选，但**同样没有成熟新后端**：`Firmware-Liberation-Engine`（Lean 4 验证）WATCH，`dgx-spark-firmware-emulator` / `ghidrallm-mcp` / `proxypin` CATALOG。继续用 binwalk/unblob + Ghidra + REA HAR/pcap。详见 [tool-radar/2026-11-07-fwgap.md](tool-radar/2026-11-07-fwgap.md)。

### 预评（dry-run 队列，README 级）

| 工具 | 对象 | 章节 | 许可 | 结论 | 一句话 |
|---|---|---|---|---|---|
| [ghidra-macos-arm64](https://github.com/qsnbdwdx/ghidra-macos-arm64) | 软件/原生 | 01 | Apache-2.0 | CATALOG | Ghidra 12.1.4 Apple Silicon 预编译 decompile/sleigh；只适用 macOS arm64 + 12.1.4 |
| [clazzpatcher](https://github.com/inclusivnp-max/clazzpatcher) | App/Android | 02/10 | 无 | WATCH | Kotlin DEX/smali/JVM class 读写/patch/互转；技术强但无许可证 |
| [rlvr-reverse-engineering](https://github.com/SamH135/rlvr-reverse-engineering) | AI 自动化 | — | MIT | REFERENCE | 面向 coding agent 的 RE RLVR 任务集（keygen/decompile/formats L0–L4） |
| [malware-detonation-lab](https://github.com/sheloab/malware-detonation-lab) | 软件/原生 | 11/12 | MIT | CATALOG | Docker 恶意样本静态+动态实验台（Kali/Ghidra/REA） |

**计数：** 首期 22 + 补扫 7 + Web 5 + 固件/抓包 5 + 预评 4 = **43 个工具**。

## 接入建议（按优先级）

### P0：`asc` 快查能力（rust_ASC）

- `capabilities.mjs` 注册 `android-fast-index`，候选实现 `asc`，回退 `jadx`。
- `backends.mjs` 增加 `asc` adapter：`listclass / listmethod / liststring / findrefs / getclass / getmanifest`。
- `android-apk` 计划第 1 步：`asc` 侦察 → 命中类 → `jadx` 深反编译。
- 许可 Apache-2.0；失败可回退 JADX，风险低。
- 详细设计（capability/ops/错误/测试）：[integrations/ASC.md](integrations/ASC.md)。

### P1：`rust-deobf`（Rust 二进制补章）

- 第 01 章增加“Rust 二进制”小节：`strings`/FLOSS 失效时，用 `rust-deobf` 做静态 + Unicorn 模拟恢复。
- 先标 experimental；接 MCP 或 CLI，输出只作为 `inferred` 线索，需人工/Ghidra 复核。

### P1.5：`mcp-dotnet`（.NET 的“可读可改”）

- 直接作为 `mcpBackends` 注册，先跑 `load_assembly → decompile → scan_suspicious_apis → rename → save → 再反编译`。
- 改 IL 只用于自有/授权样本，保留原始副本；稳定后写进第 07 章“MCP 可选后端”。
- 详细设计（只读/patch 分阶段、工具映射、测试）：[integrations/MCP-DOTNET.md](integrations/MCP-DOTNET.md)。

### P2：`apkscope` / `rea-rust`（验证后再说）

- `apkscope`：先复现“打开速度 / 单类 Java / MCP / Flutter recon”四项，再决定是否作为 dump/重签/Flutter 可选后端。
- `rea-rust`：先用 3–5 个样本对拍 REA 6.4.0 的 `inspect/decompile` 输出；有正式 release 再考虑替换 Node 运行时。

## 复评触发

| 项目 | 触发条件 |
|---|---|
| rea-rust | 正式 release / 对拍通过 / 上游 REA 行为变更 |
| apkscope | 第三方复现基准 / ≥0.8 / 修掉 viewer 平台限制 |
| rust-deobf | 出 release / 真实样本复现 / premium 许可明确 |
| mcp-dotnet | 授权 .NET 样本跑通 IL patch / 上游合并 |
| dsh-apk-vm | 出通用 MCP / 不再依赖 DSH / ARM 镜像支持 |
| loupe | 支持非 macOS host / iOS 真机输入完整 |
| dsh-asar-patch | 出 release / 支持非等长重建 |
| vesper | 有越狱设备 / 出 release |
| unthemidator | 补 LICENSE / 支持 VMProtect |
| paranoia | 支持 ARM64 反编译 / CLI 稳定 |
| aidbg | 补 LICENSE |
| Exuvia | 有授权设备 / 许可放宽 |
| dexsql | 许可证明确 |

## 证据纪律

- 只写有证据的结论；README 自述标 `inferred`，未跑过的不写“已验证”。
- 性能数字必须带样本、版本、环境；没有复现就注明“作者自述”。
- 脱壳/dump/Frida/iOS 解密只在自有或已授权样本、隔离环境做。
- 不把“star 多”当质量；本期有 549★ 两天归档、2641★ 是防护工具而非逆向工具。

## 日报索引

- [2026-11-07](tool-radar/2026-11-07.md) — 首期，30 天基线，1761 新仓库 / 22 入账 / 8 深评。
- [2026-11-07 补扫](tool-radar/2026-11-07-supplement.md) — 按对象缺口补扫 + 补漏，304 个未入账仓库 / 7 个候选（.NET、Android VM、设备串流、Electron patch、Termux 工具箱、IDA↔Ghidra 桥、il2cpp 工作台）。
- [2026-11-07 Web/JS 补扫](tool-radar/2026-11-07-webgap.md) — 10 组定向查询，190 个新仓库 / 5 个候选；无成熟新 Web 工具。
- [2026-11-07 固件/抓包补扫](tool-radar/2026-11-07-fwgap.md) — 12 组定向查询，524 个新仓库 / 5 个候选；无成熟新后端。
- [2026-11-07 首期周报](tool-radar/WEEKLY-2026-11-07.md) — 43 个工具的汇总：5 PILOT、13 WATCH、7 REFERENCE、16 CATALOG、2 REJECT；含覆盖矩阵与下周计划。

**数据：** [ledger.json](tool-radar/ledger.json)（43 个工具的对象/场景/结论/证据） · [COVERAGE.md](tool-radar/COVERAGE.md)（对象×章节矩阵）。
