// Unified task intake: ONE parse shared by rehub_route / rehub_classify / rehub_plan.
// Produces the v2 contract (intent + object + modes + constraints + assumptions
// + uncertainties) while keeping the legacy route/classify projections intact.
import { routeTask } from './scenarios.mjs';
import { classifyTarget } from './targets.mjs';

export const SCHEMA_VERSION = '2.0';

export const DEFAULT_CONSTRAINTS = {
  authorization: 'required', // required | confirmed | not-required
  maxSteps: 40,
  maxRetries: 1,
  budgetMs: 15 * 60 * 1000,
  allowInstall: false,
  readOnlyFirst: true,
};

const INTENTS = [
  { id: 'restore_algorithm', label: '还原算法/参数/签名', phrases: ['签名算法', '加密参数', '参数怎么生成', '怎么算的', 'sign 参数', '还原算法', '加密方式'], keywords: ['算法', '签名', '加密', '解密', 'sign', 'token'] },
  { id: 'inspect_flow', label: '理解流程/功能实现', phrases: ['看看怎么实现', '做什么的', '调用链', '业务流程', '功能原理', '执行流程', '逻辑是什么'], keywords: ['流程', '功能', '实现', '调用', '逻辑', '原理', '机制'] },
  { id: 'trace_runtime', label: '运行时追踪/断点/hook', phrases: ['动态调试', '下断点', '单步', 'hook', '运行时追踪', 'trace'], keywords: ['动态', '断点', '调试', 'hook', 'trace', '运行时', 'frida', 'x64dbg'] },
  { id: 'extract_config', label: '提取配置/密钥/端点', phrases: ['配置文件', '密钥', '端点地址', '接口地址', '证书', '内置 token'], keywords: ['配置', '密钥', 'key', 'token', '端点', '证书'] },
  { id: 'inspect_http', label: '接口/网络分析', phrases: ['接口分析', '请求参数', '响应数据', '抓包', '网络请求', 'websocket'], keywords: ['接口', 'http', '请求', '响应', '抓包', 'api', '协议', '网络'] },
  { id: 'inspect_dom', label: '页面/DOM 结构', phrases: ['页面结构', 'dom 结构', '样式结构', '前端页面'], keywords: ['dom', '页面', 'css', '样式', 'html'] },
  { id: 'replicate_ui', label: 'UI/界面复刻', phrases: ['界面复刻', '复刻界面', '界面还原', '控件树', 'ui 原型', '布局还原', '菜单结构'], keywords: ['界面', '控件', '复刻', '原型', '布局', '菜单', 'ui'] },
  { id: 'dump_memory', label: '内存 dump/脱壳', phrases: ['内存 dump', '内存dump', '脱壳', 'dump 镜像', '加壳'], keywords: ['dump', '脱壳', '内存', '加壳', 'vmprotect', 'vmp'] },
  { id: 'decompile_code', label: '反编译/看代码', phrases: ['反编译', '伪代码', '看源码', '代码逻辑', '反汇编'], keywords: ['反编译', '伪代码', '源码', '反汇编', '汇编', 'cil'] },
  { id: 'analyze_artifact', label: '安装包/归档分析', phrases: ['安装包', '解包', '包结构', '文件清单', '归档结构'], keywords: ['安装包', '解包', '包结构', '清单', '归档', 'ipa', 'apk', 'asar', 'msix'] },
];

function detectIntent(text) {
  let best = { id: 'unspecified', label: '未明确（按观察/行为处理）', confidence: 'low', reasons: [] };
  let bestScore = 0;
  for (const it of INTENTS) {
    let score = 0;
    const reasons = [];
    for (const p of it.phrases) if (text.includes(p.toLowerCase())) { score += 3; reasons.push(`phrase:${p}`); }
    for (const k of it.keywords) if (text.includes(k.toLowerCase())) { score += 1; reasons.push(`kw:${k}`); }
    if (score > bestScore) { bestScore = score; best = { id: it.id, label: it.label, confidence: score >= 5 ? 'high' : 'medium', reasons }; }
  }
  return best;
}

function normalizeConstraints(raw = {}) {
  const c = { ...DEFAULT_CONSTRAINTS, ...(raw || {}) };
  const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
  c.maxSteps = Math.min(200, num(c.maxSteps, DEFAULT_CONSTRAINTS.maxSteps));
  c.maxRetries = Math.min(5, Math.max(0, num(c.maxRetries, DEFAULT_CONSTRAINTS.maxRetries)));
  c.budgetMs = num(c.budgetMs, DEFAULT_CONSTRAINTS.budgetMs);
  c.allowInstall = c.allowInstall === true;
  c.readOnlyFirst = c.readOnlyFirst !== false;
  return c;
}

