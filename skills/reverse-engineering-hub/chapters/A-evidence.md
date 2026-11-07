# 附录 A 证据与交付

> 没有证据的结论等于猜测。本附录规定"记什么、怎么标、怎么交付"。

## A.1 一条证据的字段

```json
{
  "task": "任务一句话",
  "scenario": "04-web-js",
  "target": "D:/x/app.js",
  "step": 3,
  "backend": "rea",
  "op": "web-bundle",
  "kind": "observation",          // observation | inference | unknown
  "confidence": "high",           // low | medium | high
  "summary": "一句话结论",
  "detail": "证据定位：文件:行号/地址/类名/请求 ID",
  "evidenceRefs": ["ev_..."],
  "unknowns": ["未验证点"]
}
```

记录：`rehub_evidence { action:"append", record:{...} }`；查看：`action:"list"`；报告：`action:"report"`。

## A.2 三种 kind 的判定

| kind | 什么时候用 | 例子 |
|---|---|---|
| `observation` | 工具直接返回的事实（代码/字节/请求） | "函数 FUN_140001010 调用 CreateFileW" |
| `inference` | 你的推断（必须写依据） | "推测为配置加载逻辑，依据是字符串 config.ini + 调用顺序" |
| `unknown` | 没验证/验证不了 | "间接调用目标未解析" |

**禁止**：把 inference 写成 observation；把没跑的步骤写成已完成。

## A.3 报告模板（`rehub_evidence action=report` 生成）

```
# <标题>
## 目标与范围
- 目标：path/URL + sha256
- 授权：自有/已授权
- 范围：只分析 X，不动生产

## 链路与工具
1. detect → 2. route(04-web-js) → 3. web-bundle → 4. grep → 5. 验证

## 关键发现（按证据 ID）
- [observation] ev_xxx：…
- [inference] ev_yyy：…（依据：…）

## 算法/结构说明
（伪代码或流程；标明来源）

## 未验证假设
- …

## 复现步骤
（命令/输入输出对照）
```

## A.4 交付质量自检

- [ ] 每个结论都有证据 ID 或可复核定位
- [ ] observed / inferred / unknown 分列
- [ ] 至少一组输入→输出验证（算法类）
- [ ] 敏感值已脱敏
- [ ] 未越权、未扩散
