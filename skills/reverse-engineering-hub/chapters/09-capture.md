# 第 09 章 抓包 / 协议分析

> 已有 HAR/pcap：离线看端点、字段、TLS SNI、WebSocket；**不访问录制 URL**，不重放真实请求。

## 什么时候进这一章

- `.har .pcap .pcapng .saz`，或用户给了一段请求/响应
- 用户说：抓包分析、报文、流量、协议、重放、接口分析
- 第 04 章的前置：先看抓包确定目标接口，再去找前端算法

## 进来先问自己 3 个问题

1. **是 HAR 还是 pcap**？HAR 在 Windows 直接可分析；pcap 原生解析需要 Linux tshark。
2. **要找什么**？接口清单、鉴权头、签名参数、加密 body、WebSocket 帧。
3. **要重放吗**？**默认不要**；确需重放时先确认授权且用测试账号。

## 链路（按顺序）

| 步 | 动作 | 调用 |
|---|---|---|
| 1 | HAR/mitmproxy 记录 | `mcp__rea__inspect_web_network_capture`（可只取某几条记录序号） |
| 2 | pcap 摘要 | `mcp__rea__inspect_pcap`（端点/DNS/SNI/协议分布） |
| 3 | 选中包字段 | `mcp__rea__inspect_recorded_packets`（字段/重复值/过滤/decode-as） |
| 4 | 找到签名参数 | 转第 04 章（Web）/ 第 03 章（App） |
| 5 | 对比两次抓包 | `mcp__rea__compare_web_captures` |

## 证据要记什么

- 抓包文件哈希、录制时间、来源
- 关键接口：method + host + path + 请求/响应字段名
- 鉴权/签名相关 header 与 body 字段（值脱敏）
- WebSocket：帧序列与消息类型

## 常见坑

- **HAR 里的敏感值**：报告里脱敏；不要把 token 贴进交付物。
- **pcap 需要 tshark**：Windows 没有就先做 HAR；或用 WSL。
- **录制顺序**：按 producer ordinal 看，别按时间戳猜并发。
- **编码**：body 可能是 gzip/br 后的 base64，先解码再看。

## 交付格式

```
抓包：文件 + 哈希 + 时间
接口清单：method URL 关键字段
可疑点：签名/加密字段 + 取值形态
下一步：第 04 章定位生成逻辑
```
