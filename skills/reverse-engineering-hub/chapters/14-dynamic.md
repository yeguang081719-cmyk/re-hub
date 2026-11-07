# 第 14 章 动态分析 / 运行时追踪

> 静态走不动时（VMProtect/混淆/加密字符串），把程序跑起来看：断点、单步、hook、trace、内存 dump。

## 什么时候进这一章

- 静态分析受阻：主程序被 **VMProtect** 保护（`.vmp0–3` 段、高熵、几乎无明文串）、代码虚拟化、字符串加密；
- 需要确认某个功能**实际调用了什么**（菜单点击 → 实际函数链）；
- 需要脱壳：dump 内存镜像再回静态；
- 用户说：动态调试、下断点、单步、trace、hook、内存 dump、脱壳、反调试、跑起来看。

## 进来先问自己 3 个问题

1. **能跑吗**？需要可运行许可 + 授权环境；VMProtect 目标常带反调试，先准备 ScyllaHide/HyperHide。
2. **要"看"还是"抓"**？看行为用 x64dbg/Frida；抓证据用 TTD 录制 + pe-sieve dump。
3. **有没有符号/模块边界**？无符号时靠 API 断点（CreateFile/RegOpenKey/网络 API）和字符串 xref 定位。

## 链路（按顺序）

| 步 | 动作 | 调用 |
|---|---|---|
| 1 | 确认调试器 | `rehub_exec { backend:"x64dbg", op:"info" }` |
| 2 | 启动目标 | `rehub_exec { backend:"x64dbg", op:"launch", args:{ path } }` |
| 3 | 找进程 / attach | `rehub_exec { backend:"frida", op:"ps" }`；x64dbg `op:"attach", args:{ pid }` |
| 4 | 高层 hook / 采样 | `rehub_exec { backend:"frida", op:"raw", args:{ args:[...] } }` |
| 5 | 内存 dump | `rehub_exec { backend:"pe-sieve", op:"dump", args:{ pid } }` |
| 6 | 回静态复核 | `rehub_exec { backend:"rea", op:"analyze", args:{ path: dumpPath } }` |

> 需要 AI 直接控制断点/单步：接 **x64dbg-mcp-server**（MCP，`duty1g/x64dbg-mcp-server`，2.8k★）到 `config.mcpBackends`，用 `rehub_mcp` 调。

## VMProtect 场景的额外工具

| 工具 | 作用 | 注意 |
|---|---|---|
| ScyllaHide / HyperHide | 反反调试（x64dbg 插件） | 与目标版本适配；HyperHide 需 VT-x |
| TTD + ttddbg | 录执行流，可回溯 | 需要 WinDbg 的 TTD 组件 |
| ret-sync | 调试器 ↔ IDA/Ghidra/BN 同步 | 定位跟踪点方便 |
| pe-sieve | dump 内存镜像、检测 hook | dump 后可回静态分析 |
| VMPStatic / Titan | VMProtect 静态/虚拟化还原 | **实验性，版本敏感**，先小样本验证 |
| Triton / angr | 符号执行辅助去虚拟化 | 研究级，成本高 |

## 证据要记什么

- 目标哈希、启动参数、环境（是否带反调试插件）
- 断点/跟踪点：模块+偏移、命中次数、调用栈
- hook 入参/返回值（Frida 脚本原文）
- dump 产物路径 + 哈希 + 从哪个进程/时刻抓的
- 反调试对抗点与是否成功（标 `inference`）

## 常见坑

- **附加即崩**：先看 `IsDebuggerPresent`/`NtQueryInformationProcess`/`/proc/self/maps`/时序检测；ScyllaHide 先开。
- **VMProtect 不是普通加壳**：静态脱壳工具成功率取决于版本；不要假设 VMPStatic 一定有效，先验证。
- **dump 不完整**：分模块 dump、修复 IAT/重定位后再分析。
- **只跑一次不足以定论**：同一路径两次运行对比，排除随机/时间因素。
- **副作用**：动态执行会写文件/发网络请求，隔离环境运行。

## 交付格式

```
目标：path/哈希 + 环境（调试器/插件）
动态证据：断点/跟踪点 + 命中 + 调用栈；hook 样本
dump：路径 + 哈希
静态回填：dump 上定位到的函数/调用链
未知：未解释的运行时行为
```
