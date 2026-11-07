// Task state store: stable taskId/stepId/planVersion keys, step state machine,
// versioned plans with local replan, assumptions/uncertainties, evidence/claims
// refs and verification results. Persisted under <stateDir>/tasks/<taskId>.json.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadConfig } from './detect.mjs';

export const TASK_SCHEMA_VERSION = '2.0';

const TERMINAL = new Set(['completed', 'failed', 'blocked', 'cancelled']);

function taskDir(cfg) {
  const d = path.join(cfg.stateDir || 'state', 'tasks');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function taskFile(taskId, cfg) {
  return path.join(taskDir(cfg), `${taskId}.json`);
}

function atomicWrite(file, text) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

export function newTaskId() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `task-${stamp}-${crypto.randomBytes(2).toString('hex')}`;
}

/** Create a task from a parsed intake + initial plan. */
export function createTask({ intake = {}, planMeta = {}, cfg = loadConfig() } = {}) {
  const task = {
    schemaVersion: TASK_SCHEMA_VERSION,
    taskId: newTaskId(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'planned',
    intent: intake.intent || null,
    object: intake.object || null,
    underlyingObjects: intake.underlyingObjects || [],
    modes: intake.modes || [],
    constraints: intake.constraints || {},
    desiredOutput: intake.desiredOutput || [],
    assumptions: intake.assumptions || [],
    uncertainties: intake.uncertainties || [],
    planVersion: 0,
    planHistory: [],
    currentPlan: null,
    steps: {},
    missingDependencies: [],
    evidenceRefs: [],
    claims: [],
    verification: null,
    stopReason: null,
    planMeta: planMeta || {},
  };
  saveTask(task, cfg);
  return task;
}

export function loadTask(taskId, cfg = loadConfig()) {
  const file = taskFile(taskId, cfg);
  if (!fs.existsSync(file)) throw new Error(`任务不存在: ${taskId}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function saveTask(task, cfg = loadConfig()) {
  task.updatedAt = new Date().toISOString();
  atomicWrite(taskFile(task.taskId, cfg), JSON.stringify(task, null, 2) + '\n');
  return task;
}

/**
 * Apply a plan (initial or replan) to a task.
 * - Initial plan: all steps reset to `pending`, planVersion 1.
 * - Replan without fromStep: new version, all steps reset.
 * - Local replan with fromStep (1-based index or stepId): steps before it keep
 *   their state; indexes from it are replaced by the new plan's steps.
 */
export function applyPlan(task, steps = [], { reason = 'initial', fromStep = null, planMeta = {}, missingDependencies = [] } = {}) {
  const prevVersion = task.planVersion || 0;
  const version = prevVersion + 1;
  let fromIndex = 0;
  if (fromStep != null) {
    if (typeof fromStep === 'number') fromIndex = Math.max(0, Math.min(steps.length, fromStep - 1));
    else {
      const n = Number(String(fromStep).replace(/^step-/, ''));
      fromIndex = Number.isFinite(n) ? Math.max(0, Math.min(steps.length, n - 1)) : 0;
    }
  }
  const nextSteps = {};
  steps.forEach((s, i) => {
    const stepId = `step-${i + 1}`;
    const prior = task.steps?.[stepId];
    const keep = fromIndex > 0 && i < fromIndex && prior;
    nextSteps[stepId] = keep
      ? prior
      : {
          stepId,
          state: 'pending',
          attempts: 0,
          backend: s.backend,
          op: s.op,
          capability: s.capability || null,
          sideEffects: !!s.sideEffects,
          availability: s.availability || null,
          args: s.args || {},
          needs: s.needs || [],
          startedAt: null,
          endedAt: null,
          resultRef: null,
          error: null,
          recovery: null,
        };
  });
  task.steps = nextSteps;
  task.currentPlan = {
    version,
    reason,
    at: new Date().toISOString(),
    steps: steps.map((s, i) => ({
      stepId: `step-${i + 1}`,
      capability: s.capability || null,
      backend: s.backend,
      op: s.op,
      sideEffects: !!s.sideEffects,
      why: s.why || null,
      needs: s.needs || [],
    })),
    scenario: planMeta.scenario || null,
    objectType: planMeta.objectType || null,
    subtype: planMeta.subtype || null,
    mode: planMeta.mode || null,
    fromStep: fromStep ?? null,
  };
  task.planVersion = version;
  task.planHistory = [...(task.planHistory || []), {
    version,
    reason,
    at: task.currentPlan.at,
    fromStep: fromStep ?? null,
    stepCount: steps.length,
    changedSteps: fromIndex > 0 ? steps.length - fromIndex : steps.length,
  }];
  task.missingDependencies = missingDependencies;
  task.status = 'planned';
  task.stopReason = null;
  saveTask(task);
  return task;
}

export function recordStepStart(task, stepId, { backend, op, argsSummary } = {}) {
  const st = task.steps?.[stepId];
  if (!st) throw new Error(`未知 stepId: ${stepId}（先 rehub_plan 创建计划）`);
  st.state = 'running';
  st.attempts = (st.attempts || 0) + 1;
  st.startedAt = new Date().toISOString();
  st.backend = backend || st.backend;
  st.op = op || st.op;
  st.argsSummary = argsSummary || st.argsSummary || null;
  task.status = 'running';
  saveTask(task);
  return st;
}

const BLOCKED_CODES = new Set(['backend-unavailable', 'needs-elevation', 'side-effect-not-confirmed', 'task-budget-exhausted']);

export function recordStepResult(task, stepId, { result = {}, recovery = null, error = null } = {}) {
  const st = task.steps?.[stepId];
  if (!st) throw new Error(`未知 stepId: ${stepId}`);
  st.endedAt = new Date().toISOString();
  let state = 'failed';
  if (result.ok) state = 'succeeded';
  else if (recovery?.category === 'missing-capability' || BLOCKED_CODES.has(result.code) || recovery?.action === 'stop') state = 'blocked';
  st.state = state;
  st.error = error ? String(error) : (result.error || result.stderr || null);
  st.errorCode = result.code || null;
  st.recovery = recovery;
  saveTask(task);
  return st;
}

export function setTaskStatus(task, status, stopReason = null) {
  task.status = status;
  if (stopReason) task.stopReason = stopReason;
  saveTask(task);
  return task;
}

export function taskBudget(task, now = Date.now()) {
  const c = task.constraints || {};
  const maxSteps = Number(c.maxSteps || 40);
  const budgetMs = Number(c.budgetMs || 15 * 60 * 1000);
  const executed = Object.values(task.steps || {}).filter((s) => ['succeeded', 'failed', 'blocked', 'skipped'].includes(s.state)).length;
  const elapsedMs = now - new Date(task.createdAt).getTime();
  return {
    maxSteps,
    executedSteps: executed,
    remainingSteps: Math.max(0, maxSteps - executed),
    budgetMs,
    elapsedMs,
    remainingMs: Math.max(0, budgetMs - elapsedMs),
    stepBudgetExhausted: executed >= maxSteps,
    timeBudgetExhausted: elapsedMs >= budgetMs,
  };
}

/** Refuse to keep executing past the task's stop conditions. */
export function checkTaskCanExecute(task, stepId, { confirm = false } = {}) {
  if (!task) return { ok: true };
  if (TERMINAL.has(task.status)) return { ok: false, code: 'task-terminal', reason: `任务已结束: ${task.status}` };
  const st = task.steps?.[stepId];
  if (!st) return { ok: false, code: 'unknown-step', reason: `未知 stepId: ${stepId}` };
  const b = taskBudget(task);
  if (b.stepBudgetExhausted) return { ok: false, code: 'task-budget-exhausted', reason: `步骤预算用尽（maxSteps=${b.maxSteps}）` };
  if (b.timeBudgetExhausted) return { ok: false, code: 'task-budget-exhausted', reason: `时间预算用尽（budgetMs=${b.budgetMs}）` };
  if (st.sideEffects && !confirm) {
    return { ok: false, code: 'side-effect-not-confirmed', reason: `该步骤有副作用（${st.backend}:${st.op}），需要 confirm:true 才能执行` };
  }
  return { ok: true };
}

export function addAssumption(task, text) {
  if (text && !task.assumptions.includes(text)) task.assumptions.push(text);
  saveTask(task);
  return task;
}

export function addUncertainty(task, item) {
  if (item && !task.uncertainties.some((u) => u.field === item.field && u.reason === item.reason)) task.uncertainties.push(item);
  saveTask(task);
  return task;
}

export function linkEvidence(task, { evidenceId, stepId = null } = {}) {
  if (!evidenceId) return task;
  if (!task.evidenceRefs.includes(evidenceId)) task.evidenceRefs.push(evidenceId);
  if (stepId && task.steps?.[stepId]) task.steps[stepId].resultRef = evidenceId;
  saveTask(task);
  return task;
}

export function addClaim(task, claim) {
  if (!claim?.claimId) throw new Error('claim 需要 claimId');
  const idx = task.claims.findIndex((c) => c.claimId === claim.claimId);
  if (idx >= 0) task.claims[idx] = claim; else task.claims.push(claim);
  saveTask(task);
  return task;
}

export function setVerification(task, verification) {
  task.verification = verification;
  saveTask(task);
  return task;
}

/** Compact task snapshot included in plan/exec/verify responses. */
export function taskSummary(task) {
  if (!task) return null;
  const b = taskBudget(task);
  return {
    taskId: task.taskId,
    schemaVersion: task.schemaVersion,
    status: task.status,
    planVersion: task.planVersion,
    intent: task.intent,
    object: task.object,
    underlyingObjects: task.underlyingObjects,
    modes: task.modes,
    assumptions: task.assumptions,
    uncertainties: task.uncertainties,
    budget: b,
    planHistory: task.planHistory,
    steps: Object.values(task.steps || {}).map((s) => ({
      stepId: s.stepId,
      state: s.state,
      attempts: s.attempts,
      capability: s.capability,
      backend: s.backend,
      op: s.op,
      sideEffects: !!s.sideEffects,
      errorCode: s.errorCode || null,
      recovery: s.recovery || null,
      resultRef: s.resultRef || null,
    })),
    evidenceRefs: task.evidenceRefs,
    claims: task.claims,
    verification: task.verification,
    missingDependencies: task.missingDependencies,
    stopReason: task.stopReason,
  };
}
