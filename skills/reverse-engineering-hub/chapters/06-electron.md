# 第 06 章 Electron / 桌面 JS 应用

> asar/解包目录：模块、import、IPC、preload、原生插件边界；能开调试端口的直接看运行时。

## 什么时候进这一章

- 目标 `.asar`、Electron 安装目录、`app.asar.unpacked`、桌面客户端
- 用户说：客户端逆向、看 IPC、preload 逻辑、asar 解包、桌面应用协议
- 从第 10 章转来：安装包解出 `resources/app.asar`

## 进来先问自己 3 个问题

1. **asar 还是解包目录**？两种都支持，路径给对即可。
2. **要看静态还是运行时**？静态先走 `analyze-javascript-application`；有调试端口再看运行时。
3. **有没有原生插件**？`.node`/`.dll` 出现就转第 01 章。

## 链路（按顺序）

| 步 | 动作 | 调用 |
|---|---|---|
| 1 | 静态重建应用图 | `rehub_exec { backend:"rea", op:"js-application", args:{ path } }` |
| 2 | 定位功能 | `mcp__rea__trace_application_feature`（按字面量/路由/模块/API 种子） |
| 3 | 看运行中页面 | `mcp__rea__list_electron_targets` → `inspect_electron_page` |
| 4 | 原生插件 | 第 01 章分析 `.node`/`.dll` |
| 5 | 版本对比 | `mcp__rea__compare_application_versions` |

## 常看的点

- `main` 进程：窗口、协议、自动更新、文件读写
- `preload`：暴露给渲染进程的 API（安全边界）
- IPC：`ipcMain.handle` / `ipcRenderer.invoke` 的 channel 与参数
- 协议：`app.setAsDefaultProtocolClient` 注册的 scheme

## 证据要记什么

- 应用路径/asar 哈希、Electron 版本（如有）
- 模块与入口、IPC channel 清单
- 关键函数/文件位置
- 原生插件依赖

## 常见坑

- **asar 内路径不能用普通 read**：用 REA 分析或先解包。
- **压缩/加密的 JS**：先看是否 `asar` 内有 `.jsc`/V8 字节码，必要时运行时抓。
- **多版本并存**：确认分析的是用户实际运行的那个版本。

## 交付格式

```
应用：路径 + 版本
结构：主进程入口 / preload / IPC channel 清单
功能：目标功能涉及的模块与调用链
原生依赖：.
```
