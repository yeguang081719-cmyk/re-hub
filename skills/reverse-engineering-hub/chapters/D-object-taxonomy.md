# 附录 D 对象分类 × 静态/动态/UI 链路矩阵

> 先判断「要逆向的是什么对象」，再决定「用静态 / 动态 / UI 哪种链路」。
> 工具入口：`rehub_classify`（单独分类）、`rehub_route`（路由里同时带对象与三条模式链路）、
> `rehub_plan { objectType, subtype, mode }`（按对象+模式出可执行步骤）。

## D.1 四类对象（服务菜单口径）

| 类别 | 包含 | 典型目标 | 默认子类 |
|---|---|---|---|
| **网站逆向** | 前端源码、接口 API、网页功能复现 | URL、.js/.html、.har | web-sign / web-frontend / web-api |
| **App 逆向** | Android APK、iOS、微信小程序 | .apk/.aab/.so、.ipa、.wxapkg | android / ios / miniprogram |
| **软件逆向** | Windows EXE、DLL、桌面程序 | .exe/.dll/.sys、.asar、.dmg/.elf、.bin | windows-native / dotnet / electron / desktop-other / firmware |
| **AI 自动化逆向** | MCP、Agent、AI 反编译 | 任务本身是"用 AI/MCP 自动化" | mcp-pipeline / agent-loop / ai-decompile |

对象类别与「场景（scenario）」是**两个正交维度**：
- scenario 回答「这活像哪一类任务」（原生静态、APK 静态、动态分析、UI 逆向……）；
- objectType 回答「目标是哪种对象」，并据此给出静态/动态/UI 三条链路。
`route` 会同时返回两者；`classify` 只返回对象 + 三条链路。

## D.2 识别信号（从强到弱）

1. **target 扩展名**（最强）：`.apk/.aab/.so`→android；`.ipa`→ios；`.wxapkg`→miniprogram；`.exe/.dll/.sys`→software；`.asar`→electron；`.dmg/.app`→desktop-other；`.bin/.img/.rom`→firmware；`.js/.html`→web。
2. **URL**（`http(s)://` 或 `www.`）→ web。
3. **短语/关键词**：如"签名/加密参数"→web-sign；"c#/.net/ilspy"→dotnet；"x64dbg/断点/脱壳"是**方法**不是对象，仍归 software；"MCP/Agent/批量自动化"→ai-automation。
4. **弱输入**（只有"帮我看看"）：返回 `unknown` + 澄清问题，**不要瞎猜链路**。

> `ai-automation` 是"怎么做"的意图，不是目标本身：分类结果会额外给出 `underlying`
> （底层对象，比如"用 MCP 自动化分析 exe" → underlying=software）。

## D.3 链路矩阵（对象 × 模式）

| 对象 / 子类 | 静态 static | 动态 dynamic | UI ui |
|---|---|---|---|
| 网站（web） | 04：CDP 抓 bundle + JS 断点/hook | 05：页面被动观察 + 截图 | 15：DOM/CSS 结构 → clean-room 原型 |
| Android（app/android） | 02：jadx/apktool 反编译 | 03：adb + Frida（raw 传 hook 脚本） | 15：adb 截图 + `uiautomator dump` |
| iOS（app/ios） | 10→01：IPA 解包 + Mach-O | 14（受限）：Frida 需越狱设备 | 受限：Xcode/截图人工采集 |
| 微信小程序（app/miniprogram） | 10：wxapkg 包 + JS bundle | 05：开发者工具 CDP | 15：WXML/WXSS 结构 → 原型 |
| Windows 原生（software/windows-native） | 01：rea + Ghidra | 14：x64dbg + pe-sieve | 15：UIA 控件树 + 截图 |
| .NET（software/dotnet） | 07：托管元数据/CIL | 14：进程/内存侧证据 | 15：WinForms/WPF UIA |
| Electron（software/electron） | 06：ASAR/应用图 | 05：渲染进程 CDP（主进程可 14） | 15：DOM 高保真 |
| macOS/Linux（software/desktop-other） | 01/10 | 受限（需目标系统 lldb/gdb） | 受限（系统截图/辅助功能） |
| 固件（software/firmware） | 08：区域识别 + 提取 | 需设备/QEMU（不在网关内） | 不适用 |
| AI 自动化（ai-automation） | 01：MCP 批量 analyze/decompile | 14：调试器/内存 dump 自动化 | 15：UIA 批量采集 |

章节号对应本书正文章节；每格的具体步骤以 `rehub_classify` / `rehub_plan` 返回的 `steps` 为准。

## D.4 标准动作（顺序）

1. `rehub_detect`：本机后端可用性（静态/动态/UI 各自的前置工具）。
2. `rehub_classify`（或 `rehub_route`）：拿到 `objectType` + `subtype` + 三条 `chains`。
3. **选模式**：静态打底 → 动态验证/脱壳 → UI 复现（可组合，不必全做）。
4. `rehub_plan`：`{ objectType, subtype, mode }` 或 `{ scenario }` → 每步 backend/op/args。
5. `rehub_exec` 逐步执行；每步 `rehub_evidence append`。
6. 交付：区分 observed / inferred / unknown；UI 原型注明 clean-room。

## D.5 组合与边界

- **静态优先**：先拿结构（函数/类/接口/控件），再用动态验证关键路径；UI 复现放最后。
- **动态受限**：Medium（未提权）会话 pe-sieve 会 Access Denied；x64dbg 只能调试自己启动的进程；Android 动态需 adb+frida。
- **不要跨类硬套**：Android 的 UI 用 `uiautomator dump`，不是 Windows UIA；iOS/固件没有现成 UI 后端，按"受限"标注。
- **AI 自动化不等于跳过对象判断**：先知道 underlying 是网站/App/软件，再谈自动化。
- **clean-room**：结构可参考，专有 CSS/字体/图片/资源不要拷进交付物。

## D.6 证据要记什么

- 分类依据：命中的扩展名/URL/短语（`reasons`），置信度（high/medium/low）。
- 选择的模式与理由：为什么先静态/动态/UI；跳过的模式要写原因。
- 每步 backend/op 输出定位；UI 截图路径与控件树节点数。
- 未解释的行为、缺失后端、受限链路 → `unknown`，不要当作"已恢复"。
