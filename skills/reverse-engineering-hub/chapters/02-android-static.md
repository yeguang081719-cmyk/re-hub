# 第 02 章 Android 静态逆向（APK）

> APK 先看骨架（Manifest/组件/SDK），再看代码（类/方法），最后看资源与签名；要动态去第 03 章。

## 什么时候进这一章

- 目标 `.apk .xapk .aab .apks`
- 用户说：APK 逆向、看 Manifest、找某个类/方法、脱壳前侦察、看用了什么 SDK、签名校验
- 从别处转来：抓包里看到 App 接口，想找客户端调用点

## 进来先问自己 3 个问题

1. **先找类还是先看保护**？加固/壳的情况先看 `assets/`、`lib/`、`classes.dex` 数量与大小，再决定是否需要动态脱壳。
2. **有没有目标类名/字符串**？有就从 JADX 源码 grep；没有就从 Manifest 的入口 Activity 往下走。
3. **是否要资源/Manifest 原文**？需要就上 apktool；只要代码就 JADX 够了。

## 链路（按顺序）

| 步 | 动作 | 调用 |
|---|---|---|
| 1 | Manifest/包名/组件/权限/SDK | `rehub_exec { backend:"rea", op:"android-package", args:{ path } }` |
| 2 | 整包反编译成 Java 源码 | `rehub_exec { backend:"jadx", op:"decompile", args:{ path, out } }` |
| 3 | 在源码里搜关键字 | 对 `out` 目录用 grep/read（登录、sign、encrypt、md5、sha、aes、token…） |
| 4 | 精确类成员清单 | `rehub_exec { backend:"rea", op:"android-class", args:{ path, className } }` |
| 5 | 单方法反编译 | `rehub_exec { backend:"rea", op:"android-method", args:{ path, className, methodName } }` |
| 6 | 资源/Manifest 原文 | `rehub_exec { backend:"apktool", op:"decode", args:{ path, out } }` |
| 7 | 签名校验 | `mcp__rea__inspect_apk_signature` |
| 8 | 有 SO | 转第 01 章，对 `lib/<abi>/lib*.so` |

> 第 1 步依赖 `REA_JADX_MCP_JAR`（本机已配 `tools/jadx-headless-mcp-0.7.1-clean.jar`）。缺失时跳过第 1/4/5 步，直接用 JADX + grep。

## 命令速查

```powershell
$apk='D:\x\app.apk'
node src/cli.mjs exec rea android-package --path $apk
node src/cli.mjs exec jadx decompile --path $apk --out D:\out\jadx
Select-String -Path D:\out\jadx\sources\**\*.java -Pattern 'sign|encrypt|md5|sha256|aes' | Select-Object -First 30
node src/cli.mjs exec rea android-class --path $apk --className org.example.MainActivity
node src/cli.mjs exec apktool decode --path $apk --out D:\out\apktool
```

## 证据要记什么

- 包名、版本、minSdk/targetSdk、组件（Activity/Service/Receiver/Provider）
- 关键类全名 + 方法签名 + 反编译片段
- 是否加固（`lib/*.so` 里是否有壳特征、`classes.dex` 大小分布）
- 签名指纹（自校验/重打包检测线索）

## 常见坑

- **JADX 退出码 1 不代表失败**：`finished with errors` 时多数类仍可用，网关标 `partialSuccess=true`。
- **AAB/XAPK**：先解成 APK 再走本章；`aab` 需要 bundletool。
- **加固包**：JADX 出来的是空壳/少量类，别硬啃，转第 03 章动态 dump。
- **资源混淆**：`resources.arsc` 被处理后，用 apktool 解，但类名/资源名可能被重命名。
- **多 dex**：JADX 默认全解；只关心某个包时用 `--single-class` 提速。

## 交付格式

```
APK：<path>（sha256）
包名/版本/minSdk：…
组件：入口 Activity=…，其他组件…
关键发现：
  - [observation] 类/方法/片段（带路径与行号）
  - [inference] 算法/流程推测
  - [unknown] 未定位到的逻辑
下一步：转第 01 章（SO）/ 第 03 章（脱壳）/ 第 04 章（接口）
```
