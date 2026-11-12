const fs=require('node:fs');
const assert=require('node:assert/strict');

const workflow=fs.readFileSync('.github/workflows/coastal-reference.yml','utf8');
const pages=fs.readFileSync('.github/workflows/deploy-pages.yml','utf8');
const readme=fs.readFileSync('README.md','utf8');

assert.match(pages,/- name: Include the independent Inspector Center in the published site\n\s+run: \|\n\s+mkdir -p dist\/inspector\n\s+cp -R inspector\/\. dist\/inspector\//,
  'Pages workflow must contain a real multiline run step for the Inspector Center.');
assert.doesNotMatch(pages,/\\\\n\\s+run:/,
  'Pages workflow must not contain literal backslash-n sequences in place of YAML newlines.');
assert.match(readme,/^## Inspector independiente\n\n/m,
  'README Inspector Center heading must be a real Markdown heading.');

assert.match(workflow,/paths-ignore:/,
  'Tooling-only pull requests should not launch the expensive visual game inspection.');
for(const path of ["'.github/workflows/**'","'inspector/**'","'scripts/run-unified-inspector.mjs'","'scripts/test_hrafn_before_after_contract.cjs'"])
  assert.ok(workflow.includes(path),'Missing tooling-only path exclusion: '+path);

assert.match(workflow,/group: scene-capture-\$\{\{ github\.event\.pull_request\.number \|\| github\.ref \}\}/,
  'Concurrency should be grouped by PR/ref, not by commit SHA.');
assert.doesNotMatch(workflow,/group: scene-capture-.*github\.sha/,
  'A SHA suffix creates a separate concurrency group for every commit and allows duplicate long inspections.');
assert.match(workflow,/INSPECTOR_LEVEL: \$\{\{ inputs\.inspection_level \|\| \(github\.event_name == 'push' && 'deep' \|\| 'complete'\) \}\}/,
  'Automatic PR runs should default to complete, reserving deep comparison for explicit dispatch or main pushes.');
assert.match(workflow,/github\.event_name == 'push' \|\| \(github\.event_name == 'workflow_dispatch' && inputs\.inspection_level == 'deep'\)/,
  'The baseline build should only run for pushes and explicitly deep manual runs.');
assert.match(workflow,/INSPECTOR_GITHUB_TOKEN: \$\{\{ github\.event_name != 'pull_request' && github\.token \|\| '' \}\}/,
  'Progress publishing must not expose a write token to pull-request code.');

console.log('Inspector workflow routing contract: OK');
