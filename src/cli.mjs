#!/usr/bin/env node
// Small CLI for humans/scripts (the MCP server is the primary interface).
//
//   node src/cli.mjs detect
//   node src/cli.mjs scenarios
//   node src/cli.mjs route --task "..." [--target C:/x.apk]
//   node src/cli.mjs plan --scenario android-apk --target C:/x.apk
//   node src/cli.mjs exec rea capabilities
//   node src/cli.mjs exec ghidra functions --path C:/x.exe --timeout 600000

import { detectEnvironment, annotateScenario, loadConfig } from './detect.mjs';
import { SCENARIOS, routeTask, scenarioCatalog } from './scenarios.mjs';
import { classifyTarget } from './targets.mjs';
import { buildTaskPlan } from './orchestrator.mjs';
import { loadTask, taskSummary } from './tasks.mjs';
import { verifyAll } from './verify.mjs';
import { execBackend } from './backends.mjs';
import { appendEvidence, appendClaim, listEvidence, buildReport } from './evidence.mjs';

const argv = process.argv.slice(2);
const cmd = argv[0];
const rest = argv.slice(1);

function flags(list) {
  const out = {};
  const pos = [];
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > -1) out[a.slice(2, eq)] = a.slice(eq + 1);
      else out[a.slice(2)] = list[i + 1] && !list[i + 1].startsWith('--') ? list[++i] : true;
    } else pos.push(a);
  }
  return { out, pos };
}

const { out, pos } = flags(rest);
const print = (x) => console.log(JSON.stringify(x, null, 2));

switch (cmd) {
  case 'detect': {
    const env = await detectEnvironment(undefined, { refresh: !!out.refresh });
    print(env);
    break;
  }
  case 'scenarios': {
    print({ count: SCENARIOS.length, scenarios: scenarioCatalog() });
    break;
  }
  case 'route': {
    if (!out.task) { console.error('需要 --task "..."'); process.exit(2); }
    const env = await detectEnvironment();
    const route = routeTask({ task: out.task, target: out.target || '', hints: out.hints ? String(out.hints).split(',') : [] });
    const s = SCENARIOS.find((x) => x.id === route.scenario);
    print({ ...route, readiness: annotateScenario(env, s) });
    break;
  }
  case 'classify': {
    if (!out.task && !out.target) { console.error('需要 --task "..." 或 --target <路径/URL>'); process.exit(2); }
    const cls = classifyTarget({ task: out.task || '', target: out.target || '', hints: out.hints ? String(out.hints).split(',') : [] });
    print(cls);
    break;
  }
  case 'plan': {
    const cfg = loadConfig();
    const env = await detectEnvironment(cfg);
    if (out.taskId && !out.scenario && !out.mode) {
      print({ taskId: out.taskId, task: taskSummary(loadTask(out.taskId, cfg)) });
      break;
    }
    if (!out.scenario && !out.mode) { console.error('需要 --scenario，或 --objectType + --mode，或 --taskId'); process.exit(2); }
    if (out.mode && !out.objectType) { console.error('按模式规划需要 --objectType web|app|software|ai-automation'); process.exit(2); }
    const constraints = {};
    for (const k of ['maxSteps', 'maxRetries', 'budgetMs']) if (out[k] != null) constraints[k] = Number(out[k]);
    const r = await buildTaskPlan({
      scenario: out.scenario || null,
      objectType: out.objectType || null,
      subtype: out.subtype || null,
      mode: out.mode || null,
      taskId: out.taskId || null,
      fromStep: out.fromStep || null,
      changeReason: out.changeReason || null,
      target: out.target || '',
      goal: out.goal || '',
      constraints,
      resolveFallbacks: out.fallbacks !== 'false',
      cfg,
      env,
    });
    print({
      schemaVersion: r.schemaVersion,
      taskId: r.task.taskId,
      planVersion: r.task.planVersion,
      status: r.task.status,
      scenario: r.planMeta.scenario,
      chapter: r.basePlan.chapter,
      mode: r.planMeta.mode,
      steps: r.steps,
      assumptions: r.task.assumptions,
      uncertainties: r.task.uncertainties,
      truncated: r.truncated,
      missingDependencies: r.missingDependencies,
      stopConditions: r.stopConditions,
      task: taskSummary(r.task),
    });
    break;
  }
  case 'exec': {
    const backend = pos[0];
    const op = pos[1];
    if (!backend || !op) { console.error('用法: exec <backend> <op> [--path=...] [--procedure=...]'); process.exit(2); }
    const args = { ...out };
    if (args.timeout) { args.timeoutMs = Number(args.timeout); delete args.timeout; }
    if (args.argsJson) { args.args = JSON.parse(args.argsJson); delete args.argsJson; }
    const res = await execBackend(backend, { ...args, op });
    print(res);
    break;
  }
  case 'verify': {
    if (!out.taskId) { console.error('需要 --taskId <任务 id>'); process.exit(2); }
    print(verifyAll({ task: loadTask(out.taskId) }));
    break;
  }
  case 'evidence': {
    const action = pos[0] || 'list';
    if (action === 'append') {
      if (!out.recordJson) { console.error('需要 --recordJson \'{...}\''); process.exit(2); }
      print(appendEvidence(JSON.parse(out.recordJson)));
    } else if (action === 'claim') {
      if (!out.claimJson) { console.error('需要 --claimJson \'{...}\''); process.exit(2); }
      print(appendClaim(JSON.parse(out.claimJson)));
    } else if (action === 'report') {
      print(buildReport({ title: out.title || '逆向分析报告', scenario: out.scenario }));
    } else {
      print(listEvidence({ scenario: out.scenario, limit: Number(out.limit || 50) }));
    }
    break;
  }
  default:
    console.error('用法: detect | scenarios | classify --task | route --task | plan --scenario | plan --objectType --mode | plan --taskId | verify --taskId | exec <backend> <op> | evidence list|append|claim|report');
    process.exit(2);
}
