# 第 10 章 安装包 / 归档

> ZIP/APK/IPA/MSIX/DMG/JAR：先清单与哈希，再安全提取，最后按内容类型跳章。

## 什么时候进这一章

- `.zip .ipa .msix .appx .dmg .pkg .jar .whl .tar .gz`
- 用户说：安装包分析、解包、包结构、里面有什么
- 其他章的入口：拿到未知文件先看它是不是归档

## 进来先问自己 3 个问题

1. **只清单还是提取**？先 `inspect-artifact` 拿清单，再决定提取。
2. **里面是什么类型**？`app.asar` → 第 06 章；`classes.dex` → 第 02 章；`*.dll` → 第 01/07 章；`*.plist` 直接读。
3. **要防穿越**？提取必须用工具的独立目录，不要手工解压到系统目录。

## 链路（按顺序）

| 步 | 动作 | 调用 |
|---|---|---|
| 1 | 成员清单 + 完整性 | `mcp__rea__inspect_artifact` |
| 2 | 安全提取 | `mcp__rea__extract_artifact` 或 `rehub_exec { backend:"rea", op:"raw", args:{ args:["extract-artifact", path, "--output-directory", out, "--format","json"] } }` |
| 3 | Apple 相关 | `mcp__rea__inspect_plist` / `inspect_asset_catalog` / `inspect_signature` |
| 4 | PE 资源 | `mcp__rea__inspect_pe_resources` |
| 5 | 按内容跳章 | JS/Electron → 06；dex → 02；dll → 01/07；固件 → 08 |

## 证据要记什么

- 归档哈希、成员数、根目录结构
- 关键文件（manifest/plist/签名/证书）
- 提取目录路径（受控目录）

## 常见坑

- **路径穿越**：不要用系统解压工具直接解到目标目录；用 REA 的提取（会拒绝穿越/符号链接逃逸）。
- **DMG 需要 macOS**：非 macOS 环境先看清单，提取受限。
- **IPA 是 ZIP**：解出 `Payload/*.app` 后按 App bundle 分析。
- **签名/证书**：只做身份观察，不做绕过。

## 交付格式

```
归档：path + sha256
结构：顶层目录 + 关键成员
类型判断：→ 第 X 章
提取：<受控目录>
```
