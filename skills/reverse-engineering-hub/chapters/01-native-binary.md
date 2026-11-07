# 第 01 章 原生二进制

> exe / dll / sys / so / elf / dylib / macho：先看清结构，再按函数定点，最后交叉验证。

## 什么时候进这一章

- 目标扩展名是 `.exe .dll .sys .ocx .cpl .so .elf .dylib .macho .o .a`
- 用户说：反编译、看汇编、找函数、看导入表、找字符串、打补丁、找 xref、查后门
- 从其他章转来：APK 里的 `lib/*.so`、固件提取出的 ELF、托管程序里的 native 库

## 进来先问自己 3 个问题

1. **要"理解功能"还是"定位某个点"**？理解功能先概览；定位点先拿字符串/导出/xref。
2. **有符号吗**？有 PDB/导出名就用名字定位；没有就从 `entry` 和导入表附近的初始化函数看起。
3. **要不要动它**？只读分析走 REA/Ghidra；要打补丁必须另存副本，原文件不可改。

## 链路（按顺序）

| 步 | 动作 | 调用 |
|---|---|---|
| 1 | 整体概览：格式/架构/依赖/符号/入口 | `rehub_exec { backend:"rea", op:"analyze", args:{ path } }` |
| 2 | 定位可疑点：字符串、导出、导入 | `mcp__rea__list_strings` / `search_strings`；`mcp__rea__list_names` |
| 3 | 单函数完整证据 | `rehub_exec { backend:"rea", op:"function", args:{ path, procedure } }` |
| 4 | 伪代码 / 汇编 | `mcp__rea__procedure_pseudo_code` / `procedure_assembly` |
| 5 | 调用关系 | `mcp__rea__procedure_callers` / `procedure_callees` / `xrefs` |
| 6 | 直连 Ghidra 交叉验证函数清单 | `rehub_exec { backend:"ghidra", op:"functions", args:{ path } }` |
| 7 | 需要伪代码批量导出 | `rehub_exec { backend:"ghidra", op:"decompile", args:{ path, maxDecompile:50 } }` |

> 大二进制（>20MB）先 `op:"functions"` 拿清单，再按名字/地址逐点 `decompile`，不要一次全量反编译。

## 命令速查

```powershell
node src/cli.mjs exec rea analyze --path C:\Windows\System32\where.exe
node src/cli.mjs exec rea decompile --path X.exe --procedure FUN_140001010
node src/cli.mjs exec ghidra functions  --path X.exe
node src/cli.mjs exec ghidra decompile  --path X.exe --maxDecompile 5
```

## 证据要记什么

- 目标 SHA256、架构、imageBase（`analyze` 返回里有）
- 关键函数：名字/地址/大小/调用者/被调用者
- 伪代码片段 + 你据此得出的结论（标 `inference`）
- 未解开的间接调用、无法识别的字符串（标 `unknown`）

## 常见坑

- **别从 `main` 开始**：Windows PE 真正的入口在 CRT 初始化，业务逻辑多半在 `entry` 之后注册的回调里。
- **别只信字符串**：字符串可能是错误信息/配置；必须有引用关系佐证。
- **Ghidra 首次分析慢**：`where.exe` 约 18–38s；大文件要调 `timeoutMs`（默认 900s）。
- **巨型输出**：网关会把 >120KB 的结构化结果落盘到 `state/outputs/`，按需读文件。
- **没有符号的 so**：先看 `JNI_OnLoad` / `Java_*` 导出，再回到第 02 章对类名。

## 交付格式

```
目标：<path> (sha256 …)
链路：rea analyze → 字符串/导出 → function → ghidra 交叉验证
结论：
  - [observation] 入口/关键函数/调用链（带地址）
  - [inference] 功能推测（写依据）
  - [unknown] 未验证点
复现：列出实际执行的命令
```
