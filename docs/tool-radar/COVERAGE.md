# RE Hub 覆盖矩阵（自动生成）

> 数据源：`ledger.json`，已评估 43 个工具；生成时间 2026-11-07 10:37 UTC。

**结论分布：** PILOT 5 · WATCH 13 · REFERENCE 7 · CATALOG 16 · REJECT 2

> 对象按出现次数统计，一个工具可属于多个对象（如“软件 + App/Android”），所以对象合计 > 工具数。

## 对象覆盖

| 对象 | 数量 | PILOT | WATCH | REFERENCE | CATALOG | 代表工具 |
|---|---:|---:|---:|---:|---:|---|
| App/Android | 12 | 2 | 6 | 2 | 2 | MG1937/rust_ASC, suffixing/apkscope, Zfinix/eleven, openbin-ai/binny |
| 软件/原生 | 11 | 1 | 4 | 0 | 5 | VAHPEM/rust-deobf, x86rc/unthemidator, Altumptic/paranoia, A-new/aidbg |
| 多对象 | 8 | 1 | 2 | 3 | 2 | Zfinix/eleven, openbin-ai/binny, nanashili/rea-rust, Wholiver/metis-reverse |
| 网站/Web | 5 | 1 | 1 | 2 | 1 | nanashili/rea-rust, Wholiver/metis-reverse, cipherwire/webcrypto-interceptor, EdgeAgent/WRECK |
| 软件/固件 | 4 | 0 | 1 | 1 | 2 | aleph-void/Ghidra-Rare, jawadahmadliaqat-dot/Firmware-Liberation-Engine, christopherowen/dgx-spark-firmware-emulator, DroidKali/iot-firmware-vuln-hunting |
| App/iOS | 3 | 0 | 3 | 0 | 0 | Wtrwx/vesper, bmcreations/loupe, bandada-labs/agent-ddp |
| AI 自动化 | 2 | 0 | 0 | 2 | 0 | Fanqi89/dsh-rea, SamH135/rlvr-reverse-engineering |
| 软件/Electron | 2 | 0 | 0 | 0 | 2 | loyalchiiina/dsh-asar-patch, mackyuqimack/cdp-inject |
| 硬件/驱动 | 1 | 0 | 0 | 0 | 1 | cschalle/hw-harness |
| 防护/对抗 | 1 | 0 | 0 | 0 | 0 | qybaihe/bla |
| 软件/.NET | 1 | 1 | 0 | 0 | 0 | jumpifequal/mcp-dotnet |
| 未分类 | 1 | 0 | 0 | 0 | 1 | mohith-labs/proxypin |

## 章节覆盖

| 章 | 数量 | 工具 |
|---|---:|---|
| 01 | 15 | VAHPEM/rust-deobf, Zfinix/eleven, openbin-ai/binny, Altumptic/paranoia, nanashili/rea-rust, Wholiver/metis-reverse, nautilusbits/retrokit, aleph-void/Ghidra-Rare, JoasASantos/Malvex, MarketKernel/html-disasm, i12bp8/decomp.wtf, oscarsantanaarias/IDA-Ghidra-bridge, tcmmm/dump-tool, qsnbdwdx/ghidra-macos-arm64, jumpeip/ghidrallm-mcp |
| 02 | 10 | MG1937/rust_ASC, suffixing/apkscope, Zfinix/eleven, openbin-ai/binny, Huai-Tian/Exuvia, LSPosed/dexsql-release, nanashili/rea-rust, JoasASantos/Malvex, Mcsd7/ReaDroid, inclusivnp-max/clazzpatcher |
| 03 | 6 | suffixing/apkscope, Huai-Tian/Exuvia, yuxiaole-bili/dsh-apk-vm, bmcreations/loupe, tcmmm/dump-tool, bandada-labs/agent-ddp |
| 04 | 4 | nanashili/rea-rust, Wholiver/metis-reverse, cipherwire/webcrypto-interceptor, EdgeAgent/WRECK |
| 05 | 3 | cipherwire/webcrypto-interceptor, EdgeAgent/WRECK, ELEboysss/EleScrape |
| 06 | 4 | nanashili/rea-rust, JoasASantos/Malvex, loyalchiiina/dsh-asar-patch, mackyuqimack/cdp-inject |
| 07 | 2 | nanashili/rea-rust, jumpifequal/mcp-dotnet |
| 08 | 5 | aleph-void/Ghidra-Rare, JoasASantos/Malvex, jawadahmadliaqat-dot/Firmware-Liberation-Engine, christopherowen/dgx-spark-firmware-emulator, DroidKali/iot-firmware-vuln-hunting |
| 09 | 5 | JoasASantos/Malvex, cschalle/hw-harness, cipherwire/webcrypto-interceptor, ELEboysss/EleScrape, mohith-labs/proxypin |
| 10 | 6 | suffixing/apkscope, Wtrwx/vesper, figurophobia/gore, MarketKernel/html-disasm, Mcsd7/ReaDroid, inclusivnp-max/clazzpatcher |
| 11 | 3 | JoasASantos/Malvex, cschalle/hw-harness, sheloab/malware-detonation-lab |
| 12 | 5 | VAHPEM/rust-deobf, openbin-ai/binny, JoasASantos/Malvex, sheloab/malware-detonation-lab, DroidKali/iot-firmware-vuln-hunting |
| 13 | 0 | **—** |
| 14 | 5 | Wtrwx/vesper, x86rc/unthemidator, Zfinix/eleven, Altumptic/paranoia, A-new/aidbg |
| 15 | 4 | yuxiaole-bili/dsh-apk-vm, bmcreations/loupe, EdgeAgent/WRECK, bandada-labs/agent-ddp |

## 缺口

- **0 个已评估工具：** 13
- **仅 1 个：** 无
- **没有章节归属：** Fanqi89/dsh-rea, qybaihe/bla, SamH135/rlvr-reverse-engineering

> 13 是 triage 章，0 个工具属正常；05 的“有工具”不等于“有成熟工具”，要看 verdict 分布。
## 使用方式

- 每日报告引用本矩阵，避免只盯“01/02 原生/Android”而忽略 04/05/06/07/08/09/13/15。
- 缺口章节优先加对应查询（Web/JS、pcap、Electron、.NET、固件、UI），但不为填空降低采纳标准。
- 本文件是快照；每次 ledger 变更后重跑 `node coverage.mjs ledger.json COVERAGE.md`。