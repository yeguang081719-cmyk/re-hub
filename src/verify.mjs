// Verification: execution → fact → delivery. Tool return codes are NOT treated
// as factual truth; a claim only becomes `supported` when referenced evidence
// exists and is an observation.
import { readEvidenceRecords } from './evidence.mjs';

export const FACT_STATUSES = ['supported', 'contradicted', 'insufficient', 'inferred', 'unknown'];
export const VERIFY_STATUSES = ['pass', 'fail', 'blocked', 'insufficient', 'needs-evidence'];

/** Layer 1: did the tools execute, and is their output usable? */
export function verifyExecution(task) {
  const steps = Object.values(task?.steps || {});
  const checks = steps.map((s) => ({
    stepId: s.stepId,
    state: s.state,
    ok: ['succeeded', 'skipped'].includes(s.state),
    errorCode: s.errorCode || null,
    recovery: s.recovery || null,
  }));
  const count = (st) => checks.filter((c) => c.state === st).length;
  let status = 'pass';
  if (!checks.length) status = 'insufficient';
  else if (count('blocked')) status = 'blocked';
  else if (count('failed')) status = 'fail';
  else if (count('pending') || count('running')) status = 'insufficient';
  return {
    layer: 'execution',
    status,
    checks,
    summary: {
      total: checks.length,
      succeeded: count('succeeded'),
      failed: count('failed'),
      blocked: count('blocked'),
      pending: count('pending') + count('running'),
    },
  };
}

/**
 * Layer 2: is each claim supported by evidence?
 * Rules: missing refs → insufficient; contradiction evidence → contradicted;
 * inferred claims stay inferred; observed claims need an observation record.
 */
export function verifyFact(claims = [], evidenceRows = []) {
  const byId = new Map((evidenceRows || []).map((e) => [e.id || e.evidenceId, e]));
  const results = (claims || []).map((claim) => {
    const refs = claim.evidenceRefs || [];
    const missingEvidence = refs.filter((id) => !byId.has(id));
    const evs = refs.map((id) => byId.get(id)).filter(Boolean);
    let status = 'insufficient';
    if (claim.kind === 'unknown') status = 'unknown';
    else if (!refs.length || missingEvidence.length) status = 'insufficient';
    else if (evs.some((e) => e.kind === 'contradiction')) status = 'contradicted';
    else if (evs.some((e) => e.kind === 'inference') && !evs.some((e) => e.kind === 'observation')) status = 'inferred';
    else if (claim.kind === 'inferred') status = 'inferred';
    else if (evs.some((e) => e.kind === 'observation')) status = 'supported';
    return {
      claimId: claim.claimId,
      text: claim.text,
      kind: claim.kind || 'observed',
      status,
      evidenceRefs: refs,
      missingEvidence,
    };
  });
  const count = (st) => results.filter((r) => r.status === st).length;
  let overall = 'insufficient';
  if (!results.length) overall = 'insufficient';
  else if (count('contradicted')) overall = 'contradicted';
  else if (results.every((r) => ['supported', 'inferred', 'unknown'].includes(r.status))) overall = count('supported') ? 'supported' : 'insufficient';
  else if (count('supported')) overall = 'partial';
  return {
    layer: 'fact',
    status: overall,
    claims: results,
    summary: {
      total: results.length,
      supported: count('supported'),
      contradicted: count('contradicted'),
      insufficient: count('insufficient'),
      inferred: count('inferred'),
      unknown: count('unknown'),
    },
  };
}

/**
 * Layer 3: does the deliverable satisfy the requested output?
 * `desiredOutput` entries map to evidence artifactType (e.g. ui-prototype).
 */
export function verifyDelivery(task, { desiredOutput = null, evidenceRows = [] } = {}) {
  const wanted = desiredOutput != null ? desiredOutput : (task?.desiredOutput || []);
  const checks = [];
  const records = evidenceRows || [];
  const artifactTypes = new Set(records.map((e) => e.artifactType).filter(Boolean));

  checks.push({
    check: 'evidence-exists',
    ok: (task?.evidenceRefs?.length || 0) > 0,
    detail: `evidenceRefs=${task?.evidenceRefs?.length || 0}`,
  });
  const steps = Object.values(task?.steps || {});
  const blocked = steps.filter((s) => s.state === 'blocked');
  const unfinished = steps.filter((s) => ['pending', 'running'].includes(s.state));
  checks.push({ check: 'no-blocked-steps', ok: blocked.length === 0, detail: blocked.map((s) => s.stepId).join(',') || 'none' });
  checks.push({ check: 'no-unfinished-steps', ok: unfinished.length === 0, detail: unfinished.map((s) => s.stepId).join(',') || 'none' });

  for (const out of wanted || []) {
    const want = String(out);
    let ok;
    if (want === 'report') ok = artifactTypes.has('report') || records.some((e) => /report/i.test(e.artifactType || ''));
    else if (want === 'ui-prototype') ok = artifactTypes.has('ui-prototype');
    else if (want === 'api-doc') ok = artifactTypes.has('api-doc');
    else if (want === 'code-structure') ok = artifactTypes.has('code-structure');
    else ok = artifactTypes.has(want);
    checks.push({ check: `artifact:${want}`, ok, detail: ok ? 'present' : 'missing' });
  }

  const failed = checks.filter((c) => !c.ok);
  let status = failed.length ? 'fail' : 'pass';
  if (!task) status = 'insufficient';
  else if (!task.evidenceRefs?.length && !wanted.length) status = 'insufficient';
  return { layer: 'delivery', status, desiredOutput: wanted, checks };
}

/** Run all three layers and produce a compact verification record. */
export function verifyAll({ task = null, claims = null, evidenceRows = null, desiredOutput = null, cfg } = {}) {
  const rows = evidenceRows || (task ? readEvidenceRecords({ taskId: task.taskId, cfg }) : []);
  const useClaims = claims || task?.claims || [];
  const execution = task ? verifyExecution(task) : { layer: 'execution', status: 'insufficient', checks: [], summary: {} };
  const fact = verifyFact(useClaims, rows);
  let delivery;
  if (!task) delivery = { layer: 'delivery', status: 'insufficient', checks: [], desiredOutput: desiredOutput || [] };
  else delivery = verifyDelivery(task, { desiredOutput, evidenceRows: rows });

  let overall = 'pass';
  if (execution.status === 'blocked' || delivery.status === 'fail') overall = 'fail';
  else if (execution.status === 'fail' || fact.status === 'contradicted') overall = 'fail';
  else if (execution.status !== 'pass' || delivery.status !== 'pass') overall = 'needs-evidence';
  else if (fact.status === 'insufficient') overall = 'needs-evidence';
  else if (fact.status === 'supported' || !useClaims.length) overall = 'pass';
  else overall = 'needs-evidence';

  return {
    schemaVersion: '2.0',
    taskId: task?.taskId || null,
    generatedAt: new Date().toISOString(),
    overall,
    execution,
    fact,
    delivery,
    note: 'execution 通过不代表事实成立；fact=supported 必须有 observation 证据；inferred/unknown 不会升级为 observed。',
  };
}
