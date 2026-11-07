#!/usr/bin/env node
// End-to-end smoke test: spawn the RE Hub MCP server as a real stdio client,
// exercise tools/list + routing + planning + evidence.
import { McpClient } from '../src/lib/mcp.mjs';
import { resolveStep } from '../src/capabilities.mjs';
import { checkTaskCanExecute } from '../src/tasks.mjs';
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
check('tools/list 返回 11 个工具', tools.tools?.length === 11, `got ${tools.tools?.length}`);
const names = (tools.tools || []).map((t) => t.name);
for (const n of ['rehub_detect', 'rehub_scenarios', 'rehub_route', 'rehub_classify', 'rehub_plan', 'rehub_exec', 'rehub_mcp', 'rehub_evidence', 'rehub_verify', 'rehub_book', 'rehub_install']) {
  check(`工具存在: ${n}`, names.includes(n));
}

// 1) detect
const detect = textOf(await client.callTool('rehub_detect', {}));
check('detect 报告 rea 可用', detect?.backends?.rea?.available === true);
check('detect 报告 ghidra 可用', detect?.backends?.ghidra?.available === true);
check('detect 给出 summary', typeof detect?.summary === 'string' && detect.summary.length > 0);
check('detect 统计 vendor 仓库', (detect?.vendor?.count ?? 0) >= 0);
check('detect 区分 installed/runnable/usable', detect?.backends?.x64dbg?.status?.installed === true && typeof detect.backends.x64dbg.status.usable === 'boolean');
check('detect 带能力注册表', Array.isArray(detect?.capabilities) && detect.capabilities.length >= 20);
check('detect 带缓存状态', detect?.cache && typeof detect.cache.cached === 'boolean');

// 2) scenarios
const scenarios = textOf(await client.callTool('rehub_scenarios', {}));
check('scenarios 数量 15', scenarios?.count === 15, `got ${scenarios?.count}`);
check('scenarios 带 chapter 指针', typeof scenarios?.scenarios?.[0]?.chapter === 'string');

// 2b) book
const toc = textOf(await client.callTool('rehub_book', {}));
check('book 目录 21 项（00 + 15 章 + 5 附录）', toc?.chapters?.length === 21, `got ${toc?.chapters?.length}`);
const ch4 = textOf(await client.callTool('rehub_book', { chapter: '04' }));
check('book 按序号取章（04）', ch4?.ok === true && /Web/.test(ch4.content));
const chByScenario = textOf(await client.callTool('rehub_book', { chapter: 'web-js' }));
check('book 按 scenario id 取章', chByScenario?.ok === true && chByScenario.id === '04-web-js');
const chMissing = textOf(await client.callTool('rehub_book', { chapter: 'nope' }));
check('book 未知章返回可用列表', chMissing?.ok === false && Array.isArray(chMissing.available));
const chE = textOf(await client.callTool('rehub_book', { chapter: 'E' }));
check('book 附录 E 可取（任务状态/验证）', chE?.ok === true && /任务状态/.test(chE.content));

// 2c) target classification → static/dynamic/ui chains
const classCases = [
  { task: '网站登录的 sign 参数怎么生成的，前端 JS 里找', target: 'https://example.com', want: 'web', sub: 'web-sign' },
  { task: '这个 APK 的登录参数加密怎么还原', target: 'C:/tmp/app.apk', want: 'app', sub: 'android' },
  { task: 'ipa 里看看用了什么框架', target: 'C:/tmp/app.ipa', want: 'app', sub: 'ios' },
  { task: '微信小程序 wxapkg 解包看逻辑', target: 'C:/tmp/wx.wxapkg', want: 'app', sub: 'miniprogram' },
  { task: '反编译这个 exe，看看 main 附近做了什么', target: 'C:/tmp/demo.exe', want: 'software', sub: 'windows-native' },
  { task: 'unity 游戏 dll 的 c# 逻辑', target: 'C:/tmp/Assembly-CSharp.dll', want: 'software', sub: 'dotnet' },
  { task: '把 app.asar 解包，看看 IPC 通信', target: 'C:/tmp/app.asar', want: 'software', sub: 'electron' },
  { task: '用 MCP 自动化逆向整个流程，批量分析 exe', target: 'C:/tmp/agent.exe', want: 'ai-automation', sub: 'mcp-pipeline' },
];
for (const c of classCases) {
  const r = textOf(await client.callTool('rehub_classify', { task: c.task, target: c.target }));
  check(`对象分类「${c.task.slice(0, 14)}…」→ ${c.want}/${c.sub}`, r?.objectType === c.want && r?.subtype?.id === c.sub, `got ${r?.objectType}/${r?.subtype?.id}`);
  check(`对象分类「${c.task.slice(0, 10)}…」带 static/dynamic/ui 链路`, ['static', 'dynamic', 'ui'].every((m) => r?.chains?.[m]?.chapter));
}
const aiCls = textOf(await client.callTool('rehub_classify', { task: '用 MCP 自动化逆向整个流程，批量分析 exe', target: 'C:/tmp/agent.exe' }));
check('AI 自动化分类给出底层对象', aiCls?.underlying?.objectType === 'software', `got ${aiCls?.underlying?.objectType}`);
const unknownCls = textOf(await client.callTool('rehub_classify', { task: '帮我看看这个东西' }));
check('对象分类弱输入 → unknown + 澄清', unknownCls?.objectType === 'unknown' && unknownCls?.clarify?.length > 0);
const tax = textOf(await client.callTool('rehub_classify', {}));
check('对象分类无参返回 4 类目录', tax?.taxonomy?.length === 4, `got ${tax?.taxonomy?.length}`);

