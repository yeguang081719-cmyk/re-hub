// Evidence ledger + claims: evidence records provenance (taskId/stepId/
// artifactRef/hash) while claims stay separate from observations so a report can
// distinguish observed / inferred / unknown and map each conclusion to evidence.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadConfig } from './detect.mjs';

function ledgerPath(cfg = loadConfig()) {
  fs.mkdirSync(cfg.stateDir, { recursive: true });
  return path.join(cfg.stateDir, 'evidence.jsonl');
}

function claimLedgerPath(cfg = loadConfig()) {
  fs.mkdirSync(cfg.stateDir, { recursive: true });
  return path.join(cfg.stateDir, 'claims.jsonl');
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
  const out = [];
  for (const line of lines) {
    try { out.push(JSON.parse(line)); } catch { /* skip */ }
  }
  return out;
}

/** SHA-256 of an artifact file when it is locally readable. */
export function sha256File(file) {
  try {
    if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  } catch {
    return null;
  }
}

export function appendEvidence(record = {}, cfg = loadConfig()) {
  if (!record.summary && !record.finding && !record.observation) {
    throw new Error('evidence 记录至少需要 summary / finding / observation 字段');
  }
  const now = new Date().toISOString();
  const id = `ev_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
  const artifactRef = record.artifactRef || (Array.isArray(record.artifacts) && record.artifacts[0]) || null;
  const rec = {
    id,
    evidenceId: id,
    schemaVersion: '2.0',
    ts: now,
    capturedAt: now,
    taskId: record.taskId || record.task || null,
    // legacy alias kept for existing callers
    task: record.taskId || record.task || null,
    stepId: record.stepId || null,
    scenario: record.scenario || null,
    sourceTarget: record.sourceTarget || record.target || null,
    target: record.sourceTarget || record.target || null,
    sourceTool: record.sourceTool || record.backend || null,
    backend: record.sourceTool || record.backend || null,
    op: record.op || null,
    kind: record.kind || 'observation', // observation | inference | contradiction | unknown
    confidence: record.confidence || 'medium',
    observation: record.observation || record.summary || record.finding || '',
    summary: record.observation || record.summary || record.finding || '',
    detail: record.detail || null,
    artifactRef,
    artifactType: record.artifactType || null,
    integrity: { sha256: record.sha256 || sha256File(artifactRef) },
    evidenceRefs: record.evidenceRefs || [],
    artifacts: record.artifacts || (artifactRef ? [artifactRef] : []),
    unknowns: record.unknowns || [],
  };
  fs.appendFileSync(ledgerPath(cfg), JSON.stringify(rec) + '\n', 'utf8');
  return rec;
}

export function appendClaim(record = {}, cfg = loadConfig()) {
  const text = record.text || record.claim || record.summary;
  if (!text) throw new Error('claim 记录至少需要 text（结论内容）');
  const claim = {
    claimId: record.claimId || `claim_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`,
    schemaVersion: '2.0',
    taskId: record.taskId || record.task || null,
    stepId: record.stepId || null,
    createdAt: new Date().toISOString(),
    text: String(text),
    kind: record.kind || 'observed', // observed | inferred | unknown
    evidenceRefs: record.evidenceRefs || [],
    confidence: record.confidence || 'medium',
    scope: record.scope || null,
    limitation: record.limitation || null,
  };
  fs.appendFileSync(claimLedgerPath(cfg), JSON.stringify(claim) + '\n', 'utf8');
  return claim;
}

export function readEvidenceRecords({ taskId = null, ids = null, scenario = null, target = null, limit = null, cfg = loadConfig() } = {}) {
  let rows = readJsonl(ledgerPath(cfg));
  if (taskId) rows = rows.filter((r) => (r.taskId || r.task) === taskId);
  if (scenario) rows = rows.filter((r) => r.scenario === scenario);
  if (target) rows = rows.filter((r) => (r.sourceTarget || r.target) === target);
  if (Array.isArray(ids) && ids.length) {
    const want = new Set(ids);
    rows = rows.filter((r) => want.has(r.evidenceId || r.id));
  }
  if (limit) rows = rows.slice(-Math.max(1, Math.min(500, Number(limit) || 50)));
  return rows;
}

export function readClaims({ taskId = null, ids = null, limit = null, cfg = loadConfig() } = {}) {
  let rows = readJsonl(claimLedgerPath(cfg));
  if (taskId) rows = rows.filter((r) => r.taskId === taskId);
  if (Array.isArray(ids) && ids.length) {
    const want = new Set(ids);
    rows = rows.filter((r) => want.has(r.claimId));
  }
  if (limit) rows = rows.slice(-Math.max(1, Math.min(500, Number(limit) || 50)));
  return rows;
}

export function listEvidence({ scenario, target, taskId, limit = 50, includeClaims = false } = {}, cfg = loadConfig()) {
  const rows = readEvidenceRecords({ scenario, target, taskId, limit, cfg });
  const out = {
    count: rows.length,
    records: rows.map((r) => ({
      id: r.evidenceId || r.id,
      ts: r.capturedAt || r.ts,
      taskId: r.taskId || null,
      stepId: r.stepId || null,
      scenario: r.scenario,
      target: r.sourceTarget || r.target,
      kind: r.kind,
      confidence: r.confidence,
      summary: r.observation || r.summary,
      step: r.stepId || r.step,
      backend: r.sourceTool || r.backend,
      op: r.op,
      artifactRef: r.artifactRef || null,
      sha256: r.integrity?.sha256 || null,
    })),
  };
  if (includeClaims) out.claims = readClaims({ taskId, cfg });
  return out;
}

function section(lines, title, items, render) {
  lines.push(`## ${title}`);
  lines.push('');
  if (!items.length) { lines.push('（无）'); lines.push(''); return; }
  for (const item of items) lines.push(render(item));
  lines.push('');
}

