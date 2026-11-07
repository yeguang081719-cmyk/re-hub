# 第 03 章 Android 动态插桩 / 脱壳

> 静态走不动时（加固、反调试、运行时解密），用 adb + Frida 在设备上看真实行为。

## 什么时候进这一章

- APK 加固/壳导致 JADX 出来的类很少或全空
- 用户说：脱壳、内存 dump、hook、反检测、反调试、动态调试、运行时参数
- 静态找到了关键方法但参数是运行时生成的（需要采样）

## 进来先问自己 3 个问题

1. **有设备吗**？真机需 root（或可调试包）；模拟器注意 x86_64 的 frida-server 版本。
2. **要"看"还是"改"**？只看用 hook + log；改行为要写 Frida 脚本并注意副作用。
3. **有没有反调试**？有就先过检测（否则附加即崩），或改用静态第 02 章。

## 前置检查

```powershell
node src/cli.mjs exec adb devices
node src/cli.mjs exec adb shell --argsJson '["getprop","ro.product.cpu.abi"]'
node src/cli.mjs exec frida version
```

- `adb` 缺失：装 Android platform-tools，把 `adb.exe` 路径写进 `config.json` 的 `adbExe`。
- `frida` 缺失：`pip install frida-tools`；设备端按 ABI 推 `frida-server`（需 root）。

## 链路（按顺序）

| 步 | 动作 | 调用 |
|---|---|---|
| 1 | 设备/ABI | `rehub_exec { backend:"adb", op:"devices" }` / `op:"shell"` |
| 2 | 找进程 | `rehub_exec { backend:"frida", op:"ps" }` |
| 3 | 安装/替换测试包 | `rehub_exec { backend:"adb", op:"install", args:{ path } }` |
| 4 | 只读观察 | `mcp__rea__inspect_adb_package` / `list_adb_processes` / `read_adb_logcat` |
| 5 | 拉包/拉文件 | `mcp__rea__pull_adb_package` / `pull_adb_file` |
| 6 | Hook 采样 | `rehub_exec { backend:"frida", op:"raw", args:{ args:[...frida 参数] } }` |
| 7 | 拿到解密后的 dex/so | 落盘后回第 02 章（dex）/ 第 01 章（so） |

## 常用 Frida 采样点

- Java 层：目标方法入参/返回值、`Cipher.doFinal`、`MessageDigest.digest`、`String` 构造
- Native 层：`libc` 的 `memcmp`/`strcmp`、JNI 注册表、`dlopen`
- 反检测：`frida-server` 改名 + 端口非默认；先 hook `System.loadLibrary` 看壳加载顺序

## 证据要记什么

- 设备型号/ABI/Android 版本、包名/版本
- 每次 hook 的类/方法/参数/返回值（截图或日志原文）
- 脱壳产物路径 + 哈希
- 反调试/反检测的对抗点与是否绕过（这属于 `inference`）

## 常见坑

- **附加即崩**：先看 `ptrace`/`/proc/self/maps`/端口检测；不要反复重试把设备搞崩。
- **只 root 了模拟器**：部分壳检测模拟器，换真机再试。
- **frida 版本与 server 不一致**：`frida --version` 与设备端必须匹配。
- **dump 出来的 dex 不完整**：用多段 dump/修复工具（如 dex 修复脚本）再回静态。
- **Windows 上 adb 偶发卡死**：`adb kill-server` 后重开。

## 交付格式

```
设备：型号/ABI/Android
包：包名/版本
动态证据：hook 点 + 入参/返回（原文）
脱壳产物：路径 + sha256
静态回填：第 02 章继续（类/方法）
```
