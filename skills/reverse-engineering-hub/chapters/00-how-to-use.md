# 第 00 章 使用说明

> 三分钟学会这本书怎么查、怎么用。第一次使用必读；熟练后可跳过。

## 这本书的组织

- **SKILL.md（封面）**：书名、简介、目录、三个索引（目标形态 / 用户说法 / 产出）、标准动作。
- **chapters/00–15**：每个逆向场景一章，互相独立。
- **chapters/A–E**：附录（证据与交付、后端与依赖、坑与故障排查、对象分类 × 静态/动态/UI 矩阵、任务状态/能力/验证）。

## 遇到一个任务，按这个顺序走

1. `rehub_detect` —— 本机能用什么；区分 installed / runnable / usable。缺工具用 `rehub_install` 按需装（`dryRun:false` 需 `authorize:true`）。
2. `rehub_classify`（或 `rehub_route`）—— **一次统一解析**：intent / 对象四类 + 子类 / 静态·动态·UI 候选 / 约束 / 假设 / 不确定项。
   弱输入返回 `unknown` → 先澄清。
3. `rehub_route` —— 场景与章节（规划模板），同时带 `object` 与 `modes`。
4. `rehub_book { chapter }` —— 只读那一章，不要整本读。
5. `rehub_plan` —— 生成**任务图**：`{ scenario, target }` 或 `{ objectType, mode, target }`；
   返回 `taskId` / `planVersion` / 每步 `stepId` + `capability` + 副作用 + 期望证据 + 停止条件。
6. 按 `steps` 执行：`rehub_exec { taskId, stepId }`；副作用步骤 `confirm:true`；失败看 `recovery`。
   需要重规划时 `rehub_plan { taskId, fromStep, changeReason }`（只替换受影响分支）。
7. `rehub_evidence append` 记观察（带 artifactRef/sha256）；`claim` 记结论（observed/inferred/unknown + 证据引用）。
8. `rehub_verify { taskId }` —— execution / fact / delivery 三层校验。
9. `rehub_evidence report { taskId }` —— 证据驱动报告（附录 A / E）。

## 什么情况不该继续

| 情况 | 做法 |
|---|---|
| `rehub_route` 返回低置信度 / `scenario=triage` | 转第 13 章，问用户两个问题 |
| `rehub_classify` 返回 `objectType=unknown` | 先问对象四类，别硬猜链路 |
| `rehub_detect` 显示缺少必需后端（`usable=false`） | 先把缺失项告诉用户（附录 B 有安装命令），不要静默降级 |
| `rehub_exec` 返回 `recovery.category=missing-capability` | 换等效能力或请求授权；不要重复同一失败步骤 |
| `rehub_verify` 事实层 `insufficient/contradicted` | 补证据或降级为 `inferred/unknown`，不能当 observed 交付 |
| 目标不是自有/未授权 | 停止，说明授权要求 |
| 跑出来的结果自相矛盾 | 转附录 C 排查，不要硬写结论 |

## 每章的统一结构

`什么时候进这一章` → `进来先问自己 3 个问题` → `链路（按顺序）` → `命令速查` →
`证据要记什么` → `常见坑` → `交付格式`。看到这七个小标题就知道读对了。

## 最小可用命令

```powershell
cd D:\work\deepseekhharness\re-hub
node src/cli.mjs detect
node src/cli.mjs classify --task "这个 APK 的登录参数怎么加密" --target D:\x\app.apk
node src/cli.mjs route --task "这个 APK 的登录参数怎么加密" --target D:\x\app.apk
node src/cli.mjs plan --scenario android-apk --target D:\x\app.apk
node src/cli.mjs plan --objectType app --subtype android --mode dynamic --target D:\x\app.apk
node src/cli.mjs exec rea android-package --path D:\x\app.apk
```

MCP 侧等价：`rehub_detect` / `rehub_classify` / `rehub_route` / `rehub_plan` / `rehub_exec`。
