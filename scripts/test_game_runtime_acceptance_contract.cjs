'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');

const workflow = fs.readFileSync('.github/workflows/game-runtime-acceptance.yml', 'utf8');
const smoke = fs.readFileSync('scripts/player-startup-smoke.mjs', 'utf8');
const release = fs.readFileSync('.github/workflows/deploy-pages.yml', 'utf8');
const httpsServer = fs.readFileSync('scripts/start_https_static_server.py', 'utf8');

assert.match(release, /Test runtime and offline Service Worker publication gate/);
assert.match(release, /node scripts\/test_game_runtime_acceptance_contract\.cjs/);
assert.match(release, /Validate the local HTTPS acceptance server/);
assert.match(release, /py_compile scripts\/start_https_static_server\.py/);
assert.match(release, /Install Playwright and Chromium for real startup acceptance/);
assert.match(release, /Start the built release on local HTTPS for Service Worker acceptance/);
assert.match(release, /Verify startup, required NPCs, gameplay and offline Service Worker restart before publish/);
assert.match(release, /node scripts\/player-startup-smoke\.mjs/);
assert.match(release, /PLAYER_TEST_URL: https:\/\/localhost:4175\//);
assert.match(release, /openssl req -x509/);
assert.match(release, /needs: \[build\]/);
assert.match(release, /if: github\.event_name != 'pull_request' && github\.ref == 'refs\/heads\/main'/);
assert.ok(release.indexOf('Verify startup, required NPCs, gameplay and offline Service Worker restart before publish') <
  release.indexOf('Upload validated site for PR inspection'),
  'The acceptance gate must complete before publishing artifacts or Pages.');
assert.match(release, /Preserve runtime acceptance evidence/);
assert.doesNotMatch(release, /force: true|git push origin main/i);

assert.match(workflow, /^  pull_request:/m, 'The acceptance workflow must run on integration PRs.');
assert.match(workflow, /branches: \[main\]/, 'The acceptance workflow must target main.');
assert.match(workflow, /^  workflow_dispatch:/m, 'A manual acceptance run must remain available.');
assert.doesNotMatch(workflow, /^  push:/m, 'Avoid duplicate automatic runs on branch pushes.');
assert.doesNotMatch(workflow, /phase2\/autonomous-repair-safety|test_autonomous_lab_agents|test_ai_visual_review|test_autonomous_repair/,
  'The acceptance workflow cannot depend on unmerged autonomous-lab files.');
assert.match(workflow, /python scripts\/build_site\.py/);
assert.match(workflow, /npm install --no-save --no-package-lock playwright/);
assert.match(workflow, /playwright install --with-deps chromium/);
assert.match(workflow, /scripts\/start_https_static_server\.py/);
assert.match(workflow, /PLAYER_TEST_URL: https:\/\/localhost:4175\//);
assert.match(workflow, /node scripts\/player-startup-smoke\.mjs/);
assert.match(workflow, /actions\/upload-artifact@v4/);
assert.doesNotMatch(workflow, /deploy-pages|gh pr merge|merge_pull_request/i);

assert.match(httpsServer, /ThreadingHTTPServer/);
assert.match(httpsServer, /ssl\.SSLContext\(ssl\.PROTOCOL_TLS_SERVER\)/);
assert.match(httpsServer, /load_cert_chain/);

for (const marker of [
  "#newGameChoice",
  "worldReady === true",
  "npcRoster.ready === true",
  "performanceFirst20s",
  "postEntryAudit.calls.length",
  "postEntryAudit.network.length",
  "postEntryAudit.resources.length",
  "worldUpdateWaitDiagnostic",
  "identityPreferencePersisted",
  "cachedIdentityPreferencePersisted",
  "navigator.serviceWorker.controller",
  "serviceWorkerBeforeOfflineReload",
  "serviceWorkerAfterOfflineReload",
  "el-sin-nombre-shell-",
  "el-sin-nombre-assets-",
  "context.setOffline(true)",
  "manifest.offlineReload.worldReady = true",
  "modelReady",
  "fallbackVisible"
]) {
  assert.ok(smoke.includes(marker), 'Runtime smoke is missing acceptance check: ' + marker);
}
console.log('Game runtime and offline Service Worker acceptance contract: PASS');
