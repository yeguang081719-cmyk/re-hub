# RE Hub 工具雷达 · 2026-11-07 补扫（按对象缺口）

> 首期 29 组查询按 star 排序，头部自然偏向“原生 + Android 静态”。  
> 补扫专门打首期覆盖弱的方向：**.NET、Electron、抓包、Web/JS、UI、固件、iOS、硬件**。  
> 8 组查询 → 304 个未入 `seen` 的仓库 → 109 个候选；4 个进入评估，其余多为低星/输出型/噪声。

---

## 0. 补扫结论

1. **`.NET` 找到可用候选：`jumpifequal/mcp-dotnet`。** 0★ 但有 v2.0.0 release、MIT、36 个 MCP 工具，dnlib + ILSpy，能读元数据/IL/反编译、扫敏感 API，还能**改 IL 并保存**。它补的是第 07 章“能看不能改”的空白。
2. **Android 动态/UI 有两条新路：`dsh-apk-vm`（本地 root AOSP VM）和 `loupe`（设备串流 + 可访问性树 + MCP）。** 前者让没有真机也能跑 APK/看 UI；后者把“人机共驾”做成 claim/hand-off 模型。
3. **Electron 补丁找到 `dsh-asar-patch`：** 等长就地改 `app.asar` + 同步 integrity hash，不重打包。场景很窄，但第 06 章确实缺“改”的能力。
4. **Web/JS、固件、抓包仍没有“新且专用”的工具。** 抓包侧多是通用 pcap 分析器，固件侧只有 Ghidra 扩展；这两个方向下一轮要继续盯，但不要为了填空降低标准。

---

## 1. `jumpifequal/mcp-dotnet` — .NET 的“可读可改”MCP

**是什么** `[观察]` 0★，MIT，v2.0.0（2026-10-11），创建 2026-10-11；README 说明它是 `neoz/mcp-dotnet (MCPPOC)` 的 fork。`[推断]` 基于 dnlib + ILSpy：36 个 MCP 工具，覆盖程序集/类型/方法/字段/属性/事件/资源、调用者/被调用者/字段读写/类型引用、IL 反汇编、控制流图（Mermaid）、ILSpy 反编译、敏感 API 扫描（动态加载/注入 P/Invoke/进程/网络/加密/注册表/反序列化/反调试/键盘记录）、混淆器识别；支持 IL 替换/插入/删除/NOP/整方法体替换/重命名并保存；stdio + Streamable HTTP，`--read-only` 可移除写工具。

**对象 / 场景**
- objectType：`software` / subtype `dotnet`
- 场景：**07-dotnet**（静态）；补丁能力服务第 12 章（补丁对比/修复）
- 最适合：C#/.NET 桌面程序、Unity 的托管层（Mono/IL2CPP 的 C# 部分）、需要“改名去混淆 + 改 IL 验证”的授权样本。

**优势**
- 正好补第 07 章：re-hub 现有 `rea inspect-managed-*` 能读，但没有“IL patch + 保存 + 立即反编译验证”的闭环。
- 36 个工具、MCP 原生、只静态不执行；支持 read-only，权限边界清楚。
- 安全 API 扫描 + 混淆器识别对恶意 .NET 样本的分诊有用。
- 有 release 包（安装脚本），不是只能源码跑。

**劣势 / 边界**
- **0★**、fork 项目；上游/本 fork 的长期维护未知。
- 需要 .NET 10 SDK；console/安装脚本偏 Windows。
- 只有静态：不跑样本、不做动态 hook；IL2CPP 的 native 部分不覆盖。
- 改 IL 属于“修改样本”，必须限定自有/授权文件，并保留原始副本。

**结论：PILOT。** 接入成本低（可直接作为 `mcpBackends` 注册），先在一个授权 .NET 样本上验证：`load_assembly → decompile → scan_suspicious_apis → rename → save → 再反编译`。若稳定，写进第 07 章“MCP 可选后端”。

---

## 2. `yuxiaole-bili/dsh-apk-vm` — 没有真机也能跑 Android

**是什么** `[观察]` 1★，Apache-2.0，v0.11.1（2026-11-04），DSH 插件（npm `dsh-apk-vm`）。`[推断]` 启动本地 AOSP Android 14（API 34，x86_64）`userdebug` VM，自动 `adb root`；用 scrcpy H.264 + WebCodecs 把画面串到 DSH 侧边栏（最高 60fps），支持点击/滑动/按键/文本；提供 `apk_vm` Agent 工具（安装/启动/UI 树/输入/日志/截图/录屏/性能快照/多实例），以及 WebView CDP、UIAutomator Inspector、录制回放、端口转发/代理/CA 安装。

