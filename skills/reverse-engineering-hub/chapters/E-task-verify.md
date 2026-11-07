# 附录 E 任务状态、能力编排与验证（v2）

> 优化目标不是"多接工具"，而是：**统一任务理解 → 能力驱动规划 → 按需准备 → 执行—取证—验证—重规划 → 证据驱动交付**。
> 对外仍保留 `rehub_detect / route / classify / plan / exec / evidence`，新增 `rehub_verify`；旧调用方式不破坏。

## E.1 统一任务理解（一次解析，多处投影）

`rehub_route` 与 `rehub_classify` 现在调用同一个 `parseTask`（`src/intake.mjs`），返回 `schemaVersion: "2.0"` 的统一字段：

| 字段 | 含义 |
|---|---|
| `intent` | 用户想查明什么：`restore_algorithm` / `inspect_flow` / `trace_runtime` / `extract_config` / `inspect_http` / `inspect_dom` / `replicate_ui` / `dump_memory` / `decompile_code` / `analyze_artifact` |
| `object` | 对象类型 + 子类（网站 / App / 软件 / AI 自动化） |
| `underlyingObjects` | AI 自动化任务实际分析的底层对象 |
| `modes` | `static` / `dynamic` / `ui` 候选（可组合、执行中可调整） |
| `scenario` | 15 场景作为**规划模板 / 章节索引**，不是每次必经门槛 |
| `constraints` | `authorization` / `maxSteps` / `maxRetries` / `budgetMs` / `allowInstall` / `readOnlyFirst` |
| `assumptions` | 非关键缺失字段的显式假设（可继续执行） |
| `uncertainties` | 关键歧义/冲突（需要澄清或执行中处理） |
| `clarify` | 定向澄清问题 |

冲突处理：两个接口各自保留旧字段，统一字段同名同值；只解析一次，避免字段冲突。

## E.2 任务状态机与版本化计划

`rehub_plan` 现在创建/更新一个**任务**（`state/tasks/<taskId>.json`），返回 `taskId`、`planVersion` 与每步 `stepId`。

- 稳定关联键：`taskId` / `stepId` / `planVersion` / `evidenceId` / `claimId`
- 步骤状态：`pending → running → succeeded | failed | blocked | skipped`
- 计划版本化：`planHistory` 记录 version / reason / fromStep / changedSteps
- 局部重规划：`rehub_plan { taskId, fromStep: "step-3", changeReason }` → 只替换第 3 步及之后，之前的步骤状态保留
- 预算：`constraints.maxSteps` 会截断计划（`truncated: true`）；`budgetMs` 在执行侧检查
- 停止条件：`stopConditions` 随计划返回（成功判据 / 预算 / 缺权限 / 假设冲突 / 用户取消）

## E.3 能力注册表与后端回退

上层按**能力**而不是后端名规划（`src/capabilities.mjs`），例如：

| capability | 候选实现 |
|---|---|
| `inspect_binary` | rea:analyze / rea:inspect / ghidra:functions |
| `decompile_function` | rea:decompile / ghidra:decompile |
| `decompile_apk` | jadx:decompile / apktool:decode / rea:android-class |
| `decode_resources` | apktool:decode / rea:decode-resources |
| `debugger_probe` / `debugger_control` | x64dbg:info / x64dbg:launch / x64dbg:attach |
| `memory_scan` / `memory_dump` | pe-sieve:scan / pe-sieve:dump |
| `ui_tree` | uia:tree |

- `rehub_plan` 为每步附 `capability / capabilityLabel / alternatives / availability / fallbackFrom`
- 首选后端不可用时**先找等效能力**（默认开启，可 `resolveFallbacks:false` 关闭），替换后记录 `fallbackFrom`
- `rehub_detect` 把后端状态分成 **installed / runnable / usable**；`usable=false` 时不承诺可执行（如 Medium 下的 pe-sieve）
- 安装是显式授权动作：`rehub_install { dryRun:false }` 必须同时传 `authorize:true`，不会默认自动安装

