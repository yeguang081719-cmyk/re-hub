#!/usr/bin/env node
// RE Hub — one MCP gateway for scenario-routed reverse engineering.
//
// Tools are intentionally few and stable; the routing knowledge lives in
// scenarios.mjs and in the bundled skill. Backends are real command adapters.

import fs from 'node:fs';
import path from 'node:path';
import { startMcpServer, McpClient } from './lib/mcp.mjs';
import { loadConfig, detectEnvironment, annotateScenario, PROJECT_ROOT, invalidateDetectCache } from './detect.mjs';
import { routeTask, planScenario, scenarioCatalog, SCENARIOS } from './scenarios.mjs';
import { execBackend } from './backends.mjs';
import { appendEvidence, listEvidence, buildReport } from './evidence.mjs';

const VERSION = '1.0.0';
const log = (msg) => process.stderr.write(`[rehub] ${msg}\n`);

// Config is hot-reloaded when config.json's mtime changes (e.g. after the
// installer downloads JADX/apktool), so no DSH restart is needed for backend
// additions; only the MCP registration itself needs a restart.
const CONFIG_PATH = process.env.REHUB_CONFIG || path.join(PROJECT_ROOT, 'config.json');
let cfgCache = loadConfig();
let cfgMtime = 0;
try { cfgMtime = fs.statSync(CONFIG_PATH).mtimeMs; } catch { /* ignore */ }

function getCfg() {
  try {
    const m = fs.statSync(CONFIG_PATH).mtimeMs;
    if (m !== cfgMtime) {
      cfgCache = loadConfig();
      cfgMtime = m;
      invalidateDetectCache();
    }
  } catch { /* ignore */ }
  return cfgCache;
}

const mcpClients = new Map();

function getMcpClient(backend) {
  const spec = getCfg().mcpBackends?.[backend];
  if (!spec) throw new Error(`未知子 MCP 后端: ${backend}。已配置：${Object.keys(getCfg().mcpBackends || {}).join(', ') || '无'}`);
  if (spec.disabled) throw new Error(`子 MCP 后端 ${backend} 被禁用（config.json 里 disabled=true）`);
  if (!mcpClients.has(backend)) {
    const client = new McpClient(spec, { timeoutMs: getCfg().defaultTimeoutMs });
    mcpClients.set(backend, client);
  }
  return mcpClients.get(backend);
}

async function ensureMcpStarted(backend) {
  const client = getMcpClient(backend);
  if (!client.child) await client.start();
  return client;
}

function closeAll() {
  for (const [, c] of mcpClients) c.close().catch(() => {});
  mcpClients.clear();
}

