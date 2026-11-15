"use strict";
const assert = require("node:assert/strict");
const Core = require("./npc-agent-core.js");
const fs = require("node:fs");
const vm = require("node:vm");
const runtimeSource = fs.readFileSync("scripts/npc-agent-runtime.js", "utf8");

assert.equal(Core.PROTOCOL_VERSION, 1);
assert.equal(Core.ROLES.length, 4);

const civilians = [];
for (let village = 0; village < 8; village++) {
  for (let slot = 0; slot < 2; slot++) {
    const npc = { parts: { name: "Villager_" + village + "_" + slot, civilian: true, role: "civilian" }, recruited: false };
    assert.equal(Core.isEligibleCivilian(npc), true);
    const agent = Core.assignCivilianAgent(npc);
    assert.ok(agent);
    assert.equal(agent.npcId, npc.parts.name);
    civilians.push(agent);
  }
}
assert.deepEqual(new Set(civilians.map(agent => agent.roleId)), new Set(Core.ROLES.map(role => role.id)));
assert.equal(Core.roleForVillager("Villager_2_1").id, "water-coast");
const deterministicSample = {
  parts: { name: "Villager_2_1", civilian: true, role: "civilian" },
  recruited: false
};
const firstAssignment = Core.assignCivilianAgent(deterministicSample);
const reconstructedAssignment = Core.assignCivilianAgent({
  parts: { ...deterministicSample.parts },
  recruited: false
});
assert.deepEqual(reconstructedAssignment, firstAssignment,
  "The same civilian identity must receive the same specialist assignment after reconstruction.");
assert.equal(Core.roleForVillager("VillageGuard0_0"), null);
assert.equal(Core.roleForVillager("Viking"), null);
assert.equal(Core.isEligibleCivilian({ parts: { name: "VillageGuard0_0", civilian: false, role: "warrior" } }), false);
assert.equal(Core.isEligibleCivilian({ parts: { name: "Villager_1_0", civilian: true, role: "civilian" }, recruited: true }), false);
assert.equal(Core.isEligibleCivilian({ parts: { name: "Villager_1_4", civilian: true, role: "civilian" } }), false);

assert.equal(Core.normalizeBridgeEndpoint("http://example.com"), null);
assert.equal(Core.normalizeBridgeEndpoint("https://user:pass@example.com"), null);
assert.equal(Core.normalizeBridgeEndpoint("https://example.com?token=secret"), null);
assert.equal(Core.normalizeBridgeEndpoint("https://agents.example.com/norse/"), "https://agents.example.com/norse");

const validEvent = Core.normalizeEvent({
  id: "evt-1", kind: "diagnosis", source: "npc", roleId: "performance",
  summary: "p99 elevado", confidence: 0.8, evidence: { p99: 21.4 }
});
assert.equal(validEvent.ok, true);
assert.equal(validEvent.event.confidence, 0.8);
assert.equal(Core.normalizeEvent({ id: "evt-2", kind: "execute-code", summary: "ejecutar" }).ok, false);
assert.equal(Core.normalizeEvent({ id: "evt-3", kind: "diagnosis", summary: "x", evidence: { body: "x".repeat(13000) } }).ok, false);

const remote = Core.normalizeRemoteEnvelope({
  protocolVersion: 1,
  cursor: "cursor-2",
  events: [
    { id: "remote-1", kind: "observation", summary: "Hallazgo", roleId: "water-coast", evidence: { source: "test" } },
    { id: "remote-2", kind: "execute-code", summary: "No permitido" },
    { id: "remote-3", kind: "task-result", summary: "Propuesta lista", roleId: "terrain-structures" }
  ]
});
assert.equal(remote.ok, true);
assert.equal(remote.events.length, 2);
assert.ok(remote.events.every(event => event.source === "external-agent"));
assert.equal(remote.cursor, "cursor-2");

const agent = civilians[0];
assert.equal(Core.normalizeTask({ action: "apply-patch", goal: "cambiar código" }, agent).ok, false);
assert.equal(Core.normalizeTask({ action: "investigate", goal: "Analizar tirones", detail: "Sin cambiar el motor" }, agent).ok, true);

const recorderSource = fs.readFileSync("scripts/game-session-recorder.js", "utf8");
const inspectorHtml = fs.readFileSync("inspector/index.html", "utf8");
assert.deepEqual(Core.SPECIALISTS.map(agent => agent.name), ["Eira", "Sól", "Ulf", "Týr"]);
assert.deepEqual(Core.SPECIALISTS.map(agent => agent.roleId), Core.ROLES.map(role => role.id));

