---
name: reverse-engineering-hub
description: 逆向工程操作手册（RE Hub 版）。当用户要逆向/反编译/破解/脱壳/还原算法或签名/分析 APK·SO·exe·dll·ELF·Electron·.NET·固件·抓包/定位加密参数/写 hook 时使用。先 rehub_detect 侦察，再用 rehub_classify 判断对象是网站/App/软件/AI 自动化并拿到静态/动态/UI 三条链路，然后用 rehub_route 定位章节（返回 chapter）、rehub_book 只读那一章，按章内链路执行并记录证据。低置信度必须先向用户澄清。
metadata:
  version: "2"
  mcp_server: rehub
  structure: book
---

# 《逆向工程操作手册（RE Hub 版）》

**名称**：逆向工程操作手册 · RE Hub 版
**版本**：2.2（2026-11-07）
**配套**：MCP 网关 `rehub`（`mcp__rehub__detect / classify / route / plan / exec / mcp / evidence / verify / book / install`）+ 本机 REA 6.4.0 / Ghidra 12.1.4 / JADX 1.5.6 / apktool 3.0.3；动态/UI 后端：x64dbg / Frida / pe-sieve / UIA（控件树）。

## 简介（这本书解决什么）

逆向任务最大的浪费不是"不会分析"，而是**一开始就选错链路**：拿 APK 当原生二进制啃、拿网页当客户端拆、
拿混淆脚本硬读。这本书把逆向拆成 **15 个可识别场景 + 5 个附录**，每个场景一章，
每章都写清：**什么信号触发它 → 进来先问什么 → 按什么顺序调什么工具 → 记什么证据 → 怎么交付**。

另有两个**正交维度**：
- **对象分类**（附录 D）：先判断目标是**网站 / App / 软件 / AI 自动化**，再分配**静态 / 动态 / UI** 三条链路；
- **任务/验证**（附录 E）：`plan` 产出可版本化任务图（taskId/stepId），`exec` 记录步骤状态，
  `evidence` 区分观察与结论，`verify` 做执行/事实/交付三层校验。**执行成功 ≠ 事实成立**。

它同时是一本**工具书**，不是小说：
- 你不需要从头读；先看目录/索引定位到章，再只读那一章。
- 每章都能独立执行，不依赖其他章的上下文。
- 章内所有命令都是本机可直接跑的真实命令（后端缺失时会明确说缺什么）。

**使用前提**：只分析自有或已获授权的软件；商业工具（IDA/Hex-Rays/Binary Ninja/JEB）需自备授权。

## 目录

