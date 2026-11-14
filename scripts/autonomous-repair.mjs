#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const MAX_TASK = 1800;
const MAX_FILES = 8;
const MAX_PATCH_BYTES = 45000;
const ROOT = process.cwd();
const ALLOWED = file => file === 'index.html' || /^scripts\/nordic\/[a-z0-9._-]+\.js$/i.test(file);

function fail(message) { throw new Error(message); }
function run(command, args, options = {}) {
  return execFileSync(command, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, ...options });
}
function safePaths(raw) {
  const paths = [...new Set(String(raw || '').split(/[\n,;]/).map(x => x.trim()).filter(Boolean))];
  if (!paths.length || paths.length > MAX_FILES) fail('Provide 1–8 explicit source paths.');
  for (const file of paths) {
    if (file.startsWith('/') || file.includes('..') || file.includes('\\') || !ALLOWED(file)) {
      fail('Path is outside the repair allowlist: ' + file);
    }
    const full = path.resolve(ROOT, file);
    if (!full.startsWith(ROOT + path.sep) || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
      fail('Source file does not exist as a regular file: ' + file);
    }
    if (fs.lstatSync(full).isSymbolicLink()) fail('Symlinks are not eligible for repair: ' + file);
  }
  return paths;
}
function patchPaths(diff) {
  const matches = [...diff.matchAll(/^diff --git a\/(.+?) b\/(.+?)$/gm)];
  if (!matches.length) fail('Patch is not a standard unified git diff.');
  const paths = matches.map(match => {
    if (match[1] !== match[2]) fail('File renames are forbidden.');
    return match[2];
  });
  if (new Set(paths).size !== paths.length) fail('Patch contains duplicate file operations.');
  return paths;
}
function stage() {
  const task = String(process.env.REPAIR_TASK || '').trim();
  if (!task || task.length > MAX_TASK) fail('REPAIR_TASK must contain 1–1800 characters.');
  const paths = safePaths(process.env.REPAIR_SOURCE_PATHS);
  const diff = String(process.env.REPAIR_PATCH || '');
  if (!diff.trim() || Buffer.byteLength(diff) > MAX_PATCH_BYTES) fail('Provide a unified patch of at most 45 KB.');
  const changed = patchPaths(diff);
  if (changed.some(file => !paths.includes(file))) fail('Patch touches a path that was not explicitly approved.');
  if (!diff.includes('\n--- a/') || !diff.includes('\n+++ b/')) fail('Patch is missing unified diff file headers.');
  fs.mkdirSync('artifacts/autonomous-repair', { recursive: true });
  fs.writeFileSync('artifacts/autonomous-repair/proposal.patch', diff);
  fs.writeFileSync('artifacts/autonomous-repair/proposal.json', JSON.stringify({
    decision: 'human-authored-patch',
    task,
    eligiblePaths: paths,
    changedFiles: changed,
    applied: false,
    generation: 'No external model or API used; patch supplied for isolated validation.'
  }, null, 2));
  console.log('[REPAIR] human-authored patch staged; no external AI/API used');
}
function validateAndApply() {
  const patchPath = 'artifacts/autonomous-repair/proposal.patch';
  if (!fs.existsSync(patchPath)) fail('No proposal patch exists.');
  const diff = fs.readFileSync(patchPath, 'utf8');
  if (Buffer.byteLength(diff) > MAX_PATCH_BYTES) fail('Patch exceeds size limit.');
  const allowed = safePaths(process.env.REPAIR_SOURCE_PATHS);
  const changed = patchPaths(diff);
  if (!changed.length || changed.some(file => !allowed.includes(file))) fail('Patch touches an unapproved path: ' + changed.join(', '));
  if (/^deleted file mode /m.test(diff) || /^rename (?:from|to) /m.test(diff)) {
    fail('File deletion or rename is forbidden.');
  }
  run('git', ['apply', '--check', patchPath]);
  run('git', ['apply', '--whitespace=error', patchPath]);
  const actual = run('git', ['diff', '--name-only']).trim().split('\n').filter(Boolean);
  if (!actual.length || actual.some(file => !allowed.includes(file))) {
    fail('Applied working tree contains changes outside the allowlist.');
  }
  const stats = run('git', ['diff', '--numstat']).trim().split('\n').filter(Boolean);
  const additions = stats.reduce((n, line) => n + Number(line.split('\t')[0]), 0);
  const deletions = stats.reduce((n, line) => n + Number(line.split('\t')[1]), 0);
  if (additions > 450 || deletions > 450) fail('Patch exceeds 450 added/deleted lines.');
  const report = JSON.parse(fs.readFileSync('artifacts/autonomous-repair/proposal.json', 'utf8'));
  report.applied = true;
  report.changedFiles = actual;
  report.additions = additions;
  report.deletions = deletions;
  report.appliedAt = new Date().toISOString();
  fs.writeFileSync('artifacts/autonomous-repair/proposal.json', JSON.stringify(report, null, 2));
  console.log('[REPAIR] patch applied within allowlist: ' + actual.join(', '));
}
function audit() {
  const changed = run('git', ['diff', '--name-only']).trim().split('\n').filter(Boolean);
  const allowed = safePaths(process.env.REPAIR_SOURCE_PATHS);
  if (!changed.length || changed.some(file => !allowed.includes(file))) fail('Final diff includes unapproved paths.');
  const diff = run('git', ['diff', '--unified=0']);
  const forbidden = [
    /\beval\s*\(/,
    /\bnew\s+Function\s*\(/,
    /https?:\/\//,
    /\bfetch\s*\(/,
    /XMLHttpRequest/,
    /sendBeacon/,
    /localStorage\.clear\s*\(/,
    /indexedDB\.deleteDatabase\s*\(/
  ];
  for (const pattern of forbidden) {
    if (pattern.test(diff)) fail('Patch contains a forbidden high-risk construct: ' + pattern);
  }
  const stats = run('git', ['diff', '--numstat']).trim().split('\n').filter(Boolean);
  const additions = stats.reduce((n, line) => n + Number(line.split('\t')[0]), 0);
  const deletions = stats.reduce((n, line) => n + Number(line.split('\t')[1]), 0);
  if (additions > 450 || deletions > 450) fail('Patch exceeds change budget.');
  const report = JSON.parse(fs.readFileSync('artifacts/autonomous-repair/proposal.json', 'utf8'));
  report.audit = {
    status: 'passed',
    changedFiles: changed,
    additions,
    deletions,
    checkedAt: new Date().toISOString(),
    limitations: 'Static checks do not prove semantic equivalence; human review remains mandatory.'
  };
  fs.writeFileSync('artifacts/autonomous-repair/proposal.json', JSON.stringify(report, null, 2));
  fs.writeFileSync('artifacts/autonomous-repair/repair-report.md', [
    '# Guarded repair validation',
    '',
    '- Decision: ' + report.decision,
    '- Static audit: passed',
    '- Changed files: ' + changed.join(', '),
    '- Diff: +' + additions + ' / -' + deletions,
    '- No external AI/API was used.',
    '- No branch, commit, pull request, merge or deployment is created.'
  ].join('\n') + '\n');
}
const mode = process.argv[2];
try {
  if (mode === 'stage') stage();
  else if (mode === 'apply') validateAndApply();
  else if (mode === 'audit') audit();
  else fail('Usage: autonomous-repair.mjs stage|apply|audit');
} catch (error) {
  console.error('[AUTONOMOUS_REPAIR_BLOCKED] ' + error.message);
  process.exitCode = 1;
}
