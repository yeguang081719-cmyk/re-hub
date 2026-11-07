#!/usr/bin/env node
// RE Hub — one MCP gateway for scenario-routed reverse engineering.
//
// Tools are intentionally few and stable; the routing knowledge lives in
// scenarios.mjs and in the bundled skill. Backends are real command adapters.

import fs from 'node:fs';
import path from 'node:path';
import { startMcpServer, McpClient } from './lib/mcp.mjs';
import { loadConfig, detectEnvironment, annotateScenario, PROJECT_ROOT, invalidateDetectCache } from './detect.mjs';
import { routeTask, planScenario, scenarioCatalog, SCENARIOS } from './scenarios.mjs';
import { classifyTarget, planTargetMode, taxonomyCatalog, MODE_ORDER } from './targets.mjs';
import { parseTask, intakeHeader, SCHEMA_VERSION } from './intake.mjs';
import { isSideEffect } from './capabilities.mjs';
import { buildTaskPlan, STOP_CONDITIONS } from './orchestrator.mjs';
import {
  loadTask, saveTask, recordStepStart, recordStepResult,
  checkTaskCanExecute, taskSummary, linkEvidence, addClaim,
} from './tasks.mjs';
import { verifyAll } from './verify.mjs';
import { appendEvidence, appendClaim, listEvidence, buildReport, readEvidenceRecords } from './evidence.mjs';
import { execBackend } from './backends.mjs';
import { runInstaller } from './installer.mjs';

const VERSION = '1.0.0';
const log = (msg) => process.stderr.write(`[rehub] ${msg}\n`);

// Config is hot-reloaded when config.json's mtime changes (e.g. after the
// installer downloads JADX/apktool), so no DSH restart is needed for backend
// additions; only the MCP registration itself needs a restart.
const CONFIG_PATH = process.env.REHUB_CONFIG || path.join(PROJECT_ROOT, 'config.json');
let cfgCache = loadConfig();
let cfgMtime = 0;
try { cfgMtime = fs.statSync(CONFIG_PATH).mtimeMs; } catch { /* ignore */ }

function getCfg() {
  try {
    const m = fs.statSync(CONFIG_PATH).mtimeMs;
    if (m !== cfgMtime) {
      cfgCache = loadConfig();
      cfgMtime = m;
      invalidateDetectCache();
    }
  } catch { /* ignore */ }
  return cfgCache;
}

const mcpClients = new Map();

function getMcpClient(backend) {
  const spec = getCfg().mcpBackends?.[backend];
  if (!spec) throw new Error(`未知子 MCP 后端: ${backend}。已配置：${Object.keys(getCfg().mcpBackends || {}).join(', ') || '无'}`);
  if (spec.disabled) throw new Error(`子 MCP 后端 ${backend} 被禁用（config.json 里 disabled=true）`);
  if (!mcpClients.has(backend)) {
    const client = new McpClient(spec, { timeoutMs: getCfg().defaultTimeoutMs });
    mcpClients.set(backend, client);
  }
  return mcpClients.get(backend);
}

async function ensureMcpStarted(backend) {
  const client = getMcpClient(backend);
  if (!client.child) await client.start();
  return client;
}

function closeAll() {
  for (const [, c] of mcpClients) c.close().catch(() => {});
  mcpClients.clear();
}

/* ------------------------------------------------------------------ */
/* Orchestration helpers: capability fallback, recovery, task lifecycle */
/* ------------------------------------------------------------------ */

function summarizeArgs(args = {}) {
  try {
    const s = JSON.stringify(args);
    return s.length > 300 ? `${s.slice(0, 300)}…` : s;
  } catch { return null; }
}

/** Classify an execution failure into a recovery category/action. */
function classifyRecovery(result = {}, { sideEffects = false } = {}) {
  if (result.ok) return { category: 'none', action: 'continue', retryable: false };
  const code = result.code || '';
  if (code === 'needs-elevation') return { category: 'missing-capability', action: 'authorize-or-switch', retryable: false, hint: '以管理员（High）启动 DSH，或改用等效能力' };
  if (code === 'backend-unavailable') return { category: 'missing-capability', action: 'switch-backend-or-install', retryable: false, hint: result.install ? `安装：${result.install}` : '换用等效后端' };
  if (code === 'side-effect-not-confirmed') return { category: 'authorization', action: 'confirm', retryable: false, hint: '该步骤有副作用，需 confirm:true 后执行' };
  if (result.timedOut) return { category: 'transient', action: sideEffects ? 'replan-or-stop' : 'retry', retryable: !sideEffects, hint: '超时：可有限重试；有副作用的步骤不自动重试' };
  if (/access denied|permission|denied/i.test(result.error || result.stderr || '')) return { category: 'authorization', action: 'stop', retryable: false, hint: '权限/授权不足，停止受影响步骤' };
  return { category: 'execution', action: 'replan-or-stop', retryable: false, hint: '执行失败：查看输出后局部重规划或停止' };
}