| 章 | 标题 | 一句话 | 典型触发词 |
|---|---|---|---|
| [00](chapters/00-how-to-use.md) | 使用说明 | 三分钟学会这本书怎么查、怎么用 | 第一次使用 / 不确定怎么做 |
| [01](chapters/01-native-binary.md) | 原生二进制 | exe/dll/so/ELF：函数、反编译、字符串、xref、补丁 | 反编译、汇编、函数、二进制、dll、so、exe |
| [02](chapters/02-android-static.md) | Android 静态 | APK：Manifest、类/方法、资源、签名校验、加固 | apk、安卓、dex、smali、脱壳前侦察 |
| [03](chapters/03-android-dynamic.md) | Android 动态 | Frida hook、内存 dump、反检测、运行时采样 | 动态、hook、脱壳、内存 dump、反调试 |
| [04](chapters/04-web-js.md) | Web/JS 逆向 | 前端签名、加密参数、断点、Hook、混淆还原、反爬 | js 逆向、签名算法、加密参数、反爬、token |
| [05](chapters/05-web-runtime.md) | Web 运行时观察 | 已打开页面/网站：脚本、网络、存储、截图（被动） | 页面分析、网站分析、网络请求、CDP |
| [06](chapters/06-electron.md) | Electron/桌面 JS | asar、模块、IPC、preload、原生插件边界 | electron、asar、桌面客户端、ipc |
| [07](chapters/07-dotnet.md) | .NET/托管 | 元数据、CIL、引用、P/Invoke 边界 | .net、C#、IL、程序集、dnspy、unity |
| [08](chapters/08-firmware.md) | 固件/镜像 | 区域识别、提取文件系统、交给原生链 | 固件、firmware、路由器、IoT、squashfs |
| [09](chapters/09-capture.md) | 抓包/协议 | HAR、pcap、WebSocket 帧：端点、字段、重放 | 抓包、har、pcap、报文、流量、协议 |
| [10](chapters/10-artifact.md) | 安装包/归档 | APK/IPA/MSIX/DMG/ZIP 清单、哈希、安全提取 | 安装包、解包、归档、ipa、msix、dmg |
| [11](chapters/11-process.md) | 进程行为 | PTY 捕获、交互、退出码、文件系统观察、对比 | 行为、黑盒、进程、启动参数、退出码 |
| [12](chapters/12-vuln.md) | 漏洞研究/补丁 | 缓解措施、攻击面、崩溃/core、补丁对比 | 漏洞、0day、fuzz、崩溃、core、补丁对比 |
| [13](chapters/13-triage.md) | 分诊 | 信息不足时先问什么，怎么不硬猜 | 说不清目标 / 只有一句话需求 |
| [14](chapters/14-dynamic.md) | 动态分析 | 断点、单步、hook、trace、内存 dump；VMProtect/脱壳场景 | 动态调试、下断点、hook、脱壳、内存 dump |
| [15](chapters/15-ui.md) | UI 逆向 | 控件树、截图、CEF DOM、复现分级、clean-room 原型 | UI 逆向、界面还原、控件树、复刻界面 |
| [A](chapters/A-evidence.md) | 证据与交付 | 记录格式、observed/inferred/unknown、报告模板 | 写报告、验收、复盘 |
| [B](chapters/B-backends.md) | 后端与依赖 | 每个后端状态、命令、缺失怎么装 | 环境报错、工具缺失 |
| [C](chapters/C-pitfalls.md) | 坑与故障排查 | 真实踩过的坑与修复 | 报错、跑不通、结果可疑 |
| [D](chapters/D-object-taxonomy.md) | 对象分类 × 模式矩阵 | 网站/App/软件/AI 自动化 → 静态/动态/UI 链路 | 先分类对象、选静态还是动态、UI 复现 |
| [E](chapters/E-task-verify.md) | 任务状态、能力与验证 | taskId/stepId、能力回退、证据/Claim、三层验证、停止条件 | 重规划、失败恢复、结论是否可信、怎么验收 |

## 快速索引

### 按目标形态

| 手里是什么 | 去读 |
|---|---|
| 不确定对象类别（网站/App/软件/AI 自动化） | `rehub_classify` + 附录 D |
| `.exe` `.dll` `.sys` `.so` `.elf` `.dylib` `.macho` | 第 01 章 |
| `.apk` `.xapk` `.aab` `.apks` | 第 02 章（要动态叠加第 03 章） |
| `.js` `.html` / 一个网站的前端 | 第 04 章 |
| 已经打开的浏览器页面 | 第 05 章 |
| `.asar` / Electron 安装目录 / 桌面客户端 | 第 06 章 |
| `.dll` `.exe` 且是 C#/.NET/Unity 托管 | 第 07 章 |
| `.bin` `.img` `.rom` `.trx` 固件 | 第 08 章 |
| `.har` `.pcap` `.pcapng` `.saz` | 第 09 章 |
| `.zip` `.ipa` `.msix` `.dmg` `.jar` 安装包 | 第 10 章 |
| 没有文件、只有可运行程序 | 第 11 章 |
| core dump / 补丁前后两个版本 | 第 12 章 |
| 程序要跑起来才看得懂 / 被 VMProtect 加壳 | 第 14 章 |
| 要复刻界面 / 看控件树 / 菜单结构 | 第 15 章 |
| 什么都说不清 | 第 13 章 → 问清楚后再回来 |

### 按用户说法（症状）

| 用户说 | 去读 |
|---|---|
| "这个登录参数怎么加密的 / sign 怎么算的" | 04 → 必要时 09 |
| "帮我反编译这个 exe / 看看某功能怎么实现" | 01 |
| "这个 APK 用了什么壳 / 加固了吗" | 02 → 03 |
| "APK 里的 so 怎么调" | 02 找到 so → 01 |
| "这个网站怎么反爬的 / 滑块怎么过" | 04 |
| "把抓到的包分析一下" | 09 → 04 |
| "客户端里的协议/加密怎么找" | 06 → 04/01 |
| "这个 Unity 游戏逻辑" | 01（il2cpp）→ 07（C# 部分） |
| "路由器固件里有什么" | 08 → 01 |
| "这个 dll 是不是后门 / 有什么行为" | 07/01 → 11 |
| "这个漏洞怎么复现 / 补丁改了什么" | 12 |
| "用 x64dbg/frida 调试一下 / 被 VMProtect 保护怎么脱" | 14 |
| "把它的界面/控件树导出来，复刻 UI" | 15 |
| "先看看这是什么文件/包" | 10 → 再跳转 |

