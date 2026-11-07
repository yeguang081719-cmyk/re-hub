// Process execution helpers: bounded, timeout-aware, Windows-friendly.
import { spawn } from 'node:child_process';

const MAX_BYTES_DEFAULT = 4_000_000;

/**
 * Run a process and capture stdout/stderr with a hard timeout.
 * @returns {Promise<{ok:boolean,code:number|null,stdout:string,stderr:string,ms:number,timedOut:boolean,truncated:boolean,error?:string}>}
 */
export function run(cmd, args = [], opts = {}) {
  const {
    cwd,
    timeoutMs = 120_000,
    env = {},
    maxBytes = MAX_BYTES_DEFAULT,
    input = null,
  } = opts;

  return new Promise((resolve) => {
    const started = Date.now();
    let stdout = '';
    let stderr = '';
    let truncated = false;
    let timedOut = false;
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    let child;
    try {
      child = spawn(cmd, args, {
        cwd,
        env: { ...process.env, ...env },
        windowsHide: true,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      finish({ ok: false, code: null, stdout: '', stderr: String(err), ms: 0, timedOut: false, truncated: false, error: 'spawn-failed' });
      return;
    }

    const append = (chunk, which) => {
      const text = chunk.toString('utf8');
      const current = which === 'out' ? stdout : stderr;
      if (current.length + text.length > maxBytes) {
        truncated = true;
        const room = Math.max(0, maxBytes - current.length);
        if (room > 0) {
          if (which === 'out') stdout += text.slice(0, room);
          else stderr += text.slice(0, room);
        }
        return;
      }
      if (which === 'out') stdout += text;
      else stderr += text;
    };

    child.stdout.on('data', (d) => append(d, 'out'));
    child.stderr.on('data', (d) => append(d, 'err'));

    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
    }, Math.max(1000, timeoutMs));

    child.on('error', (err) => {
      clearTimeout(timer);
      finish({ ok: false, code: null, stdout, stderr: stderr + '\n' + String(err), ms: Date.now() - started, timedOut, truncated, error: 'spawn-error' });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      finish({
        ok: code === 0 && !timedOut,
        code,
        stdout,
        stderr,
        ms: Date.now() - started,
        timedOut,
        truncated,
      });
    });

    if (input != null) {
      try { child.stdin.write(input); child.stdin.end(); } catch { /* ignore */ }
    } else {
      try { child.stdin.end(); } catch { /* ignore */ }
    }
  });
}

/** Best-effort executable lookup on PATH. */
export async function which(name, opts = {}) {
  const r = await run('where.exe', [name], { timeoutMs: 8000, ...opts });
  if (r.ok) {
    const first = r.stdout.split(/\r?\n/).map((s) => s.trim()).find(Boolean);
    if (first) return first;
  }
  return null;
}

/** Trim a long string for tool responses. */
export function clip(text, max = 60_000) {
  if (typeof text !== 'string') return text;
  if (text.length <= max) return text;
  return text.slice(0, max) + `\n... [truncated ${text.length - max} chars]`;
}
