'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');

const workflow = fs.readFileSync('.github/workflows/game-runtime-acceptance.yml', 'utf8');
const smoke = fs.readFileSync('scripts/player-startup-smoke.mjs', 'utf8');
const dialogueRuntime = fs.readFileSync('scripts/npc-dialogue-runtime.js', 'utf8');
const startupReadiness = fs.readFileSync('scripts/startup-readiness-core.cjs', 'utf8');
const release = fs.readFileSync('.github/workflows/deploy-pages.yml', 'utf8');
const httpsServer = fs.readFileSync('scripts/start_https_static_server.py', 'utf8');

assert.match(release, /Test runtime and offline Service Worker publication gate/);
assert.match(release, /node scripts\/test_game_runtime_acceptance_contract\.cjs/);
assert.match(release, /Validate the local HTTPS acceptance server/);
assert.match(release, /py_compile scripts\/start_https_static_server\.py/);
assert.match(release, /Prepare shared Playwright and Chromium cache for parallel browser gates/);
assert.match(release, /Install the exact cached Playwright version/);
assert.match(release, /el-sin-nombre-playwright-.*needs\.build\.outputs\.playwright-version/);
assert.match(release, /Start the built release on local HTTPS for Service Worker acceptance/);
assert.match(release, /Verify startup, required NPCs, gameplay and offline Service Worker restart before publish/);
assert.match(release, /node scripts\/player-startup-smoke\.mjs/);
assert.ok(smoke.includes("/^Fly(?:[_-].+)?$/i.test(bird.flightName||'')"),
  'The startup smoke must accept native Fly clip names, including namespaced Fly_Gull_* variants.');
assert.ok(release.includes("scripts/(build_site\\.py|validate_release\\.py|player-startup-smoke\\.mjs|nordic/)"),
  'A startup smoke change must trigger the published-site build.');
assert.ok(release.includes("scripts/(build_site\\.py|player-startup-smoke\\.mjs|fauna-visual-capture\\.mjs|test_fauna_visual_capture_contract\\.cjs|test_wildlife_runtime_contract\\.cjs|test_forest_gull_assets\\.cjs|create_fauna_contact_sheet\\.py)"),
  'A startup smoke change must run fauna acceptance together with the gameplay smoke.');
