# 附录 C 坑与故障排查

> 本机实测踩过的坑，按症状查。

## C.1 症状 → 处理

| 症状 | 可能原因 | 处理 |
|---|---|---|
| `rehub_route` 返回 triage/low | 没说目标形态或产出 | 转第 13 章，问两个问题 |
| `rehub_exec` 返回 `backend-unavailable` | 后端没装 | 看 `rehub_detect` 的 install 字段（附录 B） |
| `rea android-*` 报 `REA_JADX_MCP_JAR` | 桥 jar 未配置 | 本机已配 `tools/jadx-headless-mcp-0.7.1-clean.jar` |
| `Artifact path collision: META-INF/LICENSE.txt` | 官方 fat jar 有重复条目 | 用 `jar xf` 展开再打包（本项目 clean.jar 即如此） |
| JADX 退出码 1 | 部分类反编译失败 | 正常；看 `partialSuccess`/`javaFileCount` |
| Ghidra 很慢 | 首次分析 + 无缓存 | 等待，或 `timeoutMs` 加大；重复分析会快 |
| `rehub_exec` 结果巨大 | 证据包太大 | 网关已落盘到 `state/outputs/`，读文件或缩小查询 |
| MCP 工具是旧行为 | server.mjs 改了但未重挂载 | 移除再插入 patch 条目，或重启 DSH |
| DSH 启动失败 / YAML 解析错 | `cordis.patch.yml` 编码/行尾损坏 | `node scripts/validate-patch.mjs`；用 ASCII 注释重建 |
| 中文注释乱码 | PowerShell 默认编码 | 一律用 Node/工具写文件，不要 `Set-Content` 写中文 |
| 动态分析附加即崩 | 反调试/VMProtect | 先开 ScyllaHide/HyperHide；别反复重试 |
| VMProtect 脱壳失败 | 版本敏感/虚拟化 | VMPStatic/Titan 先小样本验证，别当通用解 |
| UIA 控件树很浅 | Qt 自绘控件无 UIA 语义 | 截图 + 重画；或对 CEF 页面走 CDP |
| CEF 拿不到 DOM | 未开远程调试端口 | 查程序启动参数/配置里的 `--remote-debugging-port` |

## C.2 网关自身的坑

- **工具面太大**：rehub 只有 8 个工具，REA 的 229 个在 `mcp__rea__*`，别在 rehub 里重复。
- **大输出**：>120KB 的结构化结果会落盘；不要向模型塞全量 evidence bundle。
- **路径**：所有命令用绝对路径；相对路径以 `re-hub` 为根。
- **超时**：Ghidra/REA 首次分析分钟级；默认 900s，调用时可再加大。

## C.3 证据层常见错误

- 把"字符串里出现 sign"当"签名算法找到" → 必须找到引用与调用。
- 把混淆后的变量名当函数名 → 追数据流。
- 把一次成功请求当算法正确 → 至少 2 组输入输出。
- 把动态 hook 的值当静态常量 → 注明运行时来源。

## C.4 安全与合规

- 只分析自有/已授权软件。
- 不提供绕过他人软件保护（付费墙、DRM、License 校验）的帮助。
- 商业工具（IDA/Hex-Rays/Hopper/BN/JEB）需合法授权。
- 报告脱敏：token、密码、个人信息一律不落盘。
