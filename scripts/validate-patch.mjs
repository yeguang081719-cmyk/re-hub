// Validate a DSH cordis.patch.yml, tolerating the loader's `!!js` expression tag.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(path.join('E:/AI/.dsh/profiles/web', 'noop.cjs'));
const YAML = require('yaml');

const file = process.argv[2];
if (!file) { console.error('usage: node validate-patch.mjs <patch.yml>'); process.exit(2); }
const text = fs.readFileSync(file, 'utf8');
if (/\uFFFD/.test(text)) {
  console.error('FAIL: contains U+FFFD replacement characters (encoding is broken)');
  process.exit(1);
}
const withoutJs = text.replace(/!!js\s+/g, '');
const doc = YAML.parse(withoutJs);
const ok = Array.isArray(doc) && doc.every((e) => e && typeof e === 'object');
console.log(ok ? `YAML OK (${doc.length} entries)` : 'YAML parsed but unexpected shape');
if (ok) {
  for (const e of doc) {
    const ins = e.insert?.[0];
    if (ins) console.log(`  - insert ${ins.id} serverName=${ins.config?.serverName} timeout=${ins.config?.toolCallTimeoutMs}`);
  }
}
process.exit(ok ? 0 : 1);