assert.match(release, /Verify mobile fauna rigs on CPU skinning, animations, textures and four-view visuals before publish/);
assert.match(release, /FAUNA_TEST_URL: https:\/\/localhost:4175\//);
assert.match(release, /FAUNA_SKINNING_MODE: cpu/, 'Required mobile fauna acceptance must use the stable CPU skinning path.');
assert.match(release, /Diagnostic A\/B capture with GPU skinning fallback/, 'GPU skinning remains a separate non-blocking comparison.');
assert.match(release, /node scripts\/fauna-visual-capture\.mjs/);
assert.match(release, /Preserve fauna visual acceptance evidence/);
assert.match(release, /artifacts\/fauna-visual-captures\//);
assert.match(release, /  changes:\n[\s\S]*?outputs:\n[\s\S]*?site: \$\{\{ steps\.scope\.outputs\.site \}\}[\s\S]*?game: \$\{\{ steps\.scope\.outputs\.game \}\}[\s\S]*?fauna: \$\{\{ steps\.scope\.outputs\.fauna \}\}/, 'The pipeline must classify site, game and fauna changes.');
assert.match(release, /A production push that changes this workflow must exercise the complete release pipeline[\s\S]*?EVENT_NAME.*?push[\s\S]*?grep -Fxq '\.github\/workflows\/deploy-pages\.yml'[\s\S]*?site=true[\s\S]*?game=true[\s\S]*?fauna=true/, 'Changing the production release workflow must force the full validation gates after merge.');
assert.match(release, /  build:\n[\s\S]*?if: needs\.changes\.outputs\.site == 'true'[\s\S]*?needs: \[changes\]/, 'The complete build is required only when published site files change.');
assert.match(release, /Resolve the exact Playwright version for browser-cache compatibility\n        if: needs\.changes\.outputs\.game == 'true' \|\| needs\.changes\.outputs\.fauna == 'true'/, 'Browser dependencies must not be installed for documentation or Inspector-only updates.');
assert.match(release, /  startup:\n[\s\S]*?if: needs\.changes\.outputs\.game == 'true'[\s\S]*?needs: \[build, changes\]/, 'The gameplay/offline smoke must run whenever game runtime files change.');
assert.match(release, /  fauna:\n[\s\S]*?if: needs\.changes\.outputs\.fauna == 'true'[\s\S]*?needs: \[build, changes\]/, 'The full CPU fauna visual acceptance must run whenever fauna or packaged assets change.');
assert.match(release, /  fauna-gpu-diagnostic:\n[\s\S]*?continue-on-error: true/, 'The GPU comparison remains available but non-blocking.');

assert.match(release, /PLAYER_TEST_URL: https:\/\/localhost:4175\//);
assert.match(release, /openssl req -x509/);
assert.match(release, /needs: \[build, contracts, startup, fauna, changes\]/, 'Pages must wait for the build, source contracts, scope detection and applicable acceptance gates.');
assert.match(release, /needs\.startup\.result == 'success' \|\| needs\.startup\.result == 'skipped'/, 'A skipped startup gate is accepted only when no game runtime files changed.');
assert.match(release, /needs\.fauna\.result == 'success' \|\| needs\.fauna\.result == 'skipped'/, 'A skipped fauna gate is accepted only when no fauna or packaged asset files changed.');
assert.match(release, /github\.event_name != 'pull_request' &&\s+github\.ref == 'refs\/heads\/main' &&\s+needs\.changes\.outputs\.site == 'true'/, 'Production Pages can deploy only from main when published site files changed.');
assert.match(release, /  deploy:[\s\S]*?needs: \[build, contracts, startup, fauna, changes\]/, 'Public Pages deployment must be gated by the build, all source contracts, scope detection and every applicable acceptance job.');
assert.match(release, /Preserve runtime acceptance evidence/);
assert.doesNotMatch(release, /force: true|git push origin main/i);

assert.doesNotMatch(workflow, /^  pull_request:/m, 'The standalone duplicate build must not run automatically; deploy-pages owns required PR runtime acceptance.');
assert.match(workflow, /^  workflow_dispatch:/m, 'Keep independent runtime acceptance available for manual regression investigations.');
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
  "npcDialogueSmoke",
  "window.__ELSN_GAME_DIALOGUE_BRIDGE__",
  "window.__ELSN_NPC_DIALOGUES__",
  "bubblesStarted",
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
assert.ok(dialogueRuntime.includes('projectionAttempts') &&
  smoke.includes('getSnapshot()') &&
  smoke.includes('visualEvidence.state') &&
  smoke.includes('captureVisualProof(true)') &&
  smoke.includes('proof?.texture?.vScale === 1') &&
  smoke.includes('proof?.texture?.vOffset === 0') &&
  smoke.includes('proof?.uploadInvertY === true') &&
  smoke.includes('renderedBubbleVerified: false'),
  'The runtime must expose positioning attempts and the browser smoke must persist its complete snapshot with the NPC texture proof.');
assert.match(smoke, /campaignButton\.evaluate\(button => button\.click\(\)\)/,
  'Campaign entry must not hang on Playwright bounding-box stability while the intro is continuously animated.');
assert.doesNotMatch(smoke, /campaignButton\.click\(\{\s*force:\s*true/,
  'Do not rely on Playwright force-click stability semantics for the animated campaign card.');
assert.match(smoke, /STARTUP_RESTART_TIMEOUT_MS = 240000/);
assert.match(smoke, /function waitForWorldReadyWithRecovery/);
assert.match(smoke, /cachedStartupWaitRecoveredAfterRendererStall/);
assert.match(smoke, /offlineReload\.startupWaitRecoveredAfterRendererStall/);
assert.match(smoke, /cachedStartupWaitDiagnostic/);
assert.match(smoke, /offlineReload\.startupWaitDiagnostic/);
assert.match(startupReadiness, /recorder\.playerModelReady === true/);
assert.match(startupReadiness, /player\.fallbackVisible === false/);
assert.match(startupReadiness, /resourceGate\.ready === true/);
assert.match(smoke, /automatedVisualAcceptance: false/,
  'Visible NPC dialogue acceptance must remain with the player.'); 
assert.doesNotMatch(smoke, /npcDialogueApproach|npcDialogueVisibilityWait|__ELSN_NPC_DIALOGUE_SMOKE_RESTORE__/,
  'Startup CI must not teleport the player or approve NPC dialogue visibility.');
console.log('Game runtime and offline Service Worker acceptance contract: PASS');
