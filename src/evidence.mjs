// Evidence ledger: every finding is appended as one JSONL record so a report
// can be rebuilt and claims stay traceable (observed / inferred / unknown).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadConfig } from './detect.mjs';

function ledgerPath(cfg = loadConfig()) {
  fs.mkdirSync(cfg.stateDir, { recursive: true });
  return path.join(cfg.stateDir, 'evidence.jsonl');
}

function readAll(cfg) {
  const file = ledgerPath(cfg);
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
  const out = [];
  for (const line of lines) {
    try { out.push(JSON.parse(line)); } catch { /* skip */ }
  }
  return out;
}

export function appendEvidence(record = {}, cfg = loadConfig()) {
  if (!record.summary && !record.finding) {
    throw new Error('evidence 记录至少需要 summary 或 finding 字段');
  }
  const rec = {
    id: `ev_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`,
    ts: new Date().toISOString(),
    task: record.task || null,
    scenario: record.scenario || null,
    target: record.target || null,
    step: record.step || null,
    backend: record.backend || null,
    op: record.op || null,
    kind: record.kind || 'observation', // observation | inference | unknown
    confidence: record.confidence || 'medium',
    summary: record.summary || record.finding || '',
    detail: record.detail || null,
    evidenceRefs: record.evidenceRefs || [],
    artifacts: record.artifacts || [],
    unknowns: record.unknowns || [],
  };
  fs.appendFileSync(ledgerPath(cfg), JSON.stringify(rec) + '\n', 'utf8');
  return rec;
}

export function listEvidence({ scenario, target, limit = 50 } = {}, cfg = loadConfig()) {
  let rows = readAll(cfg);
  if (scenario) rows = rows.filter((r) => r.scenario === scenario);
  if (target) rows = rows.filter((r) => r.target === target);
  rows = rows.slice(-Math.max(1, Math.min(500, Number(limit) || 50)));
  return {
    count: rows.length,
    records: rows.map((r) => ({
      id: r.id,
      ts: r.ts,
      scenario: r.scenario,
      target: r.target,
      kind: r.kind,
      confidence: r.confidence,
      summary: r.summary,
      step: r.step,
      backend: r.backend,
      op: r.op,
    })),
  };
}

export function buildReport({ title = '逆向分析报告', task = null, scenario = null } = {}, cfg = loadConfig()) {
  let rows = readAll(cfg);
  if (scenario) rows = rows.filter((r) => r.scenario === scenario);
  if (task) rows = rows.filter((r) => r.task === task);
  const byScenario = new Map();
  for (const r of rows) {
    const key = r.scenario || 'unclassified';
    if (!byScenario.has(key)) byScenario.set(key, []);
    byScenario.get(key).push(r);
  }
  const lines = [];
  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`生成时间：${new Date().toISOString()}`);
  lines.push(`证据记录：${rows.length} 条`);
  lines.push('');
  for (const [key, items] of byScenario) {
    lines.push(`## ${key}`);
    lines.push('');
    for (const r of items) {
      const tag = r.kind === 'inference' ? '（推断）' : r.kind === 'unknown' ? '（未知）' : '';
      lines.push(`- **${r.id}** ${tag}${r.summary}`);
      if (r.target) lines.push(`  - target: \`${r.target}\``);
      if (r.backend || r.op) lines.push(`  - 来源: ${r.backend || '?'} / ${r.op || '?'}`);
      if (r.detail) lines.push(`  - 细节: ${String(r.detail).replace(/\n/g, ' ').slice(0, 500)}`);
      if (r.unknowns?.length) lines.push(`  - 未决: ${r.unknowns.join('; ')}`);
    }
    lines.push('');
  }
  lines.push('---');
  lines.push('> observed / inferred / unknown 已分列；未列出的都是未验证假设。');
  return { markdown: lines.join('\n'), count: rows.length };
}
