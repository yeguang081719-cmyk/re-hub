#!/usr/bin/env node
// Generate VENDOR.md from the cloned repositories (no network needed).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const VENDOR = path.join(ROOT, 'vendor');

const CATEGORY = {
  marrow: '通用/多目标（REA GUI 配套）',
  revula: '通用/多目标',
  'Reverse-Engineering-Playground': '通用/多目标（多 agent 实验）',
  'ida-pro-mcp': '原生 · IDA Pro（社区）',
  'ida-mcp': '原生 · IDA Pro（Hex-Rays 官方）',
  'ida-mcp-rs': '原生 · IDA Pro（headless, Rust）',
  GhidraMCP: '原生 · Ghidra',
  'ghidra-mcp': '原生 · Ghidra（200+ 工具）',
  'reverse-engineering-assistant': '原生 · Ghidra（ReVA agent）',
  'pyghidra-mcp': '原生 · Ghidra（headless Python）',
  'ghidra-headless-mcp': '原生 · Ghidra（headless）',
  binary_ninja_mcp: '原生 · Binary Ninja',
  'binary-ninja-headless-mcp': '原生 · Binary Ninja（headless, 180 工具）',
  'jadx-ai-mcp': 'Android · JADX 插件',
  'jadx-mcp-server': 'Android · JADX 独立 MCP',
  'apktool-mcp-server': 'Android · apktool 资源',
  'MobileRE-Skill': 'Android · 动态/脱壳 skill 集',
  'claude-reverse-skills': 'Android/JS · Claude 逆向 skill 集',
  'js-reverse-mcp': 'Web/JS · 有头 Chrome 逆向',
  'JSReverser-MCP': 'Web/JS · 浏览器逆向',
  'js-reverse-pro-mcp': 'Web/JS · js-reverse 增强分支',
  'frida-mcp': '动态 · Frida 插桩',
  'kahlo-mcp': '动态 · Frida（Android 自治）',
  LLM4Decompile: '研究 · LLM 反编译',
  buttercup: '相邻 · AIxCC 漏洞发现/修补 CRS',
};

function git(dir, args) {
  try {
    return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', timeout: 20000 }).trim();
  } catch {
    return '';
  }
}

function dirSize(dir) {
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const p = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) { try { total += fs.statSync(p).size; } catch { /* ignore */ } }
    }
  }
  return total;
}

const rows = [];
if (fs.existsSync(VENDOR)) {
  for (const name of fs.readdirSync(VENDOR)) {
    const dir = path.join(VENDOR, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    const remote = git(dir, ['remote', 'get-url', 'origin']) || `https://github.com/${guessRepo(name)}`;
    const head = git(dir, ['rev-parse', '--short', 'HEAD']);
    const date = git(dir, ['log', '-1', '--format=%cs']);
    const mb = (dirSize(dir) / 1024 / 1024).toFixed(1);
    rows.push({ name, remote, head, date, mb, category: CATEGORY[name] || '其他' });
  }
}

function guessRepo(name) {
  return name;
}

rows.sort((a, b) => a.category.localeCompare(b.category, 'zh'));

const lines = [];
lines.push('# VENDOR — 已整合的逆向项目源码');
lines.push('');
lines.push(`生成时间：${new Date().toISOString()}  ·  仓库数：${rows.length}（另有 REA 已在 downloads/rea 本地运行）`);
lines.push('');
lines.push('这些仓库是"能力地图 + 可注册后端"的来源。真正参与运行的是 `rehub` 的适配器；');
lines.push('需要 MCP 能力且宿主可用的，写进 `config.json` 的 `mcpBackends` 即可用 `rehub_mcp` 调用。');
lines.push('');
lines.push('| 类别 | 仓库 | 提交 | 最近提交日 | 大小 |');
lines.push('|---|---|---|---|---|');
for (const r of rows) {
  lines.push(`| ${r.category} | [${r.name}](${r.remote}) | \`${r.head}\` | ${r.date} | ${r.mb} MB |`);
}
lines.push('');
lines.push('> 许可：各仓库保留原许可证（多为 MIT/Apache-2.0）。IDB/IDA/Hex-Rays/Binary Ninja/JEB 等商业工具');
lines.push('> 需自备合法授权；本目录不包含任何商业工具二进制。');
fs.writeFileSync(path.join(ROOT, 'VENDOR.md'), lines.join('\n') + '\n', 'utf8');
console.log(`VENDOR.md written: ${rows.length} repos`);