function finalizeIfDone(task, cfg) {
  const steps = Object.values(task.steps || {});
  if (!steps.length) return;
  if (steps.some((s) => ['pending', 'running'].includes(s.state))) return;
  const blocked = steps.filter((s) => s.state === 'blocked').length;
  const failed = steps.filter((s) => s.state === 'failed').length;
  task.status = blocked ? 'blocked' : failed ? 'failed' : 'completed';
  saveTask(task, cfg);
}

const tools = [
  {
    name: 'rehub_detect',
    description:
      '侦察本机逆向能力：REA/Ghidra/JADX/apktool/Chrome/adb/Frida/IDA/BinaryNinja/子 MCP 是否可用，vendor 仓库数量，缺失项附安装提示。任何逆向任务第一步都先跑它。',
    inputSchema: { type: 'object', properties: { refresh: { type: 'boolean', description: '强制刷新检测缓存' } } },
    handler: async ({ refresh } = {}) => detectEnvironment(getCfg(), { refresh: !!refresh }),
  },
  {
    name: 'rehub_install',
    description:
      '按需下载逆向工具（官方 GitHub release，校验 sha256）：jadx / apktool / jadx-headless-mcp / rea / ghidra / x64dbg / pe-sieve。默认 dry-run（只报告将下载什么）；真正安装需 dryRun:false + authorize:true（安装会引入第三方代码，必须显式授权）。',
    inputSchema: {
      type: 'object',
      properties: {
        only: { type: 'array', items: { type: 'string' }, description: '工具 id 列表，如 ["jadx","apktool"]；省略=全部' },
        dryRun: { type: 'boolean', description: 'true（默认）只规划不下载；false 执行安装（需 authorize:true）' },
        authorize: { type: 'boolean', description: '显式授权安装/下载第三方工具' },
      },
    },
    handler: async ({ only, dryRun = true, authorize = false } = {}) => {
      if (dryRun === false && authorize !== true) {
        return {
          ok: false,
          requiresAuthorization: true,
          reason: '安装/下载会引入第三方代码，必须显式 authorize:true 才能执行（不会默认自动安装）。',
          hint: '先 dryRun:true 查看计划，确认后 gates 再传 dryRun:false + authorize:true。',
        };
      }
      const res = await runInstaller({ only: Array.isArray(only) ? only : undefined, dryRun: dryRun !== false, updateConfig: true });
      return { ...res, hint: dryRun === false ? '安装完成后请重新 rehub_detect 确认可用性' : '确认无误后用 dryRun:false + authorize:true 执行安装' };
    },
  },
  {
    name: 'rehub_scenarios',
    description: '列出 15 类逆向场景（原生/Android 静态/Android 动态/Web JS/Web 运行时/Electron/.NET/固件/抓包/归档/进程行为/漏洞研究/分诊/动态分析/UI 逆向）及各自链路。',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => ({ count: SCENARIOS.length, scenarios: scenarioCatalog() }),
  },
  {
    name: 'rehub_classify',
    description:
      '对象分类：判断要逆向的对象属于 网站 / App / 软件 / AI 自动化 哪一类（可细分 Android/iOS/小程序、原生/.NET/Electron/固件等），并为该类分配 静态(static) / 动态(dynamic) / UI(ui) 三条链路（含后端、步骤、章节、就绪状态）。不带 task 时返回分类目录。建议在任何逆向任务的第一步（detect 之后）调用。',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: '用户原话/任务描述' },
        target: { type: 'string', description: '目标路径或 URL（可选，能显著提高准确率）' },
        hints: { type: 'array', items: { type: 'string' }, description: '额外提示词（可选）' },
      },
    },
    handler: async ({ task = '', target = '', hints = [], constraints = {}, desiredOutput = [] } = {}) => {
      if (!task && !target) {
        return {
          ok: true,
          taxonomy: taxonomyCatalog(),
          modes: MODE_ORDER,
          usage: '传 task/target 进行分类；返回 objectType + subtype + static/dynamic/ui 三条链路。',
        };
      }
      const env = await detectEnvironment(getCfg());
      const intake = parseTask({ task, target, hints, constraints, desiredOutput });
      const cls = intake.classification;
      const chains = {};
      if (cls.objectType !== 'unknown') {
        for (const m of cls.modes) {
          const plan = planTargetMode({ objectType: cls.objectType, subtype: cls.subtype?.id, mode: m.mode, target });
          chains[m.mode] = {
            mode: m.mode,
            label: m.label,
            chapter: plan.chapter,
            scenario: plan.scenario,
            requires: plan.requires,
            optional: plan.optional,
            steps: plan.steps,
            unresolved: plan.unresolved,
            notes: plan.notes,
            limitations: plan.limitations,
            readiness: annotateScenario(env, { requires: plan.requires, optional: plan.optional }),
          };
        }
      }
      return {
        ...cls,
        schemaVersion: SCHEMA_VERSION,
        parsedAt: intake.parsedAt,
        intent: intake.intent,
        object: { type: cls.objectType, label: cls.label, subtype: cls.subtype },
        underlyingObjects: intake.underlyingObjects,
        modes: intake.modes,
        constraints: intake.constraints,
        desiredOutput: intake.desiredOutput,
        assumptions: intake.assumptions,
        uncertainties: intake.uncertainties,
        confidence: intake.confidence,
        chains,
      };
    },
  },
  {
    name: 'rehub_route',
    description:
      '意图识别与场景路由：输入用户原话 task（可带目标路径/URL），返回场景 id、置信度、理由、可用性、缺失依赖、澄清问题；同时返回对象分类（网站/App/软件/AI 自动化）与 static/dynamic/ui 三条模式链路。低置信度时必须先向用户澄清，不要硬选链路。',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: '用户原话/任务描述（中文或英文）' },
        target: { type: 'string', description: '目标路径或 URL（可选，能显著提高准确率）' },
        hints: { type: 'array', items: { type: 'string' }, description: '额外提示词（可选）' },
      },
      required: ['task'],
    },
    handler: async ({ task = '', target = '', hints = [], constraints = {}, desiredOutput = [] } = {}) => {
      const env = await detectEnvironment(getCfg());
      // Single unified parse shared with rehub_classify / rehub_plan.
      const intake = parseTask({ task, target, hints, constraints, desiredOutput });
      const route = intake.route;
      const cls = intake.classification;
      const scenario = SCENARIOS.find((s) => s.id === route.scenario);
      const readiness = annotateScenario(env, scenario);
      const missing = readiness.requiresReady.filter((r) => !r.ready).map((r) => ({
        backend: r.backend,
        install: env.backends[r.backend]?.install || env.mcp?.[r.backend]?.install || '见 rehub_detect 的 install 字段',
        role: env.backends[r.backend]?.role || null,
      }));
      const object = {
        type: cls.objectType,
        label: cls.label,
        subtype: cls.subtype,
        confidence: cls.confidence,
        reasons: cls.reasons,
        underlying: cls.underlying,
        clarify: cls.clarify,
      };
      const modes = cls.modes.map((m) => ({
        mode: m.mode,
        label: m.label,
        chapter: m.chapter,
        scenario: m.scenario,
        require: m.require,
        optional: m.optional,
        steps: m.steps,
        readiness: annotateScenario(env, { requires: m.require, optional: m.optional }),
      }));
      let next = null;
      if (route.confidence === 'low' || route.scenario === 'triage' || intake.object.type === 'unknown') {
        next = { action: 'clarify', questions: intake.clarify };
      } else if (missing.length > 0 && !readiness.requiresReady.some((r) => r.ready)) {
        next = { action: 'install-missing', missing, unauthorized: true, note: '安装需 dryRun:false + authorize:true' };
      } else {
        next = {
          action: 'plan',
          tool: 'rehub_plan',
          args: { scenario: route.scenario, target: target || '<target>', task, constraints: intake.constraints },
          // Non-critical missing inputs do not block: continue with an explicit warning.
          warnings: missing.length ? missing : [],
        };
      }
      return {
        ...route,
        schemaVersion: SCHEMA_VERSION,
        parsedAt: intake.parsedAt,
        intent: intake.intent,
        object,
        underlyingObjects: intake.underlyingObjects,
        modes,
        constraints: intake.constraints,
        desiredOutput: intake.desiredOutput,
        assumptions: intake.assumptions,
        uncertainties: intake.uncertainties,
        // unified confidence (scenario confidence kept separately for compat)
        confidence: intake.confidence,
        scenarioConfidence: route.confidence,
        readiness,
        missing,
        next,
      };
    },
  },
  {
    name: 'rehub_book',
    description:
      '这本书的目录与正文：不带 chapter 返回目录（00 使用说明 + 15 个场景章 + 5 个附录）；带 chapter 返回该章完整正文。chapter 可用 "04-web-js"/"04"/scenario id（如 "web-js"），附录 D 是对象分类 × 静态/动态/UI 链路矩阵，附录 E 是任务状态/能力/验证。rehub_route 返回的 chapter 直接传进来即可。',
    inputSchema: {
      type: 'object',
      properties: {
        chapter: { type: 'string', description: '章 id：04-web-js / 04 / web-js 等；省略则返回目录' },
      },
    },
    handler: async ({ chapter } = {}) => {
      const chapters = listChapters();
      if (!chapter) {
        return {
          title: '《逆向工程操作手册（RE Hub 版）》',
          chapters,
          usage: '先 rehub_route 拿到 chapter，再 rehub_book { chapter } 读那一章；不要整本读。',
        };
      }
      const ch = readChapter(chapter);
      if (!ch) return { ok: false, error: `未找到章节: ${chapter}`, available: chapters.map((c) => c.id) };
      return { ok: true, ...ch };
    },
  },
  {
    name: 'rehub_plan',
    description:
      '生成可执行任务图（版本化）：(a) 按场景 scenario；(b) 按对象+模式 objectType+mode；(c) 只传 taskId 查看已有任务。每步带 stepId / capability / 副作用标记 / 后端可用性 / 回退候选 / 期望证据；支持局部重规划（fromStep）与约束（maxSteps/maxRetries/budgetMs）。计划会落盘为任务，后续 rehub_exec 传 taskId+stepId 记录状态。',
    inputSchema: {
      type: 'object',
      properties: {
        scenario: { type: 'string', description: '场景 id（用法 a）' },
        objectType: { type: 'string', description: '对象类别（用法 b）：web/app/software/ai-automation' },
        subtype: { type: 'string', description: '对象子类（用法 b，可选）' },
        mode: { type: 'string', enum: ['static', 'dynamic', 'ui'], description: '链路模式（用法 b）' },
        taskId: { type: 'string', description: '已有任务 id：补计划/局部重规划/查看任务' },
        fromStep: { type: ['number', 'string'], description: '局部重规划的起点（step-N 或序号），之前的步骤保留状态' },
        changeReason: { type: 'string', description: '重规划原因（记录到 planHistory）' },
        target: { type: 'string', description: '目标路径/URL' },
        goal: { type: 'string', description: '用户最终要什么产出（可选）' },
        constraints: { type: 'object', description: '约束：authorization/maxSteps/maxRetries/budgetMs/allowInstall/readOnlyFirst' },
        desiredOutput: { type: 'array', items: { type: 'string' }, description: '期望交付物：report/ui-prototype/api-doc/code-structure 等' },
        resolveFallbacks: { type: 'boolean', description: '首选后端不可用时是否自动选等效能力（默认 true）' },
        options: { type: 'object', description: '链路参数：procedure/className/methodName/cdpEndpoint/targetId/package/device/workdir/process/query/pid 等' },
      },
    },
    handler: async ({ scenario, objectType, subtype = null, mode = null, taskId = null, fromStep = null, changeReason = null, target = '', goal = '', options = {}, constraints = {}, desiredOutput = [], resolveFallbacks = true } = {}) => {
      const cfg = getCfg();
      const env = await detectEnvironment(cfg);

      if (taskId && !scenario && !mode) {
        const task = loadTask(taskId, cfg);
        return { ok: true, taskId: task.taskId, task: taskSummary(task) };
      }

      const result = await buildTaskPlan({
        scenario, objectType, subtype, mode, taskId, target, goal, options,
        constraints, desiredOutput, changeReason, fromStep, resolveFallbacks, cfg, env,
      });
      const { task, intake, basePlan, planMeta, steps, truncated, missingDependencies } = result;

      const stepView = steps.map((s) => ({
        ...s,
        state: task.steps[s.stepId]?.state || 'pending',
        attempts: task.steps[s.stepId]?.attempts || 0,
      }));

      return {
        ok: true,
        schemaVersion: SCHEMA_VERSION,
        taskId: task.taskId,
        status: task.status,
        planVersion: task.planVersion,
        intent: intake.intent,
        object: intake.object,
        underlyingObjects: intake.underlyingObjects,
        modes: intake.modes,
        constraints: intake.constraints,
        desiredOutput: intake.desiredOutput,
        scenario: planMeta.scenario,
        chapter: basePlan.chapter,
        mode: planMeta.mode,
        chainLabel: basePlan.chainLabel || null,
        target,
        goal,
        workdir: basePlan.workdir || options.workdir || null,
        requires: basePlan.requires || [],
        optional: basePlan.optional || [],
        unresolved: basePlan.unresolved || [],
        steps: stepView,
        assumptions: task.assumptions,
        uncertainties: task.uncertainties,
        missingDependencies,
        truncated,
        stopConditions: STOP_CONDITIONS,
        evidencePlan: basePlan.evidencePlan || [
          '每完成一步 rehub_evidence action=append（带 taskId/stepId/artifactRef）',
          '结论用 action=claim 记录，再用 rehub_verify 校验',
        ],
        readiness: annotateScenario(env, { requires: basePlan.requires || [], optional: basePlan.optional || [] }),
        task: taskSummary(task),
      };
    },
  },
  {
    name: 'rehub_exec',
    description:
      '执行一步逆向操作（原子步骤）。backend=rea|jadx|apktool|ghidra|adb|frida|uia|x64dbg|pe-sieve，op 见各后端。传 taskId+stepId 时记录步骤状态（pending/running/succeeded/failed/blocked/skipped）、失败恢复类别与任务预算；有副作用的步骤（launch/attach/dump/install/extract）需要 confirm:true。返回结构化 data + 输出裁剪 + recovery。',
    inputSchema: {
      type: 'object',
      properties: {
        backend: { type: 'string', description: '后端 id（传 taskId+stepId 时可省略）' },
        op: { type: 'string', description: '操作名（传 taskId+stepId 时可省略）' },
        args: { type: 'object', description: '操作参数：path/target/procedure/className/methodName/out/args 等' },
        timeoutMs: { type: 'number', description: '覆盖默认超时' },
        taskId: { type: 'string', description: '任务 id（来自 rehub_plan）' },
        stepId: { type: 'string', description: '步骤 id（如 step-1）' },
        confirm: { type: 'boolean', description: '确认执行有副作用的步骤' },
        retry: { type: 'boolean', description: '瞬时错误是否按 maxRetries 重试（默认 true；副作用步骤不自动重试）' },
      },
    },
    handler: async ({ backend, op, args = {}, timeoutMs, taskId = null, stepId = null, confirm = false, retry = null } = {}) => {
      const cfg = getCfg();
      const started = Date.now();
      const env = await detectEnvironment(cfg);

      let task = null;
      let step = null;
      let effectiveBackend = backend;
      let effectiveOp = op;

      if (taskId) {
        task = loadTask(taskId, cfg);
        if (!stepId) throw new Error('taskId 需要同时提供 stepId（来自 rehub_plan 的 steps[].stepId）');
        const gate = checkTaskCanExecute(task, stepId, { confirm });
        if (!gate.ok) {
          if (gate.code === 'side-effect-not-confirmed') {
            recordStepResult(task, stepId, {
              result: { ok: false, code: gate.code, error: gate.reason },
              recovery: { category: 'authorization', action: 'confirm', retryable: false, hint: gate.reason },
            });
          }
          return {
            backend, op, ok: false, taskId, stepId,
            code: gate.code, error: gate.reason,
            recovery: {
              category: gate.code === 'task-budget-exhausted' ? 'budget' : 'authorization',
              action: gate.code === 'side-effect-not-confirmed' ? 'confirm' : 'stop',
              retryable: false, reason: gate.reason,
            },
            task: taskSummary(task),
          };
        }
        step = task.steps[stepId];
        effectiveBackend = step.backend || backend;
        effectiveOp = step.op || op;
        recordStepStart(task, stepId, { backend: effectiveBackend, op: effectiveOp, argsSummary: summarizeArgs(args) });
      }

      // Stored plan args (e.g. pid/process/cdpEndpoint) are merged with the
      // caller's args so the agent does not have to repeat them.
      const mergedArgs = step ? { ...(step.args || {}), ...args } : args;
      const sideEffects = step ? !!step.sideEffects : isSideEffect(effectiveBackend, effectiveOp, mergedArgs);
      const maxRetries = task ? Number(task.constraints?.maxRetries ?? 1) : 0;
      const allowRetry = retry !== false;
      let result = null;
      let recovery = null;
      let attempt = 0;

      for (;;) {
        attempt += 1;
        try {
          result = await execBackend(effectiveBackend, { ...mergedArgs, op: effectiveOp, ...(timeoutMs ? { timeoutMs } : {}) }, cfg);
        } catch (err) {
          result = {
            backend: effectiveBackend, op: effectiveOp, ok: false,
            code: err.code || 'exec-failed',
            error: String(err.message || err),
            install: err.code === 'backend-unavailable' ? env.backends?.[effectiveBackend]?.install : undefined,
          };
        }
        recovery = classifyRecovery(result, { sideEffects });
        if (!allowRetry || !recovery.retryable || sideEffects || attempt > maxRetries) break;
      }

      // Bound very large structured results (e.g. REA analyze evidence bundles):
      // keep the response small, persist the full JSON for inspection.
      const MAX_DATA = 120_000;
      if (result?.data) {
        const serialized = JSON.stringify(result.data);
        if (serialized.length > MAX_DATA) {
          const dir = path.join(cfg.stateDir, 'outputs');
          fs.mkdirSync(dir, { recursive: true });
          const file = path.join(dir, `rehub-${effectiveBackend}-${effectiveOp}-${Date.now()}.json`);
          fs.writeFileSync(file, serialized, 'utf8');
          result.data = {
            truncated: true,
            originalBytes: serialized.length,
            savedTo: file,
            topKeys: Object.keys(result.data).slice(0, 30),
            note: '完整结构化输出已落盘到 savedTo；需要细节时用文件读取或缩小查询（加 --procedure / className 等参数）。',
          };
        }
      }

      if (task) {
        recordStepResult(task, stepId, { result, recovery });
        finalizeIfDone(task, cfg);
        saveTask(task, cfg);
      }

      return {
        ...result,
        ok: !!result?.ok,
        taskId: task?.taskId || null,
        stepId: stepId || null,
        attempts: attempt,
        sideEffects,
        recovery,
        elapsedMs: Date.now() - started,
        task: task ? taskSummary(task) : undefined,
      };
    },
  },
  {
    name: 'rehub_mcp',
    description:
      '子 MCP 多路复用：列出/调用已配置的外部 MCP 逆向服务（js-reverse-mcp、ghidra-mcp、ida-mcp、binary-ninja-mcp 等）。action=list 看工具名，action=call 调工具。',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'call', 'close'], description: '动作' },
        backend: { type: 'string', description: 'config.json mcpBackends 里的名字' },
        tool: { type: 'string', description: 'action=call 时的子工具名' },
        args: { type: 'object', description: 'action=call 时的参数' },
      },
      required: ['action', 'backend'],
    },
    handler: async ({ action, backend, tool, args = {} } = {}) => {
      try {
        if (action === 'close') {
          const c = mcpClients.get(backend);
          if (c) { await c.close(); mcpClients.delete(backend); }
          return { backend, closed: true };
        }
        const client = await ensureMcpStarted(backend);
        if (action === 'list') {
          const res = await client.listTools();
          return { backend, tools: (res.tools || []).map((t) => ({ name: t.name, description: t.description })) };
        }
        if (action === 'call') {
          if (!tool) throw new Error('action=call 需要 tool');
          const res = await client.callTool(tool, args);
          return { backend, tool, result: res };
        }
        throw new Error(`未知 action: ${action}`);
      } catch (err) {
        return { backend, ok: false, error: String(err.message || err) };
      }
    },
  },
  {
    name: 'rehub_evidence',
    description:
      '证据账本 + 结论（Claim）分离：append 记录观察（带 taskId/stepId/artifactRef，自动算 sha256）；claim 记录结论（observed/inferred/unknown + evidenceRefs）；list 查看；report 生成统一 Markdown（含 observed/inferred/unknown、证据映射、验证覆盖）。',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['append', 'claim', 'list', 'report'], description: '动作' },
        record: { type: 'object', description: 'append 记录：taskId/stepId/sourceTool/sourceTarget/kind/observation/detail/artifactRef/artifactType/unknowns' },
        claim: { type: 'object', description: 'claim 记录：text/kind/evidenceRefs/scope/limitation' },
        taskId: { type: 'string', description: '任务 id（用于关联/过滤）' },
        stepId: { type: 'string', description: '步骤 id' },
        scenario: { type: 'string', description: 'list/report 过滤' },
        target: { type: 'string', description: 'list 过滤' },
        limit: { type: 'number', description: 'list 条数' },
        includeClaims: { type: 'boolean', description: 'list 时一并返回 claims' },
        title: { type: 'string', description: 'report 标题' },
        desiredOutput: { type: 'array', items: { type: 'string' }, description: 'report 交付物要求' },
      },
      required: ['action'],
    },
    handler: async ({ action, record = {}, claim = {}, scenario, target, taskId = null, stepId = null, limit, includeClaims = false, title, desiredOutput = [] } = {}) => {
      const cfg = getCfg();
      if (action === 'append') {
        const rec = appendEvidence({ ...record, taskId: record.taskId || taskId || null, stepId: record.stepId || stepId || null }, cfg);
        if (rec.taskId) {
          try {
            const task = loadTask(rec.taskId, cfg);
            linkEvidence(task, { evidenceId: rec.evidenceId, stepId: rec.stepId });
            saveTask(task, cfg);
          } catch { /* task may not exist; evidence is still recorded */ }
        }
        return rec;
      }
      if (action === 'claim') {
        const c = appendClaim({ ...claim, taskId: claim.taskId || taskId || null, stepId: claim.stepId || stepId || null }, cfg);
        if (c.taskId) {
          try {
            const task = loadTask(c.taskId, cfg);
            addClaim(task, c);
            saveTask(task, cfg);
          } catch { /* claim is still recorded */ }
        }
        return c;
      }
      if (action === 'list') return listEvidence({ scenario, target, taskId, limit, includeClaims }, cfg);
      if (action === 'report') {
        let taskObj = null;
        if (taskId) { try { taskObj = loadTask(taskId, cfg); } catch { taskObj = null; } }
        return buildReport({
          title: title || '逆向分析报告',
          task: taskId,
          scenario,
          taskObj,
          verification: taskObj?.verification || null,
          desiredOutput: (desiredOutput || []).length ? desiredOutput : (taskObj?.desiredOutput || null),
        }, cfg);
      }
      throw new Error(`未知 action: ${action}`);
    },
  },
  {
    name: 'rehub_verify',
    description:
      '三层验证：execution（步骤是否成功且输出可解析）/ fact（结论是否有 observation 证据支持；supported/contradicted/insufficient/inferred/unknown）/ delivery（交付物是否满足 desiredOutput）。传 taskId 使用任务状态与已记录 claims；也可传 inline claims + evidenceRefs 做无状态校验。执行成功 ≠ 事实成立。',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: '任务 id' },
        claims: { type: 'array', items: { type: 'object', properties: { claimId: { type: 'string' }, text: { type: 'string' }, kind: { type: 'string', enum: ['observed', 'inferred', 'unknown'] }, evidenceRefs: { type: 'array', items: { type: 'string' } } } }, description: '无状态校验时直接给 claims' },
        evidenceRefs: { type: 'array', items: { type: 'string' }, description: '按 evidence id 限定证据集' },
        desiredOutput: { type: 'array', items: { type: 'string' }, description: '交付物要求' },
        persist: { type: 'boolean', description: '是否把验证结果写回任务（默认 true）' },
      },
    },
    handler: async ({ taskId = null, claims = null, evidenceRefs = null, desiredOutput = null, persist = true } = {}) => {
      const cfg = getCfg();
      let task = null;
      if (taskId) task = loadTask(taskId, cfg);
      let rows;
      if (Array.isArray(evidenceRefs) && evidenceRefs.length) rows = readEvidenceRecords({ ids: evidenceRefs, cfg });
      else if (task) rows = readEvidenceRecords({ taskId: task.taskId, cfg });
      else rows = readEvidenceRecords({ limit: 50, cfg });
      let inlineClaims = null;
      if (Array.isArray(claims) && claims.length) {
        inlineClaims = claims.map((c, i) => ({
          claimId: c.claimId || `claim-inline-${i + 1}`,
          text: c.text || '',
          kind: c.kind || 'observed',
          evidenceRefs: c.evidenceRefs || [],
        }));
      }
      const result = verifyAll({ task, claims: inlineClaims, evidenceRows: rows, desiredOutput, cfg });
      if (task && persist) { task.verification = result; saveTask(task, cfg); }
      return result;
    },
  },
];