const tools = [
  {
    name: 'rehub_detect',
    description:
      '侦察本机逆向能力：REA/Ghidra/JADX/apktool/Chrome/adb/Frida/IDA/BinaryNinja/子 MCP 是否可用，vendor 仓库数量，缺失项附安装提示。任何逆向任务第一步都先跑它。',
    inputSchema: { type: 'object', properties: { refresh: { type: 'boolean', description: '强制刷新检测缓存' } } },
    handler: async ({ refresh } = {}) => detectEnvironment(getCfg(), { refresh: !!refresh }),
  },
  {
    name: 'rehub_scenarios',
    description: '列出 13 类逆向场景（原生/Android 静态/Android 动态/Web JS/Web 运行时/Electron/.NET/固件/抓包/归档/进程行为/漏洞研究/分诊）及各自链路。',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => ({ count: SCENARIOS.length, scenarios: scenarioCatalog() }),
  },
  {
    name: 'rehub_route',
    description:
      '意图识别与场景路由：输入用户原话 task（可带目标路径/URL），返回场景 id、置信度、理由、可用性、缺失依赖、澄清问题。低置信度时必须先向用户澄清，不要硬选链路。',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: '用户原话/任务描述（中文或英文）' },
        target: { type: 'string', description: '目标路径或 URL（可选，能显著提高准确率）' },
        hints: { type: 'array', items: { type: 'string' }, description: '额外提示词（可选）' },
      },
      required: ['task'],
    },
    handler: async ({ task = '', target = '', hints = [] } = {}) => {
      const env = await detectEnvironment(getCfg());
      const route = routeTask({ task, target, hints });
      const scenario = SCENARIOS.find((s) => s.id === route.scenario);
      const readiness = annotateScenario(env, scenario);
      const missing = readiness.requiresReady.filter((r) => !r.ready).map((r) => ({
        backend: r.backend,
        install: env.backends[r.backend]?.install || env.mcp?.[r.backend]?.install || '见 rehub_detect 的 install 字段',
        role: env.backends[r.backend]?.role || null,
      }));
      let next = null;
      if (route.confidence === 'low' || route.scenario === 'triage') {
        next = { action: 'clarify', questions: route.clarify };
      } else if (missing.length > 0) {
        next = { action: 'install-missing', missing };
      } else {
        next = { action: 'plan', tool: 'rehub_plan', args: { scenario: route.scenario, target: target || '<target>' } };
      }
      return { ...route, readiness, missing, next };
    },
  },
  {
    name: 'rehub_book',
    description:
      '这本书的目录与正文：不带 chapter 返回目录（00 使用说明 + 13 个场景章 + 3 个附录）；带 chapter 返回该章完整正文。chapter 可用 "04-web-js"/"04"/scenario id（如 "web-js"）。rehub_route 返回的 chapter 直接传进来即可。',
    inputSchema: {
      type: 'object',
      properties: {
        chapter: { type: 'string', description: '章 id：04-web-js / 04 / web-js 等；省略则返回目录' },
      },
    },
    handler: async ({ chapter } = {}) => {
      const chapters = listChapters();
      if (!chapter) {
        return {
          title: '《逆向工程操作手册（RE Hub 版）》',
          chapters,
          usage: '先 rehub_route 拿到 chapter，再 rehub_book { chapter } 读那一章；不要整本读。',
        };
      }
      const ch = readChapter(chapter);
      if (!ch) return { ok: false, error: `未找到章节: ${chapter}`, available: chapters.map((c) => c.id) };
      return { ok: true, ...ch };
    },
  },
  {
    name: 'rehub_plan',
    description:
      '为指定场景生成可执行链路：每步的 backend/op/参数、所需前置、未解析参数（needs）、证据记录要求。生成后按步骤调用 rehub_exec（或直接用 mcp__rea__* 工具）。',
    inputSchema: {
      type: 'object',
      properties: {
        scenario: { type: 'string', description: '场景 id，来自 rehub_route/rehub_scenarios' },
        target: { type: 'string', description: '目标路径/URL' },
        goal: { type: 'string', description: '用户最终要什么产出（可选）' },
        options: { type: 'object', description: '链路参数：procedure/className/methodName/cdpEndpoint/targetId/package/device/workdir 等' },
      },
      required: ['scenario'],
    },
    handler: async ({ scenario, target = '', goal = '', options = {} } = {}) => {
      const plan = planScenario({ scenario, target, goal, options });
      const env = await detectEnvironment(getCfg());
      const s = SCENARIOS.find((x) => x.id === scenario);
      return { ...plan, readiness: annotateScenario(env, s) };
    },
  },
  {
    name: 'rehub_exec',
    description:
      '执行一步逆向操作。backend=rea|jadx|apktool|ghidra|adb|frida，op 见各后端（rea 支持 analyze/decompile/function/inspect-artifact/android-package/android-class/android-method/decode-resources/js-application/firmware/web-bundle/raw 等）。返回结构化 data + 原始输出裁剪。',
    inputSchema: {
      type: 'object',
      properties: {
        backend: { type: 'string', description: '后端 id' },
        op: { type: 'string', description: '操作名' },
        args: { type: 'object', description: '操作参数：path/target/procedure/className/methodName/out/args 等' },
        timeoutMs: { type: 'number', description: '覆盖默认超时' },
      },
      required: ['backend', 'op'],
    },
    handler: async ({ backend, op, args = {}, timeoutMs } = {}) => {
      const started = Date.now();
      try {
        const result = await execBackend(backend, { ...args, op, ...(timeoutMs ? { timeoutMs } : {}) }, getCfg());
        // Bound very large structured results (e.g. REA analyze evidence bundles):
        // keep the response small, persist the full JSON for inspection.
        const MAX_DATA = 120_000;
        if (result?.data) {
          const serialized = JSON.stringify(result.data);
          if (serialized.length > MAX_DATA) {
            const dir = path.join(getCfg().stateDir, 'outputs');
            fs.mkdirSync(dir, { recursive: true });
            const file = path.join(dir, `rehub-${backend}-${op}-${Date.now()}.json`);
            fs.writeFileSync(file, serialized, 'utf8');
            result.data = {
              truncated: true,
              originalBytes: serialized.length,
              savedTo: file,
              topKeys: Object.keys(result.data).slice(0, 30),
              note: '完整结构化输出已落盘到 savedTo；需要细节时用文件读取或缩小查询（加 --procedure / className 等参数）。',
            };
          }
        }
        return { ...result, elapsedMs: Date.now() - started };
      } catch (err) {
        return {
          backend,
          op,
          ok: false,
          code: err.code || 'exec-failed',
          error: String(err.message || err),
          install: err.code === 'backend-unavailable' ? (await detectEnvironment(getCfg())).backends?.[backend]?.install : undefined,
          elapsedMs: Date.now() - started,
        };
      }
    },
  },
  {
    name: 'rehub_mcp',
    description:
      '子 MCP 多路复用：列出/调用已配置的外部 MCP 逆向服务（js-reverse-mcp、ghidra-mcp、ida-mcp、binary-ninja-mcp 等）。action=list 看工具名，action=call 调工具。',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'call', 'close'], description: '动作' },
        backend: { type: 'string', description: 'config.json mcpBackends 里的名字' },
        tool: { type: 'string', description: 'action=call 时的子工具名' },
        args: { type: 'object', description: 'action=call 时的参数' },
      },
      required: ['action', 'backend'],
    },
    handler: async ({ action, backend, tool, args = {} } = {}) => {
      try {
        if (action === 'close') {
          const c = mcpClients.get(backend);
          if (c) { await c.close(); mcpClients.delete(backend); }
          return { backend, closed: true };
        }
        const client = await ensureMcpStarted(backend);
        if (action === 'list') {
          const res = await client.listTools();
          return { backend, tools: (res.tools || []).map((t) => ({ name: t.name, description: t.description })) };
        }
        if (action === 'call') {
          if (!tool) throw new Error('action=call 需要 tool');
          const res = await client.callTool(tool, args);
          return { backend, tool, result: res };
        }
        throw new Error(`未知 action: ${action}`);
      } catch (err) {
        return { backend, ok: false, error: String(err.message || err) };
      }
    },
  },
  {
    name: 'rehub_evidence',
    description:
      '证据账本：append 追加一条（kind=observation/inference/unknown，含 summary/detail/unknowns），list 查看，report 生成 Markdown 报告。每完成一步逆向都追加，交付时用 report。',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['append', 'list', 'report'], description: '动作' },
        record: { type: 'object', description: 'append 的记录：task/scenario/target/step/backend/op/kind/confidence/summary/detail/evidenceRefs/unknowns' },
        scenario: { type: 'string', description: 'list/report 过滤' },
        target: { type: 'string', description: 'list 过滤' },
        limit: { type: 'number', description: 'list 条数' },
        title: { type: 'string', description: 'report 标题' },
      },
      required: ['action'],
    },
    handler: async ({ action, record = {}, scenario, target, limit, title } = {}) => {
      if (action === 'append') return appendEvidence(record, getCfg());
      if (action === 'list') return listEvidence({ scenario, target, limit }, getCfg());
      if (action === 'report') return buildReport({ title: title || '逆向分析报告', scenario }, getCfg());
      throw new Error(`未知 action: ${action}`);
    },
  },
];