const makeReport = sessionId => ({
  sessionId,
  samples: Array.from({ length: 3 }, (_, index) => ({
    capturedAt: new Date(Date.UTC(2026, 10, 14, 10, index)).toISOString(),
    targetFps: 120,
    frameTiming: { p95Ms: 20 }
  }))
});
const singleSessionAnalysis = Core.analyzeSessionReports([makeReport("one")]);
assert.equal(singleSessionAnalysis.independentPerformanceSessions, 1);
assert.equal(singleSessionAnalysis.specialists.find(agent => agent.id === "eira").status, "probable",
  "One session may produce a probable finding but must never confirm a repeated fault.");
const repeatedAnalysis = Core.analyzeSessionReports([makeReport("one"), makeReport("two")]);
assert.equal(repeatedAnalysis.independentPerformanceSessions, 2);
assert.equal(Core.analyzeSessionReports([makeReport("duplicate"), makeReport("duplicate")]).independentPerformanceSessions, 1,
  "Duplicate copies of one session must not count as independent confirmation.");
assert.equal(repeatedAnalysis.specialists.find(agent => agent.id === "eira").status, "confirmado");
const stableReport = sessionId => ({
  sessionId,
  samples: Array.from({ length: 3 }, () => ({ targetFps: 120, frameTiming: { p95Ms: 7 } }))
});
assert.equal(Core.analyzeSessionReports([stableReport("a"), stableReport("b")])
  .specialists.find(agent => agent.id === "eira").status, "sin-incidencia-observada");
assert.equal(Core.analyzeSessionReports([])
  .specialists.find(agent => agent.id === "eira").status, "sin-datos-suficientes");

const integratedReport = {
  sessionId: "session-intelligence-test",
  gameBuild: "0.6.302",
  status: "completed",
  device: { userAgent: "ELSN-Test-Device", devicePixelRatio: 3, hardwareConcurrency: 8, deviceMemoryGB: 8, screen: { width: 412, height: 915 } },
  samples: Array.from({ length: 3 }, (_, index) => ({
    capturedAt: new Date(Date.UTC(2026, 10, 15, 10, index)).toISOString(),
    targetFps: 60,
    frameTiming: { p95Ms: 25 },
    waterDiagnostics: { available: true, measurements: { wetSteps: index + 1, maxShoreStepMeters: 1.4 } },
    subsystems: { activeWorldShadowCasters: 12 }
  })),
  finalWorldInspection: {
    dataQuality: { fullMeshInventory: true },
    meshes: { invalidTransformCount: 0 },
    collisions: { invalidPositionCount: 0 },
    terrainObjects: {
      complete: true, fullyBuriedCount: 1, penetratingCount: 0,
      items: [{
        name: "Roca junto a la casa", status: "fully-buried",
        worldPosition: { x: 12.5, y: -0.4, z: 8.25 },
        nearestIsland: { name: "Isla norte" }
      }]
    },
    structureAudit: { visibleInvalidAfterRepair: 0, untrackedRootCount: 0 },
    textures: { count: 50, pendingCount: 1, unknownReadinessCount: 0 }
  }
};
const intelligence = Core.analyzeSessionIntelligence(integratedReport, [
  {
    id: "agent-observation-current", source: "npc", kind: "observation",
    roleId: "terrain-structures", status: "observed", summary: "La roca queda por debajo de la superficie.",
    evidence: { sessionId: "session-intelligence-test" }, createdAt: new Date().toISOString()
  },
  {
    id: "agent-observation-old", source: "npc", kind: "observation",
    roleId: "terrain-structures", status: "observed", summary: "Hallazgo de otra partida.",
    evidence: { sessionId: "older-session" }, createdAt: new Date().toISOString()
  }
]);
assert.equal(intelligence.specialists.length, 4);
assert.equal(intelligence.specialists.find(agent => agent.id === "eira").status, "probable");

const previousPerformanceReport = JSON.parse(JSON.stringify(integratedReport));
previousPerformanceReport.sessionId = "session-intelligence-test-previous";
const repeatedPerformance = Core.analyzeSessionIntelligence(integratedReport, [], [integratedReport, previousPerformanceReport]);
assert.equal(repeatedPerformance.specialists.find(agent => agent.id === "eira").status, "confirmado",
  "Eira may confirm a recurring performance regression only after at least two independent saved sessions.");
assert.equal(repeatedPerformance.specialists.find(agent => agent.id === "eira").evidence.historicalSessionsAnalyzed, 2);
const differentBuildReport = JSON.parse(JSON.stringify(previousPerformanceReport));
differentBuildReport.sessionId = "session-intelligence-other-build";
differentBuildReport.gameBuild = "0.6.300";
const isolatedBuildPerformance = Core.analyzeSessionIntelligence(integratedReport, [], [integratedReport, differentBuildReport]);
assert.equal(isolatedBuildPerformance.specialists.find(agent => agent.id === "eira").status, "probable",
  "Performance evidence from another game build must not confirm a current-build regression.");