/**
 * Parse a task once into the v2 contract.
 * @param {{task?:string,target?:string,hints?:string[],constraints?:object,desiredOutput?:string|string[]}} input
 */
export function parseTask({ task = '', target = '', hints = [], constraints = {}, desiredOutput = [] } = {}) {
  const route = routeTask({ task, target, hints });
  const classification = classifyTarget({ task, target, hints });
  const text = `${task} ${target} ${(hints || []).join(' ')}`.toLowerCase();
  const intent = detectIntent(text);
  const cons = normalizeConstraints(constraints);
  const desired = Array.isArray(desiredOutput) ? desiredOutput.filter(Boolean) : (desiredOutput ? [String(desiredOutput)] : []);

  const assumptions = [];
  const uncertainties = [];

  if (!target && route.confidence !== 'low') {
    assumptions.push('未提供 target：按任务描述推断对象形态，执行前需用真实路径/URL 复核。');
  }
  if (classification.objectType !== 'unknown' && !classification.subtype) {
    assumptions.push('对象子类未细分：按该对象类别的默认链路执行；可用 hints 指定子类。');
  }
  const needsCdp = classification.objectType === 'web' || (classification.modes || []).some((m) => (m.require || []).includes('chrome'));
  if (needsCdp && !constraints.cdpEndpoint) {
    assumptions.push('浏览器调试端口未提供：默认 cdpEndpoint=http://127.0.0.1:9222。');
  }
  if (cons.authorization === 'required') {
    assumptions.push('授权状态未声明：按「需要授权」处理，执行侧对未知/第三方目标只做只读观察。');
  }

  if (route.confidence === 'low') uncertainties.push({ field: 'scenario', reason: '场景置信度 low', action: '向用户澄清或补 target' });
  if (route.confidence === 'medium') uncertainties.push({ field: 'scenario', reason: '场景置信度 medium，存在备选场景', action: '用 alternatives 校验' });
  if (classification.objectType === 'unknown') uncertainties.push({ field: 'objectType', reason: '对象类型未识别', action: '澄清四类对象' });
  if (classification.objectType === 'ai-automation' && !classification.underlying) {
    uncertainties.push({ field: 'underlying', reason: 'AI 自动化任务未识别底层对象', action: '补 target 或说明被分析对象' });
  }
  if (['ios', 'miniprogram'].includes(classification.subtype?.id) && (classification.modes || []).some((m) => m.mode === 'ui')) {
    uncertainties.push({ field: 'ui', reason: '该子类的 UI 链路受限（无专用后端）', action: '按第 15 章人工采集或降级为截图重画' });
  }

  const confidence = route.confidence === 'low' || classification.confidence === 'low'
    ? 'low'
    : (route.confidence === 'high' && classification.confidence === 'high' ? 'high' : 'medium');

  return {
    schemaVersion: SCHEMA_VERSION,
    parsedAt: new Date().toISOString(),
    input: { task, target, hints },
    // task intent: what the user wants to know (orthogonal to object + scenario)
    intent,
    // target object: what is being reversed
    object: {
      type: classification.objectType,
      label: classification.label,
      desc: classification.desc,
      subtype: classification.subtype,
      confidence: classification.confidence,
      reasons: classification.reasons,
    },
    underlyingObjects: classification.underlying
      ? [{ type: classification.underlying.objectType, label: classification.underlying.label, subtype: classification.underlying.subtype }]
      : [],
    // analysis modes are candidates, combinable and adjustable during execution
    modes: (classification.modes || []).map((m) => m.mode),
    modeChains: classification.modes || [],
    // planning template / chapter index (legacy 15-scenario projection)
    scenario: {
      id: route.scenario,
      title: route.title,
      chapter: route.chapter,
      summary: route.summary,
      confidence: route.confidence,
      score: route.score,
      reasons: route.reasons,
      alternatives: route.alternatives,
    },
    constraints: cons,
    desiredOutput: desired,
    assumptions,
    uncertainties,
    clarify: [...new Set([...(route.clarify || []), ...(classification.clarify || [])])],
    confidence,
    // raw projections for backward-compatible responses
    route,
    classification,
  };
}

/** Compact header used by route/classify responses. */
export function intakeHeader(intake) {
  return {
    schemaVersion: intake.schemaVersion,
    parsedAt: intake.parsedAt,
    intent: intake.intent,
    object: intake.object,
    underlyingObjects: intake.underlyingObjects,
    modes: intake.modes,
    constraints: intake.constraints,
    desiredOutput: intake.desiredOutput,
    assumptions: intake.assumptions,
    uncertainties: intake.uncertainties,
    confidence: intake.confidence,
  };
}
