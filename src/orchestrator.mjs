// Orchestrator: one implementation of "build a versioned task plan" shared by
// the MCP server and the CLI. Capability enrichment + fallbacks + budget +
// task persistence live here so both entry points behave identically.
import { planScenario, SCENARIOS } from './scenarios.mjs';
import { planTargetMode } from './targets.mjs';
import { parseTask, SCHEMA_VERSION } from './intake.mjs';
import { resolveStep } from './capabilities.mjs';
import { createTask, loadTask, saveTask, applyPlan } from './tasks.mjs';
import { detectEnvironment, loadConfig } from './detect.mjs';

export const STOP_CONDITIONS = [
  '关键成功判据满足 / 证据足以支撑交付',
  '达到 constraints.maxSteps 或 constraints.budgetMs',
  '缺少关键权限、后端或输入且无法安全替代',
  '观察与假设冲突且局部重规划仍无法推进',
  '用户取消或安全边界不允许继续',
];

export function mergeUniqueAssumptions(task, list = []) {
  for (const a of list || []) if (a && !task.assumptions.includes(a)) task.assumptions.push(a);
  return task;
}

export function mergeUniqueUncertainties(task, list = []) {
  for (const u of list || []) {
    if (u && !task.uncertainties.some((x) => x.field === u.field && x.reason === u.reason)) task.uncertainties.push(u);
  }
  return task;
}

/** Enrich plan steps with capability/availability/fallback + budget truncation. */
export function enrichPlanSteps(env, steps, { resolveFallbacks = true, maxSteps = 40 } = {}) {
  const truncated = steps.length > maxSteps;
  const kept = truncated ? steps.slice(0, maxSteps) : steps;
  const enriched = kept.map((s, i) => {
    const r = resolveStep(env, s, { allowFallback: resolveFallbacks });
    return {
      stepId: `step-${i + 1}`,
      backend: r.effective.backend,
      op: r.effective.op,
      fallbackFrom: r.availability.fallback ? r.availability.fallback.from : null,
      capability: r.capability,
      capabilityLabel: r.capabilityLabel,
      sideEffects: r.sideEffects,
      availability: r.availability,
      alternatives: r.alternatives,
      args: s.args || {},
      why: s.why || null,
      needs: s.needs || [],
      expectedEvidence: `一条 ${r.capabilityLabel || r.capability} 观察，含定位/artifactRef`,
      state: 'pending',
    };
  });
  const missingDependencies = enriched
    .filter((s) => !s.availability.ready && !s.fallbackFrom)
    .map((s) => ({ stepId: s.stepId, backend: s.availability.backend, capability: s.capability }));
  return { enriched, truncated, missingDependencies };
}

/**
 * Build (or update) a versioned task plan.
 * Returns { task, intake, basePlan, planMeta, steps, truncated, missingDependencies, stopConditions }.
 */
export async function buildTaskPlan({
  scenario = null, objectType = null, subtype = null, mode = null, taskId = null,
  target = '', goal = '', options = {}, constraints = {}, desiredOutput = [],
  changeReason = null, fromStep = null, resolveFallbacks = true,
  cfg = null, env = null,
} = {}) {
  const config = cfg || loadConfig();
  const environment = env || await detectEnvironment(config);

  let basePlan;
  let planMeta;
  if (mode) {
    if (!objectType) throw new Error('按模式规划需要 objectType（web/app/software/ai-automation）');
    basePlan = planTargetMode({ objectType, subtype, mode, target, goal, options });
    planMeta = { scenario: basePlan.scenario, objectType, subtype, mode };
  } else {
    if (!scenario) throw new Error('需要 scenario，或 objectType + mode（static/dynamic/ui），或 taskId 查看任务');
    basePlan = planScenario({ scenario, target, goal, options });
    planMeta = { scenario, objectType: null, subtype: null, mode: null };
  }

  // Single unified parse shared with route/classify. When plan is called without
  // task text, derive it from the scenario title so intent is still meaningful.
  const scenarioMeta = scenario ? SCENARIOS.find((s) => s.id === scenario) : null;
  const taskText = options.task || goal || scenarioMeta?.title || (objectType ? `${objectType} 逆向` : '');
  const intake = parseTask({ task: taskText, target, hints: options.hints || [], constraints, desiredOutput });

  const { enriched, truncated, missingDependencies } = enrichPlanSteps(environment, basePlan.steps, {
    resolveFallbacks: resolveFallbacks !== false,
    maxSteps: intake.constraints.maxSteps,
  });

  const task = taskId ? loadTask(taskId, config) : createTask({ intake, cfg: config });
  if (taskId) {
    mergeUniqueAssumptions(task, intake.assumptions);
    mergeUniqueUncertainties(task, intake.uncertainties);
    if ((desiredOutput || []).length) task.desiredOutput = intake.desiredOutput;
  }
  applyPlan(task, enriched, {
    reason: changeReason || (taskId ? (fromStep != null ? 'local-replan' : 'replan') : 'initial'),
    fromStep,
    planMeta,
    missingDependencies,
  });
  saveTask(task, config);

  return {
    schemaVersion: SCHEMA_VERSION,
    task,
    intake,
    basePlan,
    planMeta,
    steps: enriched,
    truncated,
    missingDependencies,
    stopConditions: STOP_CONDITIONS,
  };
}
