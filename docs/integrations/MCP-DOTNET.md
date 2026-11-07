# mcp-dotnet 接入设计（.NET 第 07 章）

> 状态：**提议，未实现**。对应 [TOOL-RADAR](../TOOL-RADAR.md) 的 P1.5。
> 目标：补第 07 章“能读不能改”的空白——读元数据/IL、ILSpy 反编译、敏感 API 扫描，以及**改 IL 后保存**。

## 1. 对象与场景

- objectType：`software` / subtype `dotnet`
- 场景：`07-dotnet`（静态）；IL patch 服务于第 12 章（补丁/修复）
- 不覆盖：IL2CPP 的原生部分、动态调试、Unity 资源。

## 2. 工具事实

| 项 | 值 |
|---|---|
| 仓库 | [jumpifequal/mcp-dotnet](https://github.com/jumpifequal/mcp-dotnet) |
| 版本/许可 | v2.0.0 / MIT；`neoz/mcp-dotnet` 的 fork |
| 运行时 | .NET 10 SDK / Desktop Runtime |
| 引擎 | dnlib（元数据/IL 读写） + ICSharpCode.Decompiler（ILSpy） |
| 接口 | MCP stdio / Streamable HTTP；`--read-only` 可移除写工具 |
| 工具数 | 36（程序集/类型/方法/字段/资源、xref、IL、CFG、反编译、patch、rename、scan） |

## 3. 能力映射

| capability | mcp-dotnet 工具 | 回退 | 说明 |
|---|---|---|---|
| `dotnet_inspect` | `load_assembly` → `get_entry_points` → `decompile` | `rea:raw`（inspect-managed） | 入口/类型/方法概览 + C# |
| `dotnet_xref` | `find_callers` / `find_callees` / `find_field_references` | 无 | 调用/字段引用 |
| `dotnet_il` | `get_method_il` / `get_control_flow_graph` / `disassemble` | 无 | IL + CFG |
| `dotnet_scan` | `scan_suspicious_apis` / `list_pinvokes` / `list_resources` | 无 | 注入/网络/加密/反调试等分诊 |
| `dotnet_patch` | `replace_method_body` / `rename_member` / `save_assembly` | 无 | **有副作用**，需 confirm + 备份 |

## 4. 接入方式（分两阶段）

### 阶段 1：MCP 注册（零代码）

```jsonc
// config.json -> mcpBackends
{
  "mcp-dotnet": {
    "command": "D:/tools/mcp-dotnet/mcp-dotnet.exe",
    "args": ["--read-only"],
    "transport": "stdio"
  }
}
```

- 通过 `rehub_mcp` 调用 36 个工具；适合“先验证工具面”。
- 只读模式：分析阶段必须开启；patch 另开一个非只读实例。
- HTTP 模式只绑 loopback + bearer；不要把 8765/HTTP 暴露到网络。

### 阶段 2：capability 封装（有代码）

- 新增 `dotnet_*` capability；等 MCP 验证稳定后再做，避免把未验证的 0★ 工具塞进默认路由。
- `dotnet_patch` 归入 `sideEffects: true`；执行前必须 `confirm:true`，并自动复制原始 DLL 到 `state/backup/`。

## 5. 计划（dotnet-managed）

```js
// 只读侦察
{ step: 1, backend: 'mcp:mcp-dotnet', op: 'call',
  args: { tool: 'load_assembly', arguments: { path: '{{target}}' } },
  why: '读元数据/类型/方法；只读模式。' }
{ step: 2, backend: 'mcp:mcp-dotnet', op: 'call',
  args: { tool: 'scan_suspicious_apis', arguments: {} },
  why: '先分诊注入/网络/加密/反调试。' }
```

> 现状：`rehub_mcp` 可以按工具名调用；capability/plan 的强类型封装是阶段 2，不阻塞手工分析。

## 6. 安全与证据

| 风险 | 处理 |
|---|---|
| IL patch 改坏程序集 | 默认只读；patch 前备份；保存后重开校验；记录 sha256 |
| 反编译输出被当事实 | 标 `inferred`；关键结论需 IL/运行验证 |
| 恶意 .NET 样本 | 不执行；只在隔离目录分析；不把样本上传 |
| HTTP transport 暴露 | 仅 loopback + bearer；`--no-auth` 禁止非 loopback |
| .NET 10 依赖 | `detect` 增加 runtime 检查；缺失时明确报错，不静默跳过 |

## 7. 测试计划（样本到位后）

1. 用 `dotnet new console` 编一个 benign .NET 10 程序：`load_assembly` → `decompile` → `get_entry_points`。
2. `scan_suspicious_apis` / `list_pinvokes` 在 benign 样本上应为空或可解释。
3. `rename_member` 后 `decompile` 立即反映新名字。
4. `replace_method_body` 改一个返回常量 → `save_assembly` → 用 ILSpy 复核 → 运行验证。
5. 只读模式确认 `replace_method_body/save_assembly` 工具不存在。
6. 无 .NET 10 的机器：确认 `detect` 报缺失，路由回退 REA managed。

## 8. 风险与结论

- **0★ + fork**：只适合 `mcpBackends` 级接入，不进入默认后端；等有 release/上游合并再评估。
- **.NET 10 only**：比 re-hub 现有 REA 的运行时要求更窄；文档要写清。
- **patch 是双刃剑**：能力很强，但必须默认关闭、显式确认、可回滚。
- **结论：PILOT 保持**；先注册只读 MCP，样本验证后再做 capability 封装。

> 与 ASC 不同，这个工具本身是 MCP server，**阶段 1 不需要改 re-hub 代码**；这是它比 `asc` 更容易试的原因。
