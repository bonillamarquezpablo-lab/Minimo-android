'use strict';
const assert=require('node:assert/strict');const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');const smoke=fs.readFileSync('scripts/texture-readiness-smoke.mjs','utf8');const workflow=fs.readFileSync('.github/workflows/coastal-reference.yml','utf8');
assert.match(html,/captureDynamicTextureUpdates/);assert.match(html,/getTextureReadinessForCamera/);assert.match(html,/B\.Frustum\?\.GetPlanes/);assert.match(html,/cameraPendingTextures/);
const prep=html.match(/async function prepareCaptureFrameForCamera[\s\S]*?\n  }\n  window\.__ELSN_TEST__/);assert.ok(prep);assert.doesNotMatch(prep[0],/scene\.whenReadyAsync\(\)/);assert.match(prep[0],/requestAnimationFrame/);assert.match(prep[0],/verdict:/);
assert.match(smoke,/prepareCaptureFrame\(\{timeoutMs\}\)/);assert.match(smoke,/captureCanvas/);assert.match(smoke,/textureDiagnostics/);assert.match(smoke,/writeManifest\(\)/);assert.match(smoke,/relatedNetworkEvents/);assert.match(smoke,/process\.exitCode=2/);
assert.match(workflow,/texture-smoke:/);assert.match(workflow,/texture-readiness-smoke\.mjs/);assert.match(workflow,/texture-readiness-smoke-/);assert.match(workflow,/if: false # Phase 1/);
console.log('TEXTURE READINESS SMOKE CONTRACT OK');
