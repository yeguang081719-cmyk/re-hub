#!/usr/bin/env node
// Register RE Hub into DSH (MCP client) and install the official skill.
// Idempotent. Safe to re-run.
//
//   node install/register.mjs            # install (MCP registration + skill)
//   node install/register.mjs --check    # verify only, no writes
//   node install/register.mjs --remove   # remove the MCP registration (keeps skill)
//   node install/register.mjs --no-skill # only register the MCP server

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const SERVER = path.join(PROJECT_ROOT, 'src', 'server.mjs');
const SKILL_SRC = path.join(PROJECT_ROOT, 'skills', 'reverse-engineering-hub');
const SKILL_DST = path.join(os.homedir(), '.agents', 'skills', 'reverse-engineering-hub');

const DSH_HOME = process.env.DSH_HOME || 'E:/AI/.dsh';
const PATCH = path.join(DSH_HOME, 'cordis.patch.yml');
const MARKER = '# --- rehub-mcp (managed by re-hub/install/register.mjs) ---';
const BLOCK = `
${MARKER}
- insert:
    - id: rehub-mcp
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: rehub
        transport: stdio
        command: 'C:\\Program Files\\nodejs\\node.exe'
        args:
          - '${SERVER.replace(/\\/g, '/')}'
        toolCallTimeoutMs: 900000
`;

const args = new Set(process.argv.slice(2));
const checkOnly = args.has('--check');
const remove = args.has('--remove');
const noSkill = args.has('--no-skill');

function log(msg) { console.log(`[rehub-install] ${msg}`); }

function findNodeExe() {
  const candidates = ['C:/Program Files/nodejs/node.exe', process.execPath];
  for (const c of candidates) if (c && fs.existsSync(c)) return c;
  return 'node';
}

function patchStatus() {
  if (!fs.existsSync(PATCH)) return { ok: false, reason: `patch file missing: ${PATCH}` };
  const text = fs.readFileSync(PATCH, 'utf8');
  return { ok: text.includes(MARKER), reason: text.includes(MARKER) ? 'registered' : 'not registered' };
}

function installSkill() {
  if (!fs.existsSync(SKILL_SRC)) throw new Error(`skill source missing: ${SKILL_SRC}`);
  fs.mkdirSync(path.dirname(SKILL_DST), { recursive: true });
  fs.rmSync(SKILL_DST, { recursive: true, force: true });
  fs.cpSync(SKILL_SRC, SKILL_DST, { recursive: true });
  log(`skill installed: ${SKILL_DST}`);
}

function patchConfig() {
  if (!fs.existsSync(PATCH)) {
    fs.mkdirSync(path.dirname(PATCH), { recursive: true });
    fs.writeFileSync(PATCH, '[]\n', 'utf8');
  }
  let text = fs.readFileSync(PATCH, 'utf8');
  if (text.includes(MARKER)) {
    log('MCP registration already present — skipping');
    return;
  }
  const block = BLOCK;
  text = text.replace(/\s*$/, '\n') + block;
  fs.writeFileSync(PATCH, text, 'utf8');
  log(`MCP registration appended: ${PATCH}`);
}

function removeConfig() {
  if (!fs.existsSync(PATCH)) return;
  const text = fs.readFileSync(PATCH, 'utf8');
  if (!text.includes(MARKER)) { log('MCP registration not found — nothing to remove'); return; }
  const idx = text.indexOf(MARKER);
  const before = text.slice(0, idx).replace(/\s*$/, '\n');
  fs.writeFileSync(PATCH, before, 'utf8');
  log(`MCP registration removed from ${PATCH}`);
}

function verify() {
  const problems = [];
  if (!fs.existsSync(SERVER)) problems.push(`server missing: ${SERVER}`);
  if (!fs.existsSync(SKILL_DST) && !noSkill) problems.push(`skill not installed: ${SKILL_DST}`);
  if (!patchStatus().ok) problems.push(`MCP not registered in ${PATCH}`);
  if (!fs.existsSync(path.join(PROJECT_ROOT, 'config.json'))) problems.push('config.json missing');
  if (problems.length === 0) {
    log('VERIFY OK');
    log('  MCP server : rehub (tools appear as mcp__rehub__*)');
    log('  Skill      : reverse-engineering-hub');
    log('  Next       : restart DSH (or reload the profile) to pick up mcp__rehub__*');
    return true;
  }
  log('VERIFY FAILED:');
  for (const p of problems) log(`  - ${p}`);
  return false;
}

function main() {
  log(`project: ${PROJECT_ROOT}`);
  log(`dsh home: ${DSH_HOME}`);
  if (checkOnly) {
    const ok = verify();
    process.exit(ok ? 0 : 1);
  }
  if (remove) {
    removeConfig();
    process.exit(0);
  }

  if (!noSkill) installSkill();
  patchConfig();

  // sanity: server starts and answers initialize
  const ok = verify();
  if (!ok) process.exit(1);
  log('');
  log('完成。重启 DSH 后：');
  log('  1) 工具列表会出现 mcp__rehub__detect / route / plan / exec / mcp / evidence');
  log('  2) skill「reverse-engineering-hub」会自动出现在技能目录');
  log('  3) 冒烟测试：node tests/smoke.mjs');
}

main();