// 3) routing
const cases = [
  { task: '反编译这个 exe，看看 main 附近做了什么', target: 'C:/tmp/demo.exe', want: 'native-binary' },
  { task: '这个 APK 的登录参数加密怎么还原，找 sign 算法', target: 'C:/tmp/app.apk', want: 'android-apk' },
  { task: '网站登录的 sign 参数怎么生成的，前端 JS 里找', want: 'web-js' },
  { task: '把 app.asar 解包，看看 IPC 通信', target: 'C:/tmp/app.asar', want: 'electron-desktop' },
  { task: '抓包文件 har 分析请求参数', target: 'C:/tmp/session.har', want: 'protocol-capture' },
  { task: '固件提取文件系统', target: 'C:/tmp/fw.bin', want: 'firmware' },
  { task: 'unity 游戏 dll 的 c# 逻辑', target: 'C:/tmp/Assembly-CSharp.dll', want: 'dotnet-managed' },
  { task: '用 x64dbg 动态调试这个 exe，下断点看调用', target: 'C:/tmp/demo.exe', want: 'dynamic-analysis' },
  { task: '把这个软件界面控件树导出来，复刻 UI', target: 'C:/tmp/app.exe', want: 'ui-reverse' },
];
for (const c of cases) {
  const r = textOf(await client.callTool('rehub_route', { task: c.task, target: c.target }));
  check(`路由「${c.task.slice(0, 18)}…」→ ${c.want}`, r?.scenario === c.want, `got ${r?.scenario} (${r?.confidence})`);
  check(`路由「${c.task.slice(0, 12)}…」带 chapter`, typeof r?.chapter === 'string' && r.chapter.length > 0);
}

// 3b) route also returns object classification + mode chains
const routedObj = textOf(await client.callTool('rehub_route', { task: '反编译这个 exe，看看 main 附近做了什么', target: 'C:/tmp/demo.exe' }));
check('route 带对象分类', routedObj?.object?.type === 'software' && routedObj?.object?.subtype?.id === 'windows-native', `got ${routedObj?.object?.type}/${routedObj?.object?.subtype?.id}`);
check('route 带 static/dynamic/ui 三链路', Array.isArray(routedObj?.modes) && ['static', 'dynamic', 'ui'].every((m) => routedObj.modes.some((x) => x.mode === m)));
check('route 模式链路带就绪状态', Array.isArray(routedObj?.modes?.[0]?.readiness?.requiresReady));
check('route 带统一解析字段（schemaVersion/intent/假设/不确定项）', routedObj?.schemaVersion === '2.0' && typeof routedObj?.intent?.id === 'string' && Array.isArray(routedObj?.assumptions) && Array.isArray(routedObj?.uncertainties));
check('route 表达 installed/usable 能力状态', routedObj?.object?.type === 'software');

// 3c) route/classify 必须来自同一次统一解析
const clsSame = textOf(await client.callTool('rehub_classify', { task: '反编译这个 exe，看看 main 附近做了什么', target: 'C:/tmp/demo.exe' }));
check('route/classify 同解析且字段兼容', clsSame?.objectType === routedObj?.object?.type && clsSame?.schemaVersion === routedObj?.schemaVersion && clsSame?.confidence === routedObj?.confidence);

// 模糊输入 → triage / low
const vague = textOf(await client.callTool('rehub_route', { task: '帮我看看这个东西' }));
check('模糊输入给出澄清问题', Array.isArray(vague?.clarify) && vague.clarify.length > 0);

// 4) plan
const plan = textOf(await client.callTool('rehub_plan', { scenario: 'native-binary', target: 'C:/tmp/demo.exe' }));
check('plan 返回步骤', Array.isArray(plan?.steps) && plan.steps.length >= 3);
check('plan 标注未解析参数', Array.isArray(plan?.unresolved));
check('plan 带证据要求', Array.isArray(plan?.evidencePlan) && plan.evidencePlan.length > 0);
check('plan 带 chapter 指针', plan?.chapter === '01-native-binary');