export function buildReport({ title = '逆向分析报告', task = null, scenario = null, taskObj = null, claims = null, verification = null, evidence = null, desiredOutput = null } = {}, cfg = loadConfig()) {
  const rows = evidence || readEvidenceRecords({ taskId: taskObj?.taskId || task, scenario, cfg });
  const claimRows = claims || readClaims({ taskId: taskObj?.taskId || task, cfg });
  const observed = rows.filter((r) => r.kind === 'observation');
  const inferred = rows.filter((r) => r.kind === 'inference');
  const unknown = rows.filter((r) => r.kind === 'unknown' || (r.unknowns || []).length);
  const contradicted = rows.filter((r) => r.kind === 'contradiction');

  const lines = [];
  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`生成时间：${new Date().toISOString()}`);
  if (taskObj) {
    lines.push('');
    lines.push('## 任务与授权');
    lines.push('');
    lines.push(`- taskId: \`${taskObj.taskId}\``);
    lines.push(`- schemaVersion: ${taskObj.schemaVersion}`);
    lines.push(`- 对象: ${taskObj.object?.type || '?'}${taskObj.object?.subtype ? '/' + taskObj.object.subtype.id : ''}`);
    lines.push(`- 意图: ${taskObj.intent?.id || '?'}`);
    lines.push(`- 模式: ${(taskObj.modes || []).join(' / ') || '?'}`);
    lines.push(`- 授权约束: ${taskObj.constraints?.authorization || 'required'}`);
    lines.push(`- 计划版本: ${taskObj.planVersion}；状态: ${taskObj.status}${taskObj.stopReason ? '；停止原因: ' + taskObj.stopReason : ''}`);
    if (taskObj.assumptions?.length) lines.push(`- 假设: ${taskObj.assumptions.join('; ')}`);
    if (taskObj.uncertainties?.length) lines.push(`- 不确定项: ${taskObj.uncertainties.map((u) => `${u.field}: ${u.reason}`).join('; ')}`);
    lines.push('');
  }
  lines.push(`证据记录：${rows.length} 条（observed ${observed.length} / inferred ${inferred.length} / contradiction ${contradicted.length}）`);
  lines.push('');

  section(lines, '观察（observed）', observed, (r) => {
    const parts = [`- **${r.evidenceId || r.id}** ${r.observation || r.summary}`];
    if (r.sourceTarget || r.target) parts.push(`  - target: \`${r.sourceTarget || r.target}\``);
    if (r.sourceTool || r.backend) parts.push(`  - 来源: ${r.sourceTool || r.backend} / ${r.op || '?'}${r.stepId ? ` @${r.stepId}` : ''}`);
    if (r.artifactRef) parts.push(`  - 证据文件: \`${r.artifactRef}\`${r.integrity?.sha256 ? ` (sha256 ${String(r.integrity.sha256).slice(0, 16)}…)` : ''}`);
    if (r.detail) parts.push(`  - 细节: ${String(r.detail).replace(/\n/g, ' ').slice(0, 500)}`);
    return parts.join('\n');
  });
  section(lines, '推断（inferred）', inferred, (r) => `- **${r.evidenceId || r.id}** ${r.observation || r.summary}${r.unknowns?.length ? `\n  - 未决: ${r.unknowns.join('; ')}` : ''}`);
  section(lines, '矛盾（contradiction）', contradicted, (r) => `- **${r.evidenceId || r.id}** ${r.observation || r.summary}`);
  section(lines, '未知（unknown）', unknown, (r) => `- **${r.evidenceId || r.id}** ${(r.unknowns || []).join('; ') || r.observation || r.summary}`);

  section(lines, '结论与证据映射', claimRows, (c) => {
    const refs = c.evidenceRefs?.length ? c.evidenceRefs.join(', ') : '（无证据引用）';
    return `- **${c.claimId}** [${c.kind}] ${c.text}\n  - 证据: ${refs}`;
  });

  if (verification) {
    lines.push('## 验证覆盖');
    lines.push('');
    lines.push(`- overall: ${verification.overall}`);
    lines.push(`- execution: ${verification.execution?.status}`);
    lines.push(`- fact: ${verification.fact?.status}`);
    lines.push(`- delivery: ${verification.delivery?.status}`);
    lines.push('');
  }
  if (desiredOutput?.length) {
    lines.push('## 交付物要求');
    lines.push('');
    for (const d of desiredOutput) lines.push(`- ${d}`);
    lines.push('');
  }
  lines.push('---');
  lines.push('> observed / inferred / unknown / contradiction 已分列；未验证结论不得当作 observed。');
  return { markdown: lines.join('\n'), count: rows.length, claims: claimRows.length, verification: verification || null };
}