## E.4 执行与恢复

`rehub_exec` 传 `taskId + stepId` 时记录结构化状态（参数摘要、结果定位、错误类别、重试次数），并返回 `recovery`：

| 失败类别 | 动作 |
|---|---|
| 瞬时错误（超时等） | `retry`（有限次；有副作用的步骤不自动重试） |
| 能力/环境缺失（needs-elevation、backend-unavailable） | `authorize-or-switch` / `switch-backend-or-install` |
| 权限/授权不足 | `stop` |
| 其他执行失败 | `replan-or-stop` |

- **副作用步骤需显式确认**：`x64dbg launch/attach`、`frida raw`、`pe-sieve dump`、`adb install`、`extract-*` 等必须 `confirm:true`，否则返回 `side-effect-not-confirmed`
- 预算耗尽 / 任务已结束 / 未知 stepId 会拒绝执行（`task-budget-exhausted` / `task-terminal` / `unknown-step`）
- 失败后不要重跑全部计划：用 `fromStep` 只替换受影响分支

## E.5 证据、Claim 与三层验证

**证据**（`rehub_evidence action=append`）记录来源与可复核定位：

```json
{
  "evidenceId": "ev_...",
  "taskId": "task-...",
  "stepId": "step-3",
  "sourceTool": "example-backend",
  "sourceTarget": "authorized-target",
  "capturedAt": "ISO-8601",
  "artifactRef": "state/.../dump.bin",
  "integrity": { "sha256": "..." },
  "observation": "观察到的事实"
}
```

**Claim**（`rehub_evidence action=claim`）与证据分离：`text` + `kind`（observed / inferred / unknown）+ `evidenceRefs`。

**`rehub_verify`** 分三层：

1. **execution**：步骤是否成功、输出是否可用（`pass/fail/blocked/insufficient`）
2. **fact**：每条 claim 是否被 observation 证据支持（`supported / contradicted / insufficient / inferred / unknown`）
3. **delivery**：是否满足 `desiredOutput`（如 `report` / `ui-prototype` / `api-doc` / `code-structure`）

规则：**执行成功 ≠ 事实成立**；未验证结论不能升级为 `observed`；`inferred` 和 `unknown` 保持原分类。

## E.6 交付

`rehub_evidence action=report` 生成统一报告：任务/授权/范围 → observed → inferred → contradiction → unknown → 结论与证据映射 → 验证覆盖 → 交付物要求 → 限制。

报告必须写清：授权与环境、执行范围、主要发现、证据引用、推断依据、未知项、验证覆盖、限制与后续建议；UI 复现注明 clean-room。

## E.7 标准动作（v2）

1. `rehub_detect`：能力注册表 + installed/runnable/usable（优先缓存，`refresh` 强制更新）
2. `rehub_route` / `rehub_classify`：一次统一解析 → intent / object / modes / constraints / assumptions / uncertainties
3. `rehub_plan`：创建任务与版本化计划（capability + 依赖 + 期望证据 + 停止条件）；需要时 `fromStep` 局部重规划
4. `rehub_exec taskId stepId`：执行原子步骤；副作用需 `confirm:true`；失败按 recovery 处理
5. `rehub_evidence append`：记录观察（带 artifactRef/sha256）；`claim`：记录结论
6. `rehub_verify`：执行 / 事实 / 交付三层校验
7. `rehub_evidence report`：证据驱动报告
8. 交付：observed / inferred / unknown 分列，注明验证覆盖与限制

## E.8 兼容与迁移

- 旧调用不变：`route` / `classify` / `plan { scenario }` / `exec { backend, op }` 仍然可用；`taskId` 可选
- 新增字段向后兼容：`schemaVersion`、`intent`、`constraints`、`assumptions`、`uncertainties`、`taskId`、`planVersion`、`stepId`、`recovery`、`task`
- 不需要任务状态时，`exec` 保持一次性调用语义；需要追踪/重规划/验证时传 `taskId + stepId`
