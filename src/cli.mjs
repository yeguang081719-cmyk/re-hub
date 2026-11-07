#!/usr/bin/env node
// Small CLI for humans/scripts (the MCP server is the primary interface).
//
//   node src/cli.mjs detect
//   node src/cli.mjs scenarios
//   node src/cli.mjs route --task "..." [--target C:/x.apk]
//   node src/cli.mjs plan --scenario android-apk --target C:/x.apk
//   node src/cli.mjs exec rea capabilities
//   node src/cli.mjs exec ghidra functions --path C:/x.exe --timeout 600000

import { detectEnvironment, annotateScenario } from './detect.mjs';
import { SCENARIOS, routeTask, planScenario, scenarioCatalog } from './scenarios.mjs';
import { classifyTarget, planTargetMode } from './targets.mjs';
import { execBackend } from './backends.mjs';
import { appendEvidence, listEvidence, buildReport } from './evidence.mjs';

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
    if (out.mode) {
      if (!out.objectType) { console.error('按模式规划需要 --objectType web|app|software|ai-automation'); process.exit(2); }
      print(planTargetMode({ objectType: out.objectType, subtype: out.subtype || null, mode: out.mode, target: out.target || '', goal: out.goal || '' }));
      break;
    }
    if (!out.scenario) { console.error('需要 --scenario <id>，或 --objectType + --mode static|dynamic|ui'); process.exit(2); }
    print(planScenario({ scenario: out.scenario, target: out.target || '', goal: out.goal || '' }));
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
  case 'evidence': {
    const action = pos[0] || 'list';
    if (action === 'append') {
      if (!out.recordJson) { console.error('需要 --recordJson \'{...}\''); process.exit(2); }
      print(appendEvidence(JSON.parse(out.recordJson)));
    } else if (action === 'report') {
      print(buildReport({ title: out.title || '逆向分析报告', scenario: out.scenario }));
    } else {
      print(listEvidence({ scenario: out.scenario, limit: Number(out.limit || 50) }));
    }
    break;
  }
  default:
    console.error('用法: detect | scenarios | classify --task | route --task | plan --scenario | plan --objectType --mode | exec <backend> <op> | evidence list|append|report');
    process.exit(2);
}