// 4b) plan by object + mode
const modePlan = textOf(await client.callTool('rehub_plan', { objectType: 'software', subtype: 'windows-native', mode: 'dynamic', target: 'C:/tmp/demo.exe' }));
check('plan 按对象+模式生成动态链路', modePlan?.mode === 'dynamic' && modePlan?.chapter === '14-dynamic' && modePlan?.steps?.some((s) => s.backend === 'x64dbg'), `got ${modePlan?.mode}/${modePlan?.chapter}`);
check('plan 按模式标注未解析参数', Array.isArray(modePlan?.unresolved));
const webPlan = textOf(await client.callTool('rehub_plan', { objectType: 'web', mode: 'static', target: 'https://example.com' }));
check('plan web 静态链路→04', webPlan?.chapter === '04-web-js' && webPlan?.steps?.some((s) => s.backend === 'rea'));

// 4c) task graph: versioned plan, step ids, capabilities, budget, stop conditions
const taskPlan = textOf(await client.callTool('rehub_plan', { scenario: 'dynamic-analysis', target: 'C:/tmp/demo.exe' }));
check('plan 创建任务并版本化', typeof taskPlan?.taskId === 'string' && taskPlan?.planVersion === 1 && taskPlan?.schemaVersion === '2.0');
check('plan 步骤带 stepId/capability/副作用/期望证据', taskPlan?.steps?.[0]?.stepId === 'step-1' && typeof taskPlan?.steps?.[0]?.capability === 'string' && typeof taskPlan?.steps?.[0]?.sideEffects === 'boolean' && typeof taskPlan?.steps?.[0]?.expectedEvidence === 'string');
check('plan 带停止条件', Array.isArray(taskPlan?.stopConditions) && taskPlan.stopConditions.length >= 3);
const planById = textOf(await client.callTool('rehub_plan', { taskId: taskPlan.taskId }));
check('plan 仅 taskId 返回任务状态', planById?.taskId === taskPlan.taskId && Array.isArray(planById?.task?.steps));
const shortPlan = textOf(await client.callTool('rehub_plan', { objectType: 'software', subtype: 'windows-native', mode: 'dynamic', target: 'C:/tmp/demo.exe', constraints: { maxSteps: 2 } }));
check('plan 预算截断步骤', shortPlan?.steps?.length === 2 && shortPlan?.truncated === true);

// 4d) capability registry fallback (unit-level, simulated env)
const fallback = resolveStep({ backends: { rea: { available: false }, ghidra: { available: true } }, mcp: {} }, { backend: 'rea', op: 'analyze', args: { path: 'x' } });
check('能力回退：首选后端不可用→等效后端', fallback?.effective?.backend === 'ghidra' && !!fallback?.availability?.fallback);

// 4d-2) budget + side-effect gates (unit-level, deterministic)
const baseTask = (constraints, step) => ({ taskId: 't', status: 'running', createdAt: new Date().toISOString(), constraints, steps: { 'step-1': step } });
const budgetTask = { taskId: 't', status: 'running', createdAt: new Date().toISOString(), constraints: { maxSteps: 1, budgetMs: 10000 }, steps: { 'step-1': { stepId: 'step-1', state: 'succeeded', sideEffects: false }, 'step-2': { stepId: 'step-2', state: 'pending', sideEffects: false } } };
check('预算耗尽拒绝继续执行', checkTaskCanExecute(budgetTask, 'step-2')?.code === 'task-budget-exhausted');
const sideTask = baseTask({ maxSteps: 10, budgetMs: 10000 }, { stepId: 'step-1', state: 'pending', sideEffects: true });
check('副作用步骤需显式确认', checkTaskCanExecute(sideTask, 'step-1')?.code === 'side-effect-not-confirmed' && checkTaskCanExecute(sideTask, 'step-1', { confirm: true })?.ok === true);

