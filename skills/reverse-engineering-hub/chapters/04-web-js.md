# 第 04 章 Web / JS 逆向（签名、加密参数、反爬）

> 最高频场景：定位前端哪个函数生成了 `sign`/`token`/加密参数，还原算法并验证。

## 什么时候进这一章

- 用户说：JS 逆向、签名算法、加密参数、登录参数、token 怎么来的、反爬、混淆还原、滑块
- 目标是一个网站的前端（`.js`/`.html`），或者只有 URL
- 从第 09 章转来：抓包里发现请求参数可疑，要找生成逻辑

## 进来先问自己 3 个问题

1. **页面能正常打开吗**？能就用 CDP 观察（最省事）；不能就先解决访问（登录态/风控）。
2. **参数在请求里长什么样**？固定/时间戳/随机/加密串 → 决定搜索关键词（`sign`、`encrypt`、`md5`、`aes`、`nonce`）。
3. **要"算法"还是"能发请求"**？算法要反混淆+验证；只要打通请求可以先 hook 原函数直接调用。

## 链路（按顺序）

| 步 | 动作 | 调用 |
|---|---|---|
| 1 | 启动带调试端口的 Chrome | `chrome.exe --remote-debugging-port=9222 --user-data-dir=<临时目录> "<url>"` |
| 2 | 列页面 target | `rehub_exec { backend:"rea", op:"raw", args:{ args:["list-browser-targets","--endpoint","http://127.0.0.1:9222","--format","json"] } }` |
| 3 | 被动看页面：脚本/网络/存储 | `mcp__rea__inspect_web_page`（cdp_endpoint + target_id） |
| 4 | 抓脚本做静态定位 | `rehub_exec { backend:"rea", op:"web-bundle", args:{ endpoint, targetId } }` |
| 5 | 在脚本里搜关键字 | 对导出/抓取结果 grep `sign|encrypt|md5|sha|aes|nonce|token` |
| 6 | 断点/Hook 采样（可选） | `rehub_mcp { action:"list", backend:"js-reverse-mcp" }` → `action:"call"` |
| 7 | 复原算法并用真实输入验证 | 同一输入 → 同输出；对比服务端接受与否 |

> `js-reverse-mcp` 未构建时，第 6 步降级为：CDP 断点/控制台手动 hook + `inspect_web_page` 的网络观察。

## 命令速查

```powershell
# 1) 启动调试 Chrome（用独立 profile，别用日常浏览器）
& 'C:\Program Files\Google\Chrome\Application\chrome.exe' --remote-debugging-port=9222 --user-data-dir=D:\tmp\cdp-profile https://example.com

# 2) 列 target
node src/cli.mjs exec rea raw --argsJson '["list-browser-targets","--endpoint","http://127.0.0.1:9222","--format","json"]'

# 3) 抓 bundle
node src/cli.mjs exec rea web-bundle --endpoint http://127.0.0.1:9222 --targetId <ID>
```

## 定位签名函数的三条捷径

1. **搜关键词**：`sign`、`encrypt`、`md5`、`SHA`、`AES`、`JSEncrypt`、`CryptoJS`、`nonce`、`timestamp`。
2. **看调用栈**：在 XHR/fetch 断点里，从请求参数反查 `arguments` 来源。
3. **Hook 原始 API**：hook `XMLHttpRequest.prototype.send` / `window.fetch`，打印 body 与调用栈。

## 证据要记什么

- 页面 URL、脚本 URL、函数名与源码位置（行号）
- 输入/输出样本（至少 2 组，用于验证算法）
- 是否依赖时间戳/随机数/设备指纹
- 反爬点（debugger 陷阱、控制流平坦化、环境检测）

## 常见坑

- **debugger 死循环**：先禁用断点/替换 `Function.prototype.constructor`，再下断。
- **混淆变量名**：别追名字，追数据流（谁调用了加密函数、返回值去了哪）。
- **反调试检测 F12**：用 CDP 而不是开 DevTools；`--auto-open-devtools-for-tabs` 不要加。
- **只对某个 UA/环境生效**：换环境后算法分支不同，样本要可复现。
- **算法依赖服务端时间**：验证时对时间戳单独处理。

## 交付格式

```
页面/接口：URL + 请求样本
关键函数：文件:行号 + 函数名
算法：伪代码/JS 还原 + 依赖（时间戳/nonce/固定 key）
验证：输入→输出 对照表（≥2 组）
未知：无法解释的分支
```