assert.equal(isolatedBuildPerformance.specialists.find(agent => agent.id === "eira").evidence.historicalSessionsAnalyzed, 1);
const differentDeviceReport = JSON.parse(JSON.stringify(previousPerformanceReport));
differentDeviceReport.sessionId = "session-intelligence-other-device";
differentDeviceReport.device.userAgent = "Another-Device";
const isolatedDevicePerformance = Core.analyzeSessionIntelligence(integratedReport, [], [integratedReport, differentDeviceReport]);
assert.equal(isolatedDevicePerformance.specialists.find(agent => agent.id === "eira").status, "probable",
  "Performance readings from a different browser/device must not confirm a recurring issue.");
assert.equal(isolatedDevicePerformance.specialists.find(agent => agent.id === "eira").evidence.historicalSessionsAnalyzed, 1);



assert.equal(intelligence.specialists.find(agent => agent.id === "sol").status, "evidencia-recogida");
const ulfIntelligence = intelligence.specialists.find(agent => agent.id === "ulf");
assert.equal(ulfIntelligence.status, "necesita-revision");
assert.equal(ulfIntelligence.observations.length, 1, "Only specialist observations linked to the current session may appear.");
assert.ok(ulfIntelligence.findings.some(finding => finding.locations?.some(location => location.includes("X 12.50"))),
  "Terrain defects must retain their measured world coordinates.");
assert.equal(intelligence.specialists.find(agent => agent.id === "tyr").status, "necesita-revision");
assert.equal(intelligence.summary.needReview, 3, "Probable performance regressions must appear in the at-a-glance review count.");
assert.equal(intelligence.autonomy.automaticWorldChanges, false);
assert.equal(intelligence.autonomy.automaticCodeChanges, false);

const patrolFixture = {
  schema: 1,
  mode: "test-only-read-only-observer-patrol",
  build: "0.6.299",
  renderer: "Chromium headless + ANGLE SwiftShader",
  verdict: "issues-found",
  startedAt: "2026-11-15T04:07:46.716Z",
  finishedAt: "2026-11-15T04:11:13.325Z",
  run: { id: "43675326364", url: "https://github.com/bonillamarquezpablo-lab/Minimo-android/actions/runs/43675326364", branch: "main", sha: "abc123" },
  world: { expectedIslands: 13, visitedIslands: 13 },
  limitations: ["La patrulla es de prueba y lectura."],
  agents: [{
    name: "Ulf", specialization: "Física y cimentación", severity: "critical",
    summary: "Se detectaron estructuras que necesitan una segunda comprobación.",
    issues: [{
      title: "Estructura insegura visible",
      detail: "IslandGarrisonOutpost_4 continúa visible según la auditoría.",
      severity: "critical", islandIndex: 4
    }, {
      title: "Estructura fuera de tolerancia de 2 cm",
      detail: "Estructura presenta 39.8 cm de diferencia en una medición explícita de apoyo.",
      severity: "critical", islandIndex: 0
    }],
    missing: ["No hay locomoción de NPC para recorrer rutas físicas."],
    readings: {
      structures: [
        { name: "IslandGarrisonOutpost_4", islandIndex: 4, x: 146, z: -132, measurements: { maximumAnchorErrorMeters: 0.0043 } },
        { name: "Estructura", islandIndex: 0, x: 24.69, z: -13.35, gapMeters: 0, measurements: { maximumFootingGapMeters: 0 } },
        { name: "Estructura", islandIndex: 0, x: 13.69, z: -4.35, gapMeters: 0.3982, measurements: { maximumFootingGapMeters: 0.3982 } }
      ]
    }
  }, {
    name: "Eira", specialization: "Costa y pisadas", severity: "unknown",
    summary: "No hay contadores válidos de pisadas.", issues: [], missing: ["Contador de pisadas no disponible."],
    readings: { wetSteps: null }
  }]
};
const patrolAnalysis = Core.analyzeObserverPatrol(patrolFixture, "0.6.302");
assert.equal(patrolAnalysis.runId, "43675326364");
assert.equal(patrolAnalysis.world.coverageComplete, true);
assert.equal(patrolAnalysis.sameBuild, false, "An older patrol must be kept separate from the current game build.");
assert.equal(patrolAnalysis.softwareRenderer, true, "SwiftShader test results must be marked as software-rendered.");
const patrolUlf = patrolAnalysis.agents.find(agent => agent.name === "Ulf");
assert.equal(patrolUlf.issues[0].position.x, 146);
assert.equal(patrolUlf.issues[0].position.z, -132);
assert.equal(patrolUlf.issues[0].position.islandIndex, 4);
assert.equal(patrolUlf.issues[1].position.x, 13.69, "A measured footing gap must be matched to the correct structure on the same island.");
assert.equal(patrolUlf.issues[1].position.z, -4.35);
assert.ok(patrolUlf.issues[1].nextStep.includes("puntos de apoyo"));

