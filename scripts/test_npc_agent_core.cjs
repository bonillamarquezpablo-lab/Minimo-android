"use strict";
const assert = require("node:assert/strict");
const Core = require("./npc-agent-core.js");

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
assert.equal(Core.roleForVillager("Villager_2_1").id, Core.roleForVillager("Villager_2_1").id, "The same villager must keep the same specialist role across reads.");
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

console.log("NPC agent core contract: all checks passed.");
