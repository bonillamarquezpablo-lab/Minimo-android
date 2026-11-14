import assert from 'node:assert/strict';
import fs from 'node:fs';

const patrol = fs.readFileSync('scripts/explorer-patrol.mjs', 'utf8');
const workflow = fs.readFileSync('.github/workflows/explorer-patrol.yml', 'utf8');
const publisher = fs.readFileSync('scripts/publish-explorer-patrol.mjs', 'utf8');
const dashboard = fs.readFileSync('inspector/explorer-patrol.js', 'utf8');
const inspectorHtml = fs.readFileSync('inspector/index.html', 'utf8');
const gameHtml = fs.readFileSync('index.html', 'utf8');
const startupGuard = fs.readFileSync('scripts/test_startup_guard.cjs', 'utf8');

assert.match(patrol, /\?test=1/);
assert.match(patrol, /window\.__ELSN_TEST__/);
assert.match(patrol, /api\.setCamera\(camera\)/);
assert.ok(patrol.includes("page.locator('#intro.open').waitFor("));
assert.match(patrol, /await newGame\.waitFor\(\{ state: 'visible'/);
assert.match(patrol, /sceneViewSnapshot/);
assert.match(patrol, /expectedIslands: 13/);
assert.match(patrol, /wetSteps/);
assert.match(patrol, /activeSplashParticles/);
assert.match(patrol, /maxShoreStepMeters/);
assert.match(patrol, /grassInstances/);
assert.match(patrol, /drawCalls/);
assert.match(patrol, /worldUpdateMs/);
assert.match(patrol, /renderCpuMs/);
assert.match(patrol, /Math\.abs\(maxShoreStep\) > 0\.05/);
assert.match(patrol, /if \(gap > 0\.02\)/, 'Only typed support measurements may trigger the 2 cm grounding threshold.');
assert.match(patrol, /const structureSources = \[/, 'Grounding measurements must be selected by their owning audit family.');
assert.match(patrol, /maximumFootingGapMeters/);
assert.match(patrol, /maximumSupportPointGapMeters/);
assert.match(patrol, /supportPoints\.map\(\(point, index\)/);
assert.doesNotMatch(patrol, /findMetric\(row, \['maximumBaseGapMeters'/, 'An arbitrary nested gapMeters value must never be promoted to a structural failure.');
assert.match(patrol, /El p95 de .*SwiftShader/);
assert.doesNotMatch(patrol, /p95 !== null && p95 > \(1000 \/ 60\)/, 'SwiftShader timing must not be reported as physical mobile GPU performance.');

assert.match(patrol, /movementSupported/);
assert.match(patrol, /const movementSupported = \['walkRoute','moveNpcAlongPath','moveAgentTo','navigateNpc'\]/);
assert.match(patrol, /global\.movementSupported === true/);
assert.doesNotMatch(patrol, /typeof window\.__ELSN_TEST__\?\.\[name\]/);
assert.match(patrol, /camera-observation/);
assert.match(patrol, /grassByIsland/);
assert.match(patrol, /No se observaron pisadas húmedas/);
assert.match(patrol, /no se ha simulado locomoción/);
assert.match(patrol, /document\.body\.classList\.contains\('boot-failed'\)/);
assert.match(patrol, /audioNetwork/);
assert.match(patrol, /requestfailed/);
assert.match(patrol, /report\.startup/);
assert.match(gameHtml, /NorseAudio\.preloadAll\(new URLSearchParams\(window\.location\.search\)\.get\('test'\)==='1'\?30000:6500\)/);
assert.match(gameHtml, /Math\.min\(30000,Number\(maxWaitMs\)\|\|6000\)/);
assert.match(startupGuard, /NorseAudio\\.preloadAll/);
assert.match(startupGuard, /6500 ms argument/);
assert.match(gameHtml, /perfAuditFrameCounter%15!==0/);
assert.doesNotMatch(gameHtml, /perfGpuFrameCounter/);
assert.doesNotMatch(patrol, /api\.openai\.com|LAB_AI_API_KEY|LAB_AI_MODEL|gemini|vision model/i);
assert.doesNotMatch(patrol, /window\.BABYLON.*new BABYLON|scene\.createPickingRay/);

assert.match(workflow, /schedule:/);
assert.match(workflow, /0 \*\/6 \* \* \*/);
assert.match(workflow, /workflow_dispatch:/);
assert.match(workflow, /PATROL_TEST_URL: http:\/\/127\.0\.0\.1:4175\//);
assert.match(workflow, /node scripts\/explorer-patrol\.mjs/);
assert.match(workflow, /node scripts\/publish-explorer-patrol\.mjs/);
assert.match(workflow, /actions\/upload-artifact@v4/);

assert.match(publisher, /inspector\/data\/explorer-patrol\/latest\.json/);
assert.match(publisher, /inspector\/data\/explorer-patrol\/runs\//);
assert.match(publisher, /inspector-status/);

assert.match(inspectorHtml, /id="patrulla-exploradores"/);
assert.match(inspectorHtml, /id="patrolAgents"/);
assert.match(inspectorHtml, /explorer-patrol\.js/);
assert.match(dashboard, /REPORT_URL/);
assert.match(dashboard, /data-copy/);
assert.match(dashboard, /Copiar fallo/);
assert.match(dashboard, /navigator\.clipboard\.writeText/);

console.log('Level 1 explorer patrol contracts passed.');