const skillPath = path.join(PROJECT_ROOT, 'skills', 'reverse-engineering-hub', 'SKILL.md');
const bookDir = path.join(PROJECT_ROOT, 'skills', 'reverse-engineering-hub', 'chapters');
const skillText = () => (fs.existsSync(skillPath) ? fs.readFileSync(skillPath, 'utf8') : '# skill missing');

/** Chapter ids are the markdown file names (e.g. "04-web-js"). */
function listChapters() {
  if (!fs.existsSync(bookDir)) return [];
  return fs
    .readdirSync(bookDir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => {
      const id = f.replace(/\.md$/, '');
      let title = id;
      try {
        const head = fs.readFileSync(path.join(bookDir, f), 'utf8').split(/\r?\n/).find((l) => l.startsWith('# '));
        if (head) title = head.replace(/^#\s*/, '');
      } catch { /* ignore */ }
      return { id, title };
    });
}

function resolveChapter(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  const chapters = listChapters();
  const lower = raw.toLowerCase();
  const byExact = chapters.find((c) => c.id.toLowerCase() === lower);
  if (byExact) return byExact;
  const byNum = chapters.find((c) => c.id.toLowerCase().startsWith(lower + '-') || c.id.toLowerCase() === lower);
  if (byNum) return byNum;
  // scenario id -> chapter id (e.g. "web-js" -> "04-web-js")
  const s = SCENARIOS.find((x) => x.id.toLowerCase() === lower);
  if (s?.chapter) return chapters.find((c) => c.id === s.chapter || c.id.toLowerCase().startsWith(s.chapter.split('-')[0] + '-')) || null;
  return null;
}

function readChapter(input) {
  const ch = resolveChapter(input);
  if (!ch) return null;
  const content = fs.readFileSync(path.join(bookDir, `${ch.id}.md`), 'utf8');
  return { ...ch, content, chars: content.length };
}

const prompts = [
  {
    name: 'reverse-engineering-router',
    description: '官方 skill：逆向任务意图识别 + 场景分类 + 链路路由规则（与 rehub_* 工具配套）。',
    arguments: [],
    handler: async () => skillText(),
  },
  {
    name: 'scenario-chain',
    description: '按场景 id 返回该链路的执行步骤与注意事项。',
    arguments: [{ name: 'scenario', description: '场景 id', required: true }],
    handler: async ({ scenario } = {}) => {
      const s = SCENARIOS.find((x) => x.id === scenario);
      if (!s) return `未知场景：${scenario}`;
      const lines = [`# ${s.title}`, '', s.summary, '', '## 链路'];
      for (const c of s.chain) lines.push(`${c.step}. **${c.backend}:${c.op}** — ${c.why}`);
      if (s.reaTools?.length) lines.push('', '## 也可直接用 REA MCP 工具', ...s.reaTools.map((t) => `- ${t}`));
      if (s.install && Object.keys(s.install).length) lines.push('', '## 依赖/安装', ...Object.entries(s.install).map(([k, v]) => `- ${k}: ${v}`));
      return lines.join('\n');
    },
  },
  {
    name: 'chapter',
    description: '按章 id 取《逆向工程操作手册》正文；不传 chapter 则返回目录。',
    arguments: [{ name: 'chapter', description: '章 id，如 04-web-js / 04 / web-js', required: false }],
    handler: async ({ chapter } = {}) => {
      if (!chapter) return JSON.stringify(listChapters(), null, 2);
      const ch = readChapter(chapter);
      return ch ? ch.content : `未找到章节: ${chapter}`;
    },
  },
];

startMcpServer({ name: 'rehub', version: VERSION, tools, prompts, log });
log(`config: rea=${getCfg().reaScript} ghidra=${getCfg().ghidraDir}`);

process.on('SIGINT', () => { closeAll(); process.exit(0); });
process.on('SIGTERM', () => { closeAll(); process.exit(0); });
process.on('exit', closeAll);
