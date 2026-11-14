import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('scripts/autonomous-repair.mjs', 'utf8');
assert.match(source, /MAX_FILES = 8/);
assert.match(source, /MAX_PATCH_BYTES = 45000/);
assert.match(source, /REPAIR_SOURCE_PATHS/);
assert.match(source, /REPAIR_PATCH/);
assert.match(source, /function patchPaths\(diff\)/);
assert.match(source, /git', \['apply', '--check'/);
assert.match(source, /git', \['apply', '--whitespace=error'/);
const phase2Doc = fs.readFileSync('AUTONOMOUS-REPAIR-PHASE2.md', 'utf8');
assert.match(phase2Doc, /calidad gráfica/i);
assert.match(source, /No external model or API used/);
assert.ok(!source.includes('LAB_AI_API_KEY'));
assert.ok(!source.includes('LAB_AI_MODEL'));
assert.ok(!source.includes('api.openai.com'));
assert.ok(!source.includes('fetch('));
assert.ok(!source.includes('fetch('));
assert.ok(!source.includes('fetch('));

const workflow = fs.readFileSync('.github/workflows/autonomous-repair.yml', 'utf8');
assert.match(workflow, /workflow_dispatch:/);
assert.match(workflow, /base_ref:/);
assert.match(workflow, /default: main/);
assert.match(workflow, /case "\$BASE_REF" in main/);
assert.match(workflow, /contents: read/);
assert.doesNotMatch(workflow, /pull-requests: write|contents: write/);
assert.doesNotMatch(workflow, /gh pr create|git push|git switch -c|create_branch/i);
assert.match(workflow, /node scripts\/autonomous-repair\.mjs stage/);
assert.match(workflow, /node scripts\/autonomous-repair\.mjs apply/);
assert.match(workflow, /node scripts\/autonomous-repair\.mjs audit/);
assert.match(workflow, /node scripts\/player-startup-smoke\.mjs/);
assert.match(workflow, /python scripts\/build_site\.py/);

console.log('Guarded repair contracts passed; branch-free and read-only publication boundary verified.');
