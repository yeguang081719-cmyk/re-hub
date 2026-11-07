// Minimal MCP (Model Context Protocol) stdio implementation.
// - startMcpServer(): serve tools/prompts to any MCP client (DSH, Claude Code, Cursor...)
// - McpClient: spawn and talk to another MCP server (sub-backend multiplexing)
//
// Framing: supports both newline-delimited JSON (MCP stdio spec) and
// Content-Length framed JSON-RPC (older LSP-style clients).

import { spawn } from 'node:child_process';

const PROTOCOL_VERSION = '2024-11-05';

/* ------------------------------------------------------------------ */
/* Framing                                                             */
/* ------------------------------------------------------------------ */

class FrameParser {
  constructor() {
    this.buffer = '';
  }

  push(chunk) {
    this.buffer += chunk;
    const out = [];
    for (;;) {
      const text = this.buffer;
      if (!text) break;

      if (/^Content-Length:/i.test(text)) {
        const headerEnd = text.indexOf('\r\n\r\n');
        if (headerEnd === -1) break;
        const header = text.slice(0, headerEnd);
        const m = /Content-Length:\s*(\d+)/i.exec(header);
        if (!m) {
          // malformed header, drop it
          this.buffer = text.slice(headerEnd + 4);
          continue;
        }
        const len = Number(m[1]);
        const bodyStart = headerEnd + 4;
        if (text.length < bodyStart + len) break;
        const body = text.slice(bodyStart, bodyStart + len);
        this.buffer = text.slice(bodyStart + len);
        try { out.push(JSON.parse(body)); } catch { /* skip bad frame */ }
        continue;
      }

      const nl = text.indexOf('\n');
      if (nl === -1) break;
      const line = text.slice(0, nl).trim();
      this.buffer = text.slice(nl + 1);
      if (!line) continue;
      try { out.push(JSON.parse(line)); } catch { /* skip bad line */ }
    }
    return out;
  }
}

function writeMessage(stream, obj) {
  stream.write(JSON.stringify(obj) + '\n');
}

/* ------------------------------------------------------------------ */
/* Client (spawn a child MCP server)                                    */
/* ------------------------------------------------------------------ */

export class McpClient {
  constructor(spec, opts = {}) {
    this.spec = spec;
    this.defaultTimeoutMs = opts.timeoutMs ?? 120_000;
    this.nextId = 1;
    this.pending = new Map();
    this.child = null;
    this.parser = new FrameParser();
    this.stderrTail = '';
    this.closed = false;
  }

  async start() {
    const { command, args = [], cwd, env = {} } = this.spec;
    this.child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk) => {
      for (const msg of this.parser.push(chunk)) this.#onMessage(msg);
    });
    this.child.stderr.setEncoding('utf8');
    this.child.stderr.on('data', (chunk) => {
      this.stderrTail = (this.stderrTail + chunk).slice(-8000);
    });
    this.child.on('error', (err) => this.#failAll(err));
    this.child.on('close', () => {
      this.closed = true;
      this.#failAll(new Error('mcp-backend-closed'));
    });

    const init = await this.request('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'rehub', version: '1.0.0' },
    });
    this.notify('notifications/initialized', {});
    return init;
  }

  #onMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.id != null && this.pending.has(msg.id)) {
      const { resolve, reject, timer } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      clearTimeout(timer);
      if (msg.error) reject(new Error(`mcp-error ${msg.error.code}: ${msg.error.message}`));
      else resolve(msg.result);
    }
  }

  #failAll(err) {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }

  notify(method, params) {
    if (!this.child || this.closed) return;
    writeMessage(this.child.stdin, { jsonrpc: '2.0', method, params });
  }

  request(method, params = {}, timeoutMs) {
    if (!this.child || this.closed) return Promise.reject(new Error('mcp-backend-not-running'));
    const id = this.nextId++;
    const timeout = timeoutMs ?? this.defaultTimeoutMs;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`mcp-timeout after ${timeout}ms: ${method}`));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      writeMessage(this.child.stdin, { jsonrpc: '2.0', id, method, params });
    });
  }

  async listTools() {
    return this.request('tools/list', {});
  }

  async callTool(name, args = {}, timeoutMs) {
    return this.request('tools/call', { name, arguments: args }, timeoutMs);
  }

  async close() {
    this.closed = true;
    try { this.child?.stdin.end(); } catch { /* ignore */ }
    try { this.child?.kill(); } catch { /* ignore */ }
  }
}