// 4e) task-aware exec: success / side-effect gate / failure recovery
const statePlan = textOf(await client.callTool('rehub_plan', { objectType: 'software', subtype: 'windows-native', mode: 'dynamic', target: 'C:/tmp/demo.exe', options: { pid: 1 } }));
const okStep = textOf(await client.callTool('rehub_exec', { taskId: statePlan.taskId, stepId: 'step-1' }));
check('exec 记录成功步骤状态', okStep?.ok === true && okStep?.task?.steps?.find((s) => s.stepId === 'step-1')?.state === 'succeeded');
const needConfirm = textOf(await client.callTool('rehub_exec', { taskId: statePlan.taskId, stepId: 'step-2' }));
check('exec 副作用步骤需 confirm', needConfirm?.code === 'side-effect-not-confirmed' && needConfirm?.recovery?.action === 'confirm');
const failedStep = textOf(await client.callTool('rehub_exec', { taskId: statePlan.taskId, stepId: 'step-4' }));
check('exec 失败归类 missing-capability', failedStep?.ok === false && failedStep?.code === 'needs-elevation' && failedStep?.recovery?.category === 'missing-capability');
const stateAfter = textOf(await client.callTool('rehub_plan', { taskId: statePlan.taskId }));
const blockedStep = stateAfter?.task?.steps?.find((s) => s.stepId === 'step-4');
check('任务记录 blocked 状态与恢复动作', blockedStep?.state === 'blocked' && blockedStep?.recovery?.action === 'authorize-or-switch');

// 4f) evidence vs claim + three-layer verify + unified report
const evRec = textOf(await client.callTool('rehub_evidence', { action: 'append', taskId: statePlan.taskId, stepId: 'step-1', record: { kind: 'observation', observation: 'x64dbg info 成功', sourceTool: 'x64dbg', sourceTarget: 'C:/tmp/demo.exe' } }));
check('evidence 记录 taskId/stepId/evidenceId', evRec?.taskId === statePlan.taskId && evRec?.stepId === 'step-1' && typeof evRec?.evidenceId === 'string');
const evHash = textOf(await client.callTool('rehub_evidence', { action: 'append', taskId: statePlan.taskId, record: { kind: 'observation', observation: '带文件哈希的证据', artifactRef: path.resolve(__dirname, '..', 'README.md'), artifactType: 'report' } }));
check('evidence 自动计算 artifact sha256', /^[a-f0-9]{64}$/.test(evHash?.integrity?.sha256 || ''));
const claimOk = textOf(await client.callTool('rehub_evidence', { action: 'claim', taskId: statePlan.taskId, claim: { text: '目标可被 x64dbg 打开', kind: 'observed', evidenceRefs: [evRec.evidenceId] } }));
check('claim 独立记录', typeof claimOk?.claimId === 'string' && claimOk?.kind === 'observed');
const claimBad = textOf(await client.callTool('rehub_evidence', { action: 'claim', taskId: statePlan.taskId, claim: { text: '缺失证据的结论', kind: 'observed', evidenceRefs: ['ev_missing'] } }));
check('claim 缺失证据引用可记录', typeof claimBad?.claimId === 'string');
const ver = textOf(await client.callTool('rehub_verify', { taskId: statePlan.taskId }));
check('verify 返回三层结构', ver?.execution && ver?.fact && ver?.delivery && typeof ver?.overall === 'string');
check('事实层 supported', ver?.fact?.claims?.some((c) => c.claimId === claimOk.claimId && c.status === 'supported'));
check('事实层 insufficient（证据缺失）', ver?.fact?.claims?.some((c) => c.claimId === claimBad.claimId && c.status === 'insufficient'));
const inlineVer = textOf(await client.callTool('rehub_verify', { claims: [{ text: 'inline 无证据', kind: 'observed', evidenceRefs: [] }] }));
check('无状态 verify 可运行', inlineVer?.fact?.summary?.total === 1 && inlineVer?.fact?.claims?.[0]?.status === 'insufficient');
const v2Report = textOf(await client.callTool('rehub_evidence', { action: 'report', taskId: statePlan.taskId, title: 'v2 报告' }));
check('统一报告含任务/结论/验证', /## 任务与授权/.test(v2Report?.markdown || '') && /## 结论与证据映射/.test(v2Report?.markdown || '') && /## 验证覆盖/.test(v2Report?.markdown || ''));

// 5) exec error shape
const bad = textOf(await client.callTool('rehub_exec', { backend: 'nonexistent-backend', op: 'x' }));
check('无效后端返回结构化错误', bad?.ok === false && typeof bad.error === 'string');

// 5b) install: unknown tool → structured error (no network touched)
const badInstall = textOf(await client.callTool('rehub_install', { only: ['nope'] }));
check('install 未知工具返回错误', typeof badInstall?.error === 'string' && /未知工具/.test(badInstall.error));
const noAuthInstall = textOf(await client.callTool('rehub_install', { only: ['nope'], dryRun: false }));
check('install 未授权拒绝执行', noAuthInstall?.ok === false && noAuthInstall?.requiresAuthorization === true);
const authInstall = textOf(await client.callTool('rehub_install', { only: ['nope'], dryRun: false, authorize: true }));
check('install 授权后走到未知工具错误', /未知工具/.test(authInstall?.error || ''));

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
