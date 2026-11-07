# 第 00 章 使用说明

> 三分钟学会这本书怎么查、怎么用。第一次使用必读；熟练后可跳过。

## 这本书的组织

- **SKILL.md（封面）**：书名、简介、目录、三个索引（目标形态 / 用户说法 / 产出）、标准动作。
- **chapters/00–13**：每个逆向场景一章，互相独立。
- **chapters/A–C**：附录（证据与交付、后端与依赖、坑与故障排查）。

## 遇到一个任务，按这个顺序走

1. `rehub_detect` —— 本机能用什么。
2. `rehub_route { task, target }` —— 这属于哪个场景、该读哪一章（返回 `chapter`）。
3. `rehub_book { chapter }` —— 只读那一章，不要整本读。
4. `rehub_plan { scenario, target }` —— 拿到带参数的可执行链路。
5. 按 `steps` 调 `rehub_exec`（或 `mcp__rea__*`），每步 `rehub_evidence action=append`。
6. `rehub_evidence action=report` —— 出报告（模板见附录 A）。

## 什么情况不该继续

| 情况 | 做法 |
|---|---|
| `rehub_route` 返回 `confidence=low` / `scenario=triage` | 转第 13 章，问用户两个问题 |
| `rehub_detect` 显示缺少必需后端 | 先把缺失项告诉用户（附录 B 有安装命令），不要静默降级 |
| 目标不是自有/未授权 | 停止，说明授权要求 |
| 跑出来的结果自相矛盾 | 转附录 C 排查，不要硬写结论 |

## 每章的统一结构

`什么时候进这一章` → `进来先问自己 3 个问题` → `链路（按顺序）` → `命令速查` →
`证据要记什么` → `常见坑` → `交付格式`。看到这七个小标题就知道读对了。

## 最小可用命令

```powershell
cd D:\work\deepseekhharness\re-hub
node src/cli.mjs detect
node src/cli.mjs route --task "这个 APK 的登录参数怎么加密" --target D:\x\app.apk
node src/cli.mjs plan --scenario android-apk --target D:\x\app.apk
node src/cli.mjs exec rea android-package --path D:\x\app.apk
```

MCP 侧等价：`rehub_detect` / `rehub_route` / `rehub_plan` / `rehub_exec`。