/* ------------------------------------------------------------------ */
/* Server                                                              */
/* ------------------------------------------------------------------ */

/**
 * @param {object} opts
 * @param {string} opts.name
 * @param {string} opts.version
 * @param {Array<{name:string,description:string,inputSchema?:object,handler:Function}>} opts.tools
 * @param {Array<{name:string,description:string,arguments?:Array,handler:Function}>} [opts.prompts]
 * @param {(msg:string)=>void} [opts.log]
 */
export function startMcpServer({ name, version, tools, prompts = [], log = () => {} }) {
  const byName = new Map(tools.map((t) => [t.name, t]));
  const promptByName = new Map(prompts.map((p) => [p.name, p]));
  const parser = new FrameParser();

  const send = (obj) => writeMessage(process.stdout, obj);

  const respond = (id, result) => send({ jsonrpc: '2.0', id, result });
  const respondError = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

  async function handle(msg) {
    if (!msg || typeof msg !== 'object') return;
    const isNotification = msg.id == null;

    try {
      switch (msg.method) {
        case 'initialize': {
          respond(msg.id, {
            protocolVersion: msg.params?.protocolVersion || PROTOCOL_VERSION,
            capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } },
            serverInfo: { name, version },
            instructions:
              'RE Hub 逆向统一网关 = 《逆向工程操作手册》的执行层。' +
              '标准动作：rehub_detect 侦察 → rehub_route 定位场景（返回 chapter）→ rehub_book 只读那一章 → ' +
              'rehub_plan 出链路 → rehub_exec 执行 → rehub_evidence 记录/出报告。' +
              '原生命令用 rehub_exec backend=rea，也可直接用 mcp__rea__* 工具。',
          });
          return;
        }
        case 'notifications/initialized':
        case 'notifications/cancelled':
          return;
        case 'ping':
          if (!isNotification) respond(msg.id, {});
          return;
        case 'tools/list': {
          respond(msg.id, {
            tools: tools.map((t) => ({
              name: t.name,
              description: t.description,
              inputSchema: t.inputSchema || { type: 'object', properties: {} },
            })),
          });
          return;
        }
        case 'tools/call': {
          const tool = byName.get(msg.params?.name);
          if (!tool) {
            respondError(msg.id, -32602, `unknown tool: ${msg.params?.name}`);
            return;
          }
          const started = Date.now();
          try {
            const result = await tool.handler(msg.params?.arguments || {});
            respond(msg.id, {
              content: [{ type: 'text', text: stringify(result) }],
              isError: false,
              _meta: { ms: Date.now() - started },
            });
          } catch (err) {
            log(`tool ${msg.params?.name} failed: ${err?.message || err}`);
            respond(msg.id, {
              content: [{ type: 'text', text: stringify({ error: String(err?.message || err) }) }],
              isError: true,
              _meta: { ms: Date.now() - started },
            });
          }
          return;
        }
        case 'prompts/list': {
          respond(msg.id, {
            prompts: prompts.map((p) => ({
              name: p.name,
              description: p.description,
              arguments: p.arguments || [],
            })),
          });
          return;
        }
        case 'prompts/get': {
          const prompt = promptByName.get(msg.params?.name);
          if (!prompt) {
            respondError(msg.id, -32602, `unknown prompt: ${msg.params?.name}`);
            return;
          }
          const out = await prompt.handler(msg.params?.arguments || {});
          respond(msg.id, {
            description: prompt.description,
            messages: [
              {
                role: 'user',
                content: { type: 'text', text: typeof out === 'string' ? out : stringify(out) },
              },
            ],
          });
          return;
        }
        default:
          if (!isNotification) respondError(msg.id, -32601, `method not found: ${msg.method}`);
      }
    } catch (err) {
      log(`handler error: ${err?.stack || err}`);
      if (!isNotification) respondError(msg.id, -32603, String(err?.message || err));
    }
  }

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    for (const msg of parser.push(chunk)) void handle(msg);
  });
  process.stdin.on('end', () => process.exit(0));

  log(`${name}@${version} MCP server ready (${tools.length} tools, ${prompts.length} prompts)`);
}

function stringify(value) {
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

function toStructured(value) {
  if (value == null || typeof value !== 'object') return { result: value };
  return value;
}