const skillPath = path.join(PROJECT_ROOT, 'skills', 'reverse-engineering-hub', 'SKILL.md');
const bookDir = path.join(PROJECT_ROOT, 'skills', 'reverse-engineering-hub', 'chapters');
const skillText = () => (fs.existsSync(skillPath) ? fs.readFileSync(skillPath, 'utf8') : '# skill missing');

/** Chapter ids are the markdown file names (e.g. "04-web-js"). */
function listChapters() {
  if (!fs.existsSync(bookDir)) return [];
  return fs
    .readdirSync(bookDir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => {
      const id = f.replace(/\.md$/, '');
      let title = id;
      try {
        const head = fs.readFileSync(path.join(bookDir, f), 'utf8').split(/\r?\n/).find((l) => l.startsWith('# '));
        if (head) title = head.replace(/^#\s*/, '');
      } catch { /* ignore */ }
      return { id, title };
    });
}

function resolveChapter(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  const chapters = listChapters();
  const lower = raw.toLowerCase();
  const byExact = chapters.find((c) => c.id.toLowerCase() === lower);
  if (byExact) return byExact;
  const byNum = chapters.find((c) => c.id.toLowerCase().startsWith(lower + '-') || c.id.toLowerCase() === lower);
  if (byNum) return byNum;
  // scenario id -> chapter id (e.g. "web-js" -> "04-web-js")
  const s = SCENARIOS.find((x) => x.id.toLowerCase() === lower);
  if (s?.chapter) return chapters.find((c) => c.id === s.chapter || c.id.toLowerCase().startsWith(s.chapter.split('-')[0] + '-')) || null;
  return null;
}

function readChapter(input) {
  const ch = resolveChapter(input);
  if (!ch) return null;
  const content = fs.readFileSync(path.join(bookDir, `${ch.id}.md`), 'utf8');
  return { ...ch, content, chars: content.length };
}

const prompts = [
  {
    name: 'reverse-engineering-router',
    description: '官方 skill：逆向任务意图识别 + 场景分类 + 链路路由规则（与 rehub_* 工具配套）。',
    arguments: [],
    handler: async () => skillText(),
  },
  {
    name: 'scenario-chain',
    description: '按场景 id 返回该链路的执行步骤与注意事项。',
    arguments: [{ name: 'scenario', description: '场景 id', required: true }],
    handler: async ({ scenario } = {}) => {
      const s = SCENARIOS.find((x) => x.id === scenario);
      if (!s) return `未知场景：${scenario}`;
      const lines = [`# ${s.title}`, '', s.summary, '', '## 链路'];
      for (const c of s.chain) lines.push(`${c.step}. **${c.backend}:${c.op}** — ${c.why}`);
      if (s.reaTools?.length) lines.push('', '## 也可直接用 REA MCP 工具', ...s.reaTools.map((t) => `- ${t}`));
      if (s.install && Object.keys(s.install).length) lines.push('', '## 依赖/安装', ...Object.entries(s.install).map(([k, v]) => `- ${k}: ${v}`));
      return lines.join('\n');
    },
  },
  {
    name: 'chapter',
    description: '按章 id 取《逆向工程操作手册》正文；不传 chapter 则返回目录。',
    arguments: [{ name: 'chapter', description: '章 id，如 04-web-js / 04 / web-js', required: false }],
    handler: async ({ chapter } = {}) => {
      if (!chapter) return JSON.stringify(listChapters(), null, 2);
      const ch = readChapter(chapter);
      return ch ? ch.content : `未找到章节: ${chapter}`;
    },
  },
];

startMcpServer({ name: 'rehub', version: VERSION, tools, prompts, log });
log(`config: rea=${getCfg().reaScript} ghidra=${getCfg().ghidraDir}`);

process.on('SIGINT', () => { closeAll(); process.exit(0); });
process.on('SIGTERM', () => { closeAll(); process.exit(0); });
process.on('exit', closeAll);
