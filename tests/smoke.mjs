#!/usr/bin/env node
// End-to-end smoke test: spawn the RE Hub MCP server as a real stdio client,
// exercise tools/list + routing + planning + evidence.
import { McpClient } from '../src/lib/mcp.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, '..', 'src', 'server.mjs');

let pass = 0;
let fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✔ ${name}`); }
  else { fail++; console.log(`  ✘ ${name} ${detail}`); }
}

function textOf(result) {
  const item = result?.content?.find?.((c) => c.type === 'text');
  if (!item) return null;
  try { return JSON.parse(item.text); } catch { return item.text; }
}

const client = new McpClient({ command: process.execPath, args: [SERVER] }, { timeoutMs: 120_000 });
await client.start();

const tools = await client.listTools();
check('tools/list 返回 9 个工具', tools.tools?.length === 9, `got ${tools.tools?.length}`);
const names = (tools.tools || []).map((t) => t.name);
for (const n of ['rehub_detect', 'rehub_scenarios', 'rehub_route', 'rehub_plan', 'rehub_exec', 'rehub_mcp', 'rehub_evidence', 'rehub_book', 'rehub_install']) {
  check(`工具存在: ${n}`, names.includes(n));
}

// 1) detect
const detect = textOf(await client.callTool('rehub_detect', {}));
check('detect 报告 rea 可用', detect?.backends?.rea?.available === true);
check('detect 报告 ghidra 可用', detect?.backends?.ghidra?.available === true);
check('detect 给出 summary', typeof detect?.summary === 'string' && detect.summary.length > 0);
check('detect 统计 vendor 仓库', (detect?.vendor?.count ?? 0) >= 0);

// 2) scenarios
const scenarios = textOf(await client.callTool('rehub_scenarios', {}));
check('scenarios 数量 13', scenarios?.count === 13, `got ${scenarios?.count}`);
check('scenarios 带 chapter 指针', typeof scenarios?.scenarios?.[0]?.chapter === 'string');

// 2b) book
const toc = textOf(await client.callTool('rehub_book', {}));
check('book 目录 17 项（00 + 13 章 + 3 附录）', toc?.chapters?.length === 17, `got ${toc?.chapters?.length}`);
const ch4 = textOf(await client.callTool('rehub_book', { chapter: '04' }));
check('book 按序号取章（04）', ch4?.ok === true && /Web/.test(ch4.content));
const chByScenario = textOf(await client.callTool('rehub_book', { chapter: 'web-js' }));
check('book 按 scenario id 取章', chByScenario?.ok === true && chByScenario.id === '04-web-js');
const chMissing = textOf(await client.callTool('rehub_book', { chapter: 'nope' }));
check('book 未知章返回可用列表', chMissing?.ok === false && Array.isArray(chMissing.available));

// 3) routing
const cases = [
  { task: '反编译这个 exe，看看 main 附近做了什么', target: 'C:/tmp/demo.exe', want: 'native-binary' },
  { task: '这个 APK 的登录参数加密怎么还原，找 sign 算法', target: 'C:/tmp/app.apk', want: 'android-apk' },
  { task: '网站登录的 sign 参数怎么生成的，前端 JS 里找', want: 'web-js' },
  { task: '把 app.asar 解包，看看 IPC 通信', target: 'C:/tmp/app.asar', want: 'electron-desktop' },
  { task: '抓包文件 har 分析请求参数', target: 'C:/tmp/session.har', want: 'protocol-capture' },
  { task: '固件提取文件系统', target: 'C:/tmp/fw.bin', want: 'firmware' },
  { task: 'unity 游戏 dll 的 c# 逻辑', target: 'C:/tmp/Assembly-CSharp.dll', want: 'dotnet-managed' },
];
for (const c of cases) {
  const r = textOf(await client.callTool('rehub_route', { task: c.task, target: c.target }));
  check(`路由「${c.task.slice(0, 18)}…」→ ${c.want}`, r?.scenario === c.want, `got ${r?.scenario} (${r?.confidence})`);
  check(`路由「${c.task.slice(0, 12)}…」带 chapter`, typeof r?.chapter === 'string' && r.chapter.length > 0);
}

// 模糊输入 → triage / low
const vague = textOf(await client.callTool('rehub_route', { task: '帮我看看这个东西' }));
check('模糊输入给出澄清问题', Array.isArray(vague?.clarify) && vague.clarify.length > 0);

// 4) plan
const plan = textOf(await client.callTool('rehub_plan', { scenario: 'native-binary', target: 'C:/tmp/demo.exe' }));
check('plan 返回步骤', Array.isArray(plan?.steps) && plan.steps.length >= 3);
check('plan 标注未解析参数', Array.isArray(plan?.unresolved));
check('plan 带证据要求', Array.isArray(plan?.evidencePlan) && plan.evidencePlan.length > 0);
check('plan 带 chapter 指针', plan?.chapter === '01-native-binary');

// 5) exec error shape
const bad = textOf(await client.callTool('rehub_exec', { backend: 'nonexistent-backend', op: 'x' }));
check('无效后端返回结构化错误', bad?.ok === false && typeof bad.error === 'string');

// 5b) install: unknown tool → structured error (no network touched)
const badInstall = textOf(await client.callTool('rehub_install', { only: ['nope'] }));
check('install 未知工具返回错误', typeof badInstall?.error === 'string' && /未知工具/.test(badInstall.error));

// 6) evidence round-trip
const appended = textOf(await client.callTool('rehub_evidence', {
  action: 'append',
  record: { task: 'smoke', scenario: 'native-binary', target: 'C:/tmp/demo.exe', kind: 'observation', summary: 'smoke-test observation', unknowns: ['demo'] },
}));
check('evidence append 返回 id', typeof appended?.id === 'string');
const listed = textOf(await client.callTool('rehub_evidence', { action: 'list', limit: 5 }));
check('evidence list 含刚才记录', (listed?.records || []).some((r) => r.id === appended?.id));
const report = textOf(await client.callTool('rehub_evidence', { action: 'report', title: 'Smoke Report' }));
check('evidence report 生成 markdown', typeof report?.markdown === 'string' && report.markdown.includes('# Smoke Report'));

await client.close();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