assert.ok(patrolAnalysis.cautions.some(item => item.includes("no al build actual")));
assert.ok(patrolAnalysis.cautions.some(item => item.includes("GPU Adreno")));
assert.ok(patrolAnalysis.cautions.some(item => item.includes("no se reasignan automáticamente")),"Patrol assignments must remain distinct from match specialist roles.");
assert.equal(Core.analyzeObserverPatrol(Object.assign({}, patrolFixture, { mode: "gameplay-session" }), "0.6.302"), null,
  "Only the explicitly read-only observer patrol format may enter the patrol report.");
const memoryWithPatrol = Core.analyzeSessionIntelligence(integratedReport, [
  { id: "session-event", source: "npc", kind: "observation", roleId: "terrain-structures",
    summary: "Observación de esta partida.", status: "observed", createdAt: new Date().toISOString(),
    evidence: { sessionId: integratedReport.sessionId } },
  { id: "patrol-event", source: "system", kind: "diagnosis", roleId: "general",
    summary: "Resultado de patrulla independiente.", status: "critical", createdAt: new Date().toISOString(),
    evidence: { source: "observer-patrol", patrolRunId: patrolAnalysis.runId } }
]);
assert.equal(memoryWithPatrol.autonomy.specialistEvents, 1,
  "Independent observer patrol memory must never be counted as a same-session NPC observation.");

const noWorldIntelligence = Core.analyzeSessionIntelligence({
  sessionId: "session-without-world", samples: [], finalWorldInspection: null
}, []);
assert.equal(noWorldIntelligence.specialists.find(agent => agent.id === "ulf").status, "sin-datos-suficientes",
  "Missing world capture must never be reported as a clean inspection.");

assert.ok(runtimeSource.includes("function isInspectorCenterPath()"));
const gameWindow = {
  location: { pathname: "/Minimo-android/guest/" },
  ELSN_NPC_AGENT_CORE: Core,
  indexedDB: { open() { throw new Error("NPC memory must not open from a gameplay page."); } }
};
vm.runInNewContext(runtimeSource, { window: gameWindow });
assert.equal(gameWindow.__ELSN_NPC_AGENT_SYSTEM__, undefined,
  "The specialists must not initialize while the player is on a game route.");

assert.ok(runtimeSource.includes("Core.SPECIALISTS.map"));
assert.doesNotMatch(runtimeSource, /context\.getCivilianRoster|npc\.aiAgent/,
  "Inspector specialists must not be assigned to game civilians.");
assert.ok(recorderSource.includes("elsn-game-session-reports"));
assert.ok(recorderSource.includes("window.top !== window.self"),"Inspector diagnostic iframes must not be misclassified as player sessions.");
assert.ok(recorderSource.includes("MAX_SAMPLES_PER_SESSION = 1440"));
assert.ok(recorderSource.includes("MAX_STORED_SESSIONS = 20"));
assert.ok(recorderSource.includes('classList.contains("game-running")'));
assert.ok(recorderSource.includes("player && player.actor && player.actor.position,\n      player"),"Session reports must capture the actual x/y/z player position exposed by the game health API.");
assert.doesNotMatch(recorderSource, /BABYLON|MeshBuilder|new B\.Mesh/,
  "Session recording must not create game meshes or characters.");
assert.ok(inspectorHtml.includes('id="inteligencia-npc"'));
assert.ok(inspectorHtml.includes('id="npcAgentsSpecialists"'));
assert.ok(inspectorHtml.includes("npc-agents.js?v=3"));
const inspectorAppSource = fs.readFileSync("inspector/npc-agents.js", "utf8");
assert.ok(inspectorAppSource.includes("Guardar informe JSON"));
assert.ok(inspectorAppSource.includes("downloadJson"));
assert.ok(inspectorAppSource.includes("Ver informe técnico y coordenadas"));


console.log("NPC agent core contract: all checks passed.");

assert.match(runtimeSource, /cursorAvailable: Boolean\(state\.bridge\.cursor\)/,
  "The public bridge snapshot may expose cursor presence, not the opaque cursor value.");
assert.doesNotMatch(runtimeSource, /bridge: Object\.assign\(\{\}, state\.bridge/,
  "getSnapshot/exportSnapshot must not serialize the live bridge CSRF token.");
assert.match(runtimeSource, /credentials: "include"/,
  "The external bridge must continue using its authenticated session.");
assert.match(runtimeSource, /"X-CSRF-Token": state\.bridge\.csrfToken/,
  "Task submission must retain explicit CSRF protection.");
