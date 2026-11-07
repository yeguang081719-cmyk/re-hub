// End-to-end demo of the Android chain (no DSH needed):
// detect -> route -> plan -> REA android-package -> JADX decompile -> apktool decode
// -> REA android-class -> evidence -> report.
import fs from 'node:fs';
import path from 'node:path';
import { detectEnvironment } from '../src/detect.mjs';
import { routeTask, planScenario } from '../src/scenarios.mjs';
import { execBackend } from '../src/backends.mjs';
import { appendEvidence, buildReport } from '../src/evidence.mjs';

const APK = process.argv[2] || path.resolve('tools/samples/calculator-10-foss-release.apk');
const TASK = '这个 APK 的登录参数加密怎么还原，找 sign 算法';
const outDir = path.resolve('state/demo');
fs.mkdirSync(outDir, { recursive: true });

const log = (s) => console.log(s);
const save = (name, obj) => {
  const p = path.join(outDir, name);
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
  return p;
};

// 1) detect
const env = await detectEnvironment(undefined, { refresh: true });
log(`[1] 环境: ${env.summary}`);
save('01-detect.json', env);

// 2) route
const route = routeTask({ task: TASK, target: APK });
log(`[2] 路由: ${route.scenario} (${route.confidence}) reasons=${route.reasons.join(',')}`);
save('02-route.json', route);

// 3) plan
const plan = planScenario({ scenario: route.scenario, target: APK, goal: '还原登录参数签名算法' });
log(`[3] 计划: ${plan.steps.length} 步, 未解析参数=${plan.unresolved.join(',') || '无'}`);
save('03-plan.json', plan);

// 4) REA android package (requires REA_JADX_MCP_JAR, configured in config.json)
const s1 = await execBackend('rea', { op: 'android-package', path: APK, timeoutMs: 300000 });
log(`[4] rea android-package: ok=${s1.ok} classes=${s1.data?.raw_result?.loaded?.class_count ?? '?'} resources=${s1.data?.raw_result?.loaded?.resource_count ?? '?'}`);
save('04-rea-package.json', { ok: s1.ok, evidenceId: s1.data?.evidence_id, loaded: s1.data?.raw_result?.loaded });

// 5) JADX decompile
const s2 = await execBackend('jadx', { op: 'decompile', path: APK, out: path.join(outDir, 'jadx-out'), timeoutMs: 600000 });
log(`[5] jadx decompile: ok=${s2.ok} partial=${s2.partialSuccess} javaFiles=${s2.javaFileCount} out=${s2.outDir}`);
save('05-jadx.json', { ok: s2.ok, partial: s2.partialSuccess, javaFileCount: s2.javaFileCount, outDir: s2.outDir });

// 6) apktool decode
const s3 = await execBackend('apktool', { op: 'decode', path: APK, out: path.join(outDir, 'apktool-out'), timeoutMs: 300000 });
log(`[6] apktool decode: ok=${s3.ok} manifest=${s3.hasManifest} out=${s3.outDir}`);
save('06-apktool.json', { ok: s3.ok, hasManifest: s3.hasManifest, outDir: s3.outDir });

// 7) pick a class from the JADX output and inspect it through REA
let className = null;
if (s2.outDir && fs.existsSync(s2.outDir)) {
  const stack = [s2.outDir];
  const hits = [];
  while (stack.length && hits.length < 200) {
    const cur = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const p = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (/MainActivity\.java$/.test(e.name)) hits.push(p);
    }
  }
  if (hits[0]) className = path.relative(path.join(s2.outDir, 'sources'), hits[0]).replace(/\\/g, '.').replace(/\.java$/, '');
}
log(`[7] 选中类: ${className || '未找到 MainActivity，跳过'}`);
let classResult = null;
if (className) {
  classResult = await execBackend('rea', { op: 'android-class', path: APK, className, timeoutMs: 300000 });
  log(`[7] rea android-class: ok=${classResult.ok} evidence=${classResult.data?.evidence_id || classResult.error || ''}`);
  save('07-rea-class.json', { ok: classResult.ok, className, evidenceId: classResult.data?.evidence_id });
}

// 8) evidence ledger
const ev1 = appendEvidence({
  task: TASK, scenario: route.scenario, target: APK, step: 1, backend: 'rea', op: 'android-package',
  kind: 'observation', confidence: 'high',
  summary: `APK 结构：${s1.data?.raw_result?.loaded?.class_count ?? '?'} 个类，${s1.data?.raw_result?.loaded?.resource_count ?? '?'} 个资源`,
  evidenceRefs: [s1.data?.evidence_id].filter(Boolean),
});
const ev2 = appendEvidence({
  task: TASK, scenario: route.scenario, target: APK, step: 2, backend: 'jadx', op: 'decompile',
  kind: 'observation', confidence: 'high',
  summary: `JADX 反编译出 ${s2.javaFileCount} 个 Java 文件（${s2.partialSuccess ? '部分类失败但主流程可用' : '完整'}）`,
  evidenceRefs: [],
});
const ev3 = appendEvidence({
  task: TASK, scenario: route.scenario, target: APK, step: 3, backend: 'rea', op: 'android-class',
  kind: className && classResult?.ok ? 'observation' : 'unknown', confidence: className ? 'medium' : 'low',
  summary: className ? `已定位入口类 ${className}` : '未找到 MainActivity，需按包名/Manifest 继续定位',
  detail: className ? null : '样本为计算器应用，无登录逻辑；真实目标应结合 Manifest 与网络请求定位签名类',
  unknowns: ['登录/签名逻辑需结合真实业务类与网络请求继续定位'],
});
log(`[8] 证据: ${[ev1, ev2, ev3].map((e) => e.id).join(', ')}`);

const report = buildReport({ title: 'Android 链路演示报告', task: TASK });
const reportPath = path.join(outDir, 'demo-report.md');
fs.writeFileSync(reportPath, report.markdown, 'utf8');
log(`[9] 报告: ${reportPath} (${report.count} 条证据)`);
