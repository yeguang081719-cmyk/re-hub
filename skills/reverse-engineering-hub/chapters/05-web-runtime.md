# 第 05 章 Web 运行时被动观察

> 页面已经开着、不要注入、只要事实：结构、脚本、网络、存储、截图。

## 什么时候进这一章

- 用户已有一个打开的页面/Chrome 会话，让你"看看这个网站"
- 需要网络请求清单、localStorage/cookie 现状、页面结构
- 第 04 章的辅助：先被动看清全貌，再决定侵入式断点

## 进来先问自己 3 个问题

1. **CDP 端口开了吗**？没开就按第 04 章第 1 步启动一个独立 profile。
2. **要不要截图留证**？要就在最后一步截。
3. **有 origin 限制吗**？跨域 target 要先确认归属，只观察目标 origin。

## 链路（按顺序）

| 步 | 动作 | 调用 |
|---|---|---|
| 1 | 列 target | `mcp__rea__list_browser_targets`（endpoint） |
| 2 | 页面全貌 | `mcp__rea__inspect_web_page`（含脚本/资源/网络/存储清单） |
| 3 | 截图 | `mcp__rea__capture_web_screenshot` |
| 4 | 会话级观察（用户操作时） | `mcp__rea__observe_web_session` |
| 5 | 需要脚本源码 | `mcp__rea__export_web_scripts` |

## 证据要记什么

- target URL/origin、页面标题、脚本数量
- 请求清单：method/URL/状态/资源类型（不抓 body 时注明）
- storage：key 名（值不落盘）
- 截图路径

## 常见坑

- **别对非目标 origin 的页面做观察**：先确认归属。
- **观察窗口有限**：`observation_ms` 默认很短，用户操作场景要显式加长。
- **导航会结束文档级采集**：需要跨页面就在每页重开观察。

## 交付格式

```
页面：URL / title
脚本：N 个（列前 10 个 URL）
请求：N 条（列关键接口）
存储：localStorage/cookie 的 key 清单
截图：<path>
```
