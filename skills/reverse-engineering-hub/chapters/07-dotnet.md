# 第 07 章 .NET / 托管程序集

> PE/CLI：元数据、CIL、引用、资源、P/Invoke 边界；静态不执行，版本可对比。

## 什么时候进这一章

- `.dll`/`.exe` 是 C#/.NET/Unity 托管程序（`Assembly-CSharp.dll`、`mscorlib` 引用等）
- 用户说：.NET 逆向、看 IL、反编译 C#、dnspy、程序集、Unity 逻辑
- 从第 01 章转来：native 分析发现它是托管 PE

## 进来先问自己 3 个问题

1. **托管还是 NativeAOT**？字符串里有 `mscorlib`/`System.` → 托管；NativeAOT 走第 01 章。
2. **要方法体还是清单**？先 members 清单再定点。
3. **有 P/Invoke 吗**？有就准备转第 01 章看 native 侧。

## 链路（按顺序）

| 步 | 动作 | 调用 |
|---|---|---|
| 1 | 程序集身份/模块/引用/资源 | `mcp__rea__inspect_managed_artifact` |
| 2 | 类型/方法/签名/调用边 | `mcp__rea__inspect_managed_members` |
| 3 | P/Invoke 与原生边界 | `mcp__rea__inspect_managed_native_boundaries` |
| 4 | 版本对比 | `mcp__rea__compare_managed_members` |
| 5 | 原生依赖 | 第 01 章 |

## 证据要记什么

- 程序集名/MVID/SHA256、目标框架
- 关键类型与方法签名（含重载）
- 引用与 P/Invoke 目标
- 资源（内嵌配置/密钥线索，注意不要泄露真实凭据）

## 常见坑

- **混淆（ConfuserEx 等）**：方法体可能是空壳/控制流混淆，必要时配合运行时。
- **单文件发布**：先解出自包含的 dll 再分析。
- **Unity**：业务逻辑常在 `Assembly-CSharp.dll`；il2cpp 模式走第 01 章。
- **不要执行程序集**：静态分析即可，避免触发反调试/外联。

## 交付格式

```
程序集：名/版本/SHA256/框架
关键类型与方法：…
P/Invoke：…
未知：…
```
