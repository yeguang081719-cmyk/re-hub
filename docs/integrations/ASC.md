# ASC Fast Path（rust_ASC）接入设计

> 状态：**提议，未实现**。对应 [TOOL-RADAR](../TOOL-RADAR.md) 的 P0。
> 目标：在 Android 静态链路前面加一层“毫秒级侦察”，命中类后再走 JADX 深反编译；失败无感回退。

## 1. 对象与场景

- objectType：`app` / subtype `android`
- 场景：`02-android-static`（只读、静态）
- 不改变现有 `03-android-dynamic` / `10-artifact` 链路。

## 2. 能力与回退

| capability | 首选 | 回退 | 用途 |
|---|---|---|---|
| `android_fast_index` | `asc:listclass` / `asc:findrefs` | `jadx:decompile` | 类清单、字符串、xref |
| `android_fast_strings` | `asc:liststring` | `jadx:decompile` | 字符串池/URL/密钥线索 |
| `android_fast_class` | `asc:getclass` | `jadx:class` | 单类 pseudocode |
| `android_fast_manifest` | `asc:getmanifest` | `rea:android-package` | Manifest 快照 |

> 原则：asc 只做“快查”；**整包 Java 源码仍以 JADX 为 reference**。asc 的输出是 pseudocode，不能当最终交付。

## 3. Backend 适配器

### 配置

```jsonc
// config.json
{
  "ascPath": "D:/.../re-hub/tools/asc/rust_ASC.exe",
  "maxOutputBytes": 10485760
}
```

- 默认路径：`<repo>/tools/asc/rust_ASC.exe`（Windows x86_64 官方 release）。
- 安装：`bootstrap.mjs` 增加 `asc` 条目，资产名 `rust_ASC-windows-x86_64.exe`，校验 GitHub release 的 sha256。
- 许可：Apache-2.0；不修改二进制。

### ops 映射（CLI）

| op | argv | 说明 |
|---|---|---|
| `listclass` | `listclass --thread <N> <apk>` | 类清单；可加 `--prefix` |
| `listmethod` | `listmethod --thread <N> --class <cls> <apk>` | 方法定义 |
| `liststring` | `liststring --thread <N> -f <substr> <apk>` | 字符串池 |
| `findrefs` | `findrefs --thread <N> <apk> string\|type\|method\|field ...` | xref（`extends`/`impl` 仅 CLI） |
| `getclass` | `getclass --thread <N> <apk> <cls> -o <out>` | 单类 pseudocode |
| `getmanifest` | `getmanifest <apk> -o <out>` | 解码 Manifest |
| `export` | `export --thread <N> <apk> <outDir>` | 全量 pseudocode（可选，慢） |

`runBin` 复用现有执行器；`timeoutMs` 默认 120s（单类/查询），`export` 600s。

### 归一化

```js
return normalize('asc', op, r, {
  command: ['rust_ASC', ...argv].join(' '),
  outFile: args.out || null,
  pseudocode: op === 'getclass',
  partialSuccess: !r.ok && producedFileExists,
});
```

- `listclass/listmethod/liststring/findrefs`：stdout 按行切分，返回 `items` + `count`；
- `getclass`：写文件，返回路径 + 前 N 行摘要；证据只引用文件，不把 pseudocode 当事实；
- 失败：`backend-unavailable` / 非零退出 / 超时 → 抛错，由 capability 回退 JADX。

## 4. 计划（android-apk）

在现有 5 步前插入 **step 0**，不改 step 2–5：

```js
{ step: 0, backend: 'asc', op: 'listclass', args: { path: '{{target}}', prefix: '{{package}}' },
  why: '毫秒级类清单；先定位目标类，再决定是否整包 JADX。' }
```

命中 `className` 后：
- `asc:findrefs` 找调用者/字符串引用；
- `asc:getclass` 取单类 pseudocode；
- 需要完整 Java/资源时，继续 `jadx:decompile` + `apktool:decode`。

## 5. 错误与证据

| 情况 | 行为 | 证据 |
|---|---|---|
| 二进制缺失 | `backend-unavailable` → 回退 JADX | `detect` 显示 asc 缺失 |
| 非零退出/超时 | 记录 stderr 尾部 → 回退 | `partialSuccess=false` |
| 查询命中 | 返回 items/count | stdout artifact + sha256 |
| 单类 pseudocode | 标 `inferred`，需 JADX/Ghidra 复核 | 输出文件路径 |

## 6. 测试计划（样本到位后）

1. 小 APK（<10MB，单 DEX）：`listclass` 数量与 JADX 类数对比（允许 ±5% 差异，记录原因）。
2. 多 DEX / 大 APK（>100MB）：`listclass`、`findrefs` 耗时/内存 vs JADX。
3. `getmanifest` 与 apktool/REA 的 Manifest 字段对比。
4. `getclass` 抽 10 个类，与 JADX Java 输出人工对比（可读性/正确性）。
5. Windows 路径含空格/中文；stdout 编码 UTF-8。
6. 失败注入：改名二进制 → 确认回退 JADX；传坏 APK → 确认错误可读。

## 7. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 0.1.2，年轻 | 默认关闭；feature flag `asc.enabled`；不替换 JADX |
| pseudocode 不可读/不全 | 只用于定位；交付仍用 JADX |
| 每次 MCP 调用起新进程 | 原生 adapter 复用 CLI；批量查询合并 |
| 输出无 JSON | 先按行解析；需要结构化时再提 issue/适配 |
| 许可/分发 | Apache-2.0；bootstrap 校验 sha256；不改二进制 |

## 8. 落地顺序

1. `capabilities.mjs` 注册 4 个 capability（asc 候选 + jadx/rea 回退）。
2. `backends.mjs` 增加 `execAsc` 与 `case 'asc'`。
3. `scenarios.mjs` 的 `android-apk` 插入 step 0。
4. `config.example.json` 增加 `ascPath`；`bootstrap.mjs` 增加 `asc`。
5. `tests/smoke.mjs` 增加“asc 缺失时回退 JADX”的用例。
6. 文档：第 02 章“快慢双路径”、B 章后端表、README 工具矩阵。

> 没有样本前只做设计，不改默认链路；代码 PR 需等 smoke test 通过。