**对象 / 场景**
- objectType：`app` / `android`
- 场景：**03-android-dynamic**（动态）、**15-ui**（控件树/截图/交互）
- 最适合：没有物理 Android 设备，但需要“装起来、点进去、看 UI 树、抓日志/截图”的授权 APK 分析。

**优势**
- 把“Android 动态”从“必须 adb + 真机 + frida”降到“一台有虚拟化的机器”。
- root + UIAutomator + CDP 三件套，正好覆盖 re-hub 第 03/15 章最缺的“看 UI、点控件、拿树”。
- Agent 工具面很完整（多实例、录制回放、网络/CA），不是玩具。
- Apache-2.0；Windows x64/Linux x86_64 已验证。

**劣势 / 边界**
- **DSH 专用插件**，不是 MCP/通用后端；接进 re-hub 需要另写 adapter 或复用其 HTTP API。
- 重：每个 VM 约 2.5GB RAM，默认允许多开 3 个；x86_64 AVD 跑不了 ARM-only 原生库。
- root 设计 → 安全边界等同“root 设备”，不能放敏感数据。
- 1★、0.11.x；macOS 只做探测/CI，没有 live 验证。

**结论：WATCH（可作为 Android 动态的参考实现）。** 如果你的工作流在 DSH 里，它能直接补“无设备动态/UI”；如果要把能力接进 re-hub，优先复用它的“AVD + root + UIAutomator + CDP”组合，而不是整插件依赖。

---

## 3. `bmcreations/loupe` — 设备串流 + 人机共驾

**是什么** `[观察]` 11★，Apache-2.0，v0.2.0（2026-11-03），Go 单二进制，macOS host。`[推断]` 把 Android 真机/AVD、iOS 模拟器串流到浏览器（WebTransport/WebSocket，60fps），提供可访问性树、按文本/id/desc 点击、滑动/输入/按键、截图/日志/崩溃/APK 安装；对 Agent 提供 CLI/MCP/HTTP，并有 claim / human-hold / flag 的“人机共驾”协议。

**对象 / 场景**
- objectType：`app` / `android` + `ios`（模拟器）
- 场景：**03**（动态交互）、**15**（UI 树/控件）
- 最适合：需要“人看着 agent 操作设备、随时接管”的 UI 复现/自动化调试。

**优势**
- 把“UI 树 + 交互 + 截图 + 多设备”做成一个统一服务，MCP/CLI/HTTP 都能驱动。
- claim/human-hold 模型解决了“agent 和人在同一台设备上打架”的问题，值得 re-hub 第 15 章借鉴。
- Apache-2.0、Go 单二进制、活跃（当天 push）。

**劣势 / 边界**
- host 限 macOS；iOS 真机只是 preview，输入还不完整。
- 不是逆向分析器：不做反编译/脱壳/协议；只解决“看和点”。
- 0.2.0；token 全权限、无 scope，暴露端口要谨慎。

**结论：WATCH。** 作为第 15 章“UI 交互/人机共驾”的参考；如果 re-hub 未来做 UI 复现，优先借鉴它的 claim/hand-off 协议，而不是直接依赖 macOS 服务。

---

## 4. `loyalchiiina/dsh-asar-patch` — Electron 的等长就地补丁

**是什么** `[观察]` 0★，MIT，无 release，创建 2026-10-20。`[推断]` Node 脚本：对 Electron `app.asar` 做“等长就地覆写” + 替换 header 里的 integrity hash；校验 fuse（`embeddedAsarIntegrityValidation`）、自动备份、全量 integrity 校验、支持运行中写入；限制是新内容必须与原条目**字节数完全相同**，不能新增/删除文件。

**对象 / 场景**
- objectType：`software` / subtype `electron`
- 场景：**06-electron**（静态/补丁）
- 最适合：只想改 asar 里某个 bundle 的少量字节、不想重建 180MB 包、需要可回滚的场景。

**优势**
- 补第 06 章“能拆不能改”的空白：等长补丁 + hash 同步 + 备份/校验，工程细节（dataOffset、`\0` 填充、短读）写得很实。
- 不重打包、偏移不变、可回滚；对授权客户端做小改动很实用。
- MIT，脚本独立，容易抽取方法。

