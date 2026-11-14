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
assert.ok(recorderSource.includes("MAX_SAMPLES_PER_SESSION = 360"));
assert.ok(recorderSource.includes("MAX_STORED_SESSIONS = 20"));
assert.ok(recorderSource.includes('classList.contains("game-running")'));
assert.ok(recorderSource.includes("player && player.actor && player.actor.position,\n      player"),"Session reports must capture the actual x/y/z player position exposed by the game health API.");
assert.doesNotMatch(recorderSource, /BABYLON|MeshBuilder|new B\.Mesh/,
  "Session recording must not create game meshes or characters.");
assert.ok(inspectorHtml.includes('id="inteligencia-npc"'));
assert.ok(inspectorHtml.includes('id="npcAgentsSpecialists"'));
assert.ok(inspectorHtml.includes("npc-agents.js?v=1"));

console.log("NPC agent core contract: all checks passed.");

assert.match(runtimeSource, /cursorAvailable: Boolean\(state\.bridge\.cursor\)/,
  "The public bridge snapshot may expose cursor presence, not the opaque cursor value.");
assert.doesNotMatch(runtimeSource, /bridge: Object\.assign\(\{\}, state\.bridge/,
  "getSnapshot/exportSnapshot must not serialize the live bridge CSRF token.");
assert.match(runtimeSource, /credentials: "include"/,
  "The external bridge must continue using its authenticated session.");
assert.match(runtimeSource, /"X-CSRF-Token": state\.bridge\.csrfToken/,
  "Task submission must retain explicit CSRF protection.");
