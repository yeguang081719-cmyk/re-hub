#!/usr/bin/env node
// Download the reverse-engineering engines this project needs, on demand,
// from their official GitHub releases.
//
//   node scripts/bootstrap.mjs --check                 # 只看缺什么，不下载
//   node scripts/bootstrap.mjs --only jadx,apktool    # 只装这两个
//   node scripts/bootstrap.mjs --all --yes            # 装全部（含 REA/Ghidra，较大）
//   node scripts/bootstrap.mjs --only ghidra --yes    # 单独装 Ghidra（~400MB）
//
// 默认 dry-run：只有加 --yes 才真正下载/写入 config.json。

import { runInstaller, installedStatus, TOOLS } from '../src/installer.mjs';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => {
  const i = argv.indexOf(f);
  return i > -1 ? argv[i + 1] : null;
};

if (has('--check') || has('--status')) {
  const st = installedStatus();
  console.log('tool                 status   path');
  for (const [id, s] of Object.entries(st)) {
    console.log(`${id.padEnd(20)} ${(s.installed ? 'OK' : 'MISSING').padEnd(8)} ${s.path || TOOLS[id].note}`);
  }
  process.exit(0);
}

const onlyArg = val('--only');
const only = has('--all') ? null : onlyArg ? onlyArg.split(',').map((s) => s.trim()).filter(Boolean) : null;
const yes = has('--yes') || has('-y');

const res = await runInstaller({ only, dryRun: !yes, updateConfig: !has('--no-config') });

console.log('');
console.log(JSON.stringify({ installed: res.installed, skipped: res.skipped, planned: res.planned, failed: res.failed }, null, 2));
if (!yes) console.log('\n(dry-run) 加 --yes 才会真正下载并写 config.json');
process.exit(res.failed.length ? 1 : 0);