### 按产出

| 要产出 | 推荐路径 |
|---|---|
| 功能说明 | 01/02/06 概览 → 定点函数 |
| 算法/参数还原 | 04（Web）或 01（原生）→ 用真实输入验证 |
| 脱壳后的代码 | 03 → 02/01；VMProtect → 14 |
| UI 原型 / 界面复刻 | 15 + 附录 A |
| 可运行重实现 | 01/04 拿到伪代码/算法 → 正常编码 → 对拍 |
| 补丁/修复 | 12 |
| 漏洞报告 | 12 + 附录 A |
| 一份可复核的报告 | 任何章 + 附录 A |

## 怎么用这本书（标准动作）

1. **侦察**：`rehub_detect` → 看可用后端与缺失项。缺失项可自动下载：
   `rehub_install { only:["jadx","apktool"], dryRun:false }`（官方 GitHub release + sha256；默认 dry-run）。
2. **对象分类（先定"是什么"）**：`rehub_classify { task, target }` →
   返回 `objectType`（网站 / App / 软件 / AI 自动化）+ `subtype` + **static / dynamic / ui 三条链路**。
   - 对象类别由 target 扩展名/URL/短语判定；弱输入返回 `unknown` → 按第 13 章问清楚。
   - 链路矩阵见 **附录 D**；`AI 自动化` 会额外给 `underlying` 底层对象。
3. **定位章节**：`rehub_route { task, target }` → 返回 `scenario` 和 `chapter`（如 `04-web-js`），
   并附带上面的 `object` 与 `modes`（每条模式链路带 chapter/就绪状态）。
   - `confidence=low` 或 `scenario=triage` → **先按第 13 章问用户**，不要硬选。
4. **读那一章**：`rehub_book { chapter: "<route 返回的 chapter>" }` 取正文。
   - 等价于直接读 `chapters/<chapter>.md`（本 skill 目录下）。
5. **出计划并执行**（v2 任务图）：
   - 出计划：`rehub_plan { scenario, target }` 或 `rehub_plan { objectType, subtype?, mode, target }`；
     返回 `taskId`、`planVersion`、每步 `stepId/capability/sideEffects/availability/expectedEvidence` 与 `stopConditions`。
   - 执行：`rehub_exec { taskId, stepId }`（有副作用的步骤加 `confirm:true`）。失败看返回的 `recovery`
     （transient→retry / missing-capability→换能力 / authorization→停）并可用 `rehub_plan { taskId, fromStep, changeReason }` 局部重规划。
   - 也可不用 taskId，按旧方式 `rehub_exec { backend, op }` 一次性执行。
6. **记证据与结论**：观察用 `rehub_evidence action=append`（带 taskId/stepId/artifactRef，自动算 sha256）；
   结论用 `action=claim`（kind=observed/inferred/unknown + evidenceRefs）。
7. **验证与报告**：`rehub_verify { taskId }` 做 execution / fact / delivery 三层校验；
   `rehub_evidence action=report { taskId }` 出证据驱动报告（附录 A/E）。

**三条铁律**

- 不知道目标形态就**先问**（第 13 章），不要猜。
- **先分类对象，再选静态/动态/UI**（附录 D）；不要把一种对象的链路硬套到另一种对象。
- **执行成功 ≠ 事实成立**：没有 observation 证据的结论只能是 `inferred`/`unknown`，用 `rehub_verify` 检查后再交付。
- 没跑成功就**不要**给"看起来像"的结论；没验证的写成 `unknown`。
- 只做**有授权**的目标；不提供绕过他人软件保护的帮助；安装工具需显式 `authorize:true`。
- 动态分析（第 14 章）只在隔离的授权环境做；dump/hook 不碰生产数据。
- UI 原型（第 15 章）坚持 clean-room：不拷贝专有 CSS/字体/图片。

**章节文件在哪**

- 已安装：`C:\Users\Administrator\.agents\skills\reverse-engineering-hub\chapters\`
- 项目源：`D:\work\deepseekhharness\re-hub\skills\reverse-engineering-hub\chapters\`
- 不想记路径就调 `rehub_book`，它按章名返回正文。