**劣势 / 边界**
- **等长约束**很硬：加逻辑要先减字节；不能新增/删除文件。
- 0★、无 release、单人脚本；只验证了 DSH 桌面端一类目标。
- 改的是安装目录，应用升级会覆盖；需要重跑。
- 不解决“分析”，只解决“改”；分析仍要靠第 06 章的 asar 解包/JS 阅读。

**结论：CATALOG。** 把“等长补丁 + integrity 同步 + 备份/校验”的方法写进第 06 章即可，不必作为默认后端。

---

## 5. 覆盖矩阵（补扫后）

| 对象 | 首期覆盖 | 补扫后 | 缺口 / 下一步 |
|---|---|---|---|
| 软件 / 原生 | 强（01/14） | 强 | 无；继续盯 Rust/VMProtect |
| App / Android 静态 | 强（02） | 强 | 无；rust_ASC/apkscope/dexsql 三选一 |
| App / Android 动态 + UI | 弱（03/15） | 中（dsh-apk-vm/loupe） | 仍需真机/AVD；优先补“无设备”路径 |
| App / iOS | 弱（10/14） | 弱（vesper WATCH） | 越狱设备是硬门槛 |
| 网站 / Web-JS | 弱（04/05） | 弱 | 本期没有“新且专用”的工具 |
| .NET | 弱（07） | 中（mcp-dotnet） | 需授权样本验证 IL patch |
| Electron | 弱（06） | 中（dsh-asar-patch） | 只补“改”，分析仍靠现有链路 |
| 固件 | 弱（08） | 弱（Ghidra-Rare） | 缺提取/仿真；继续盯 |
| 抓包 / 协议 | 弱（09） | 弱 | pcap 工具多，但非逆向专用 |
| AI 自动化 | 拥挤 | 拥挤 | metis/dsh-rea/binny/eleven 同层竞争 |

**判断：** 下一阶段的扫描权重要放在 **03 / 04 / 05 / 06 / 07 / 08 / 09 / 15**；但“补缺口”不等于“降低标准”，0★ 工具最多进 WATCH/PILOT，不直接进默认链路。

---

## 6. 对每日扫描的调整

首期 29 组 + 补扫 8 组 → 每日固定 **38 组**，新增：

```
dotnet reverse
electron asar
pcap analysis
webassembly reverse
javascript deobfuscation
topic:ui-automation
firmware extraction
topic:ios-reverse-engineering
topic:hardware-hacking
```

（其中 iOS/硬件两组首期已规划；`.NET/Electron/抓包/Web/UI/固件` 是本次补扫验证有效后固化。）

---

## 7. 补漏（首期分类器修复后）

首期 `merge.mjs` 的 `classify()` 读的是 `full_name/description`，而合并后的记录字段是 `repo/desc`，导致首期分类实际上主要按 topics + star 排序，漏掉 3 个高星工具。修复后补录：

| 工具 | ★ | 对象 | 场景 | 许可 | 结论 | 一句话 |
|---|---:|---|---|---|---|---|
| [ReaDroid](https://github.com/Mcsd7/ReaDroid) | 106 | App/Android | 02/10 | MIT | CATALOG | Termux 上的 APK 静态 + 重打包/签名工具箱；JADX/apktool 的封装 |
| [IDA-Ghidra-bridge](https://github.com/oscarsantanaarias/IDA-Ghidra-bridge) | 73 | 软件/原生 | 01 | 无 | WATCH | IDA/Ghidra 的 TCP JSON 桥（39 命令）；跨反编译器互操作 |
| [dump-tool](https://github.com/tcmmm/dump-tool) | 67 | App/Android (il2cpp) | 01/03 | MIT | CATALOG | il2cpp dump.cs 浏览/翻译/Hook 生成 + 30 个 MCP 工具 |

**影响：** 首期“672 粗判”与 top-120 排序偏 topics；8 个深评结论不受影响（都在首期 top 50，已人工读 README）。后续 daily 用修复后的 `repo/desc` 分类。

## 8. 证据与边界

- 本期所有“能力”描述来自 README，未跑通；只有元数据（stars/license/release/created）是 `[观察]`。
- `mcp-dotnet` 的 36 工具、`dsh-apk-vm` 的 60fps/root、`loupe` 的 claim 协议、`dsh-asar-patch` 的等长补丁，都需要在授权样本/隔离环境复现后才能升级为 `[观察]`。
- 不把“0★ 但 README 很全”当成质量；这四个里只有 `mcp-dotnet` 值得先做接入试验。
