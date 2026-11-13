(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ELSN_NPC_AGENT_CORE = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const PROTOCOL_VERSION = 1;
  const ROLES = Object.freeze([
    Object.freeze({ id: "performance", name: "Rendimiento", domain: "performance", focus: "FPS, tiempos de fotograma, tirones y estabilidad", duties: ["Analizar FPS y frame times", "Detectar picos p95/p99 y tirones", "Relacionar regresiones con evidencias de ejecución"] }),
    Object.freeze({ id: "water-coast", name: "Agua y costa", domain: "water-coast", focus: "Olas, espuma, reflejos, salpicaduras y transición de costa", duties: ["Revisar el comportamiento del agua", "Investigar espuma y encuentros con la orilla", "Comparar capturas equivalentes antes/después"] }),
    Object.freeze({ id: "terrain-structures", name: "Terreno y estructuras", domain: "terrain-structures", focus: "Geometría de islas, terreno, asentamientos y apoyos", duties: ["Revisar altura y continuidad del terreno", "Comprobar apoyos y estructuras flotantes", "Detectar conflictos de geometría y colisiones"] }),
    Object.freeze({ id: "materials-lighting", name: "Materiales e iluminación", domain: "materials-lighting", focus: "Texturas, materiales PBR, iluminación y sombras", duties: ["Revisar texturas y materiales", "Investigar luces y sombras", "Preservar el aspecto visual al proponer optimizaciones"] })
  ]);
  const EVENT_KINDS = new Set(["agent-registered", "observation", "diagnosis", "task-proposal", "task-accepted", "task-result", "decision"]);
  const REMOTE_EVENT_KINDS = new Set(["observation", "diagnosis", "task-proposal", "task-result"]);
  const SOURCES = new Set(["system", "npc", "operator", "external-agent"]);
  const MAX_EVIDENCE_BYTES = 12000;

  function parseVillagerName(value) {
    const match = /^Villager_(\d+)_(\d+)$/.exec(String(value || ""));
    if (!match) return null;
    const villageIndex = Number(match[1]);
    const slot = Number(match[2]);
    if (!Number.isSafeInteger(villageIndex) || !Number.isSafeInteger(slot) || villageIndex < 0 || slot < 0 || slot > 1) return null;
    return { villageIndex, slot, name: "Villager_" + villageIndex + "_" + slot };
  }

  function isEligibleCivilian(npc) {
    if (!npc || npc.recruited === true) return false;
    const parts = npc.parts;
    if (!parts || parts.civilian !== true || parts.role !== "civilian") return false;
    const name = parts.name || npc.name;
    return !!parseVillagerName(name);
  }

  function roleForVillager(name) {
    const parsed = parseVillagerName(name);
    if (!parsed) return null;
    return ROLES[(parsed.villageIndex * 2 + parsed.slot) % ROLES.length];
  }

  function assignCivilianAgent(npc) {
    if (!isEligibleCivilian(npc)) return null;
    const name = npc.parts.name || npc.name;
    const role = roleForVillager(name);
    if (!role) return null;
    return Object.freeze({
      id: "npc-agent:" + name,
      npcId: name,
      roleId: role.id,
      roleName: role.name,
      domain: role.domain,
      focus: role.focus,
      protocolVersion: PROTOCOL_VERSION
    });
  }

  function byteLength(value) {
    if (typeof TextEncoder === "function") return new TextEncoder().encode(value).length;
    return unescape(encodeURIComponent(value)).length;
  }

  function boundedText(value, limit) {
    return String(value == null ? "" : value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, limit);
  }

  function normalizeEvent(input, options) {
    if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "event-not-object" };
    const opts = options || {};
    const kind = boundedText(input.kind, 40);
    if (!EVENT_KINDS.has(kind)) return { ok: false, error: "event-kind-not-allowed" };
    const source = boundedText(opts.forceSource || input.source || "system", 32);
    if (!SOURCES.has(source)) return { ok: false, error: "event-source-not-allowed" };
    const id = boundedText(input.id, 160);
    if (!id) return { ok: false, error: "event-id-required" };
    const summary = boundedText(input.summary, 700);
    if (!summary) return { ok: false, error: "event-summary-required" };
    const roleId = boundedText(input.roleId || "general", 40);
    if (roleId !== "general" && !ROLES.some(role => role.id === roleId)) return { ok: false, error: "event-role-not-allowed" };
    const domain = boundedText(input.domain || roleId, 50);
    const confidenceValue = Number(input.confidence);
    const confidence = Number.isFinite(confidenceValue) ? Math.max(0, Math.min(1, confidenceValue)) : null;
    let evidence = input.evidence == null ? null : input.evidence;
    if (evidence !== null) {
      try {
        const serialized = JSON.stringify(evidence);
        if (typeof serialized !== "string" || byteLength(serialized) > MAX_EVIDENCE_BYTES) return { ok: false, error: "evidence-too-large" };
        evidence = JSON.parse(serialized);
      } catch (_) {
        return { ok: false, error: "evidence-not-json-safe" };
      }
    }
    const createdAt = boundedText(input.createdAt || opts.now || new Date().toISOString(), 40);
    if (!Number.isFinite(Date.parse(createdAt))) return { ok: false, error: "event-date-invalid" };
    return {
      ok: true,
      event: {
        id,
        createdAt,
        source,
        npcId: boundedText(input.npcId, 160) || null,
        roleId,
        domain,
        kind,
        status: boundedText(input.status || "recorded", 40),
        confidence,
        summary,
        evidence
      }
    };
  }

  function normalizeBridgeEndpoint(value) {
    try {
      const url = new URL(String(value || "").trim());
      if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
      return url.href.replace(/\/+$/, "");
    } catch (_) {
      return null;
    }
  }

  function normalizeRemoteEnvelope(payload) {
    if (!payload || typeof payload !== "object" || payload.protocolVersion !== PROTOCOL_VERSION || !Array.isArray(payload.events) || payload.events.length > 100) {
      return { ok: false, error: "remote-envelope-invalid", events: [] };
    }
    const events = [];
    for (const item of payload.events) {
      if (!item || !REMOTE_EVENT_KINDS.has(String(item.kind || ""))) continue;
      const normalized = normalizeEvent(item, { forceSource: "external-agent" });
      if (normalized.ok) events.push(normalized.event);
    }
    const cursor = boundedText(payload.nextCursor || payload.cursor || "", 500);
    return { ok: true, events, cursor };
  }

  function normalizeTask(input, agent) {
    if (!input || typeof input !== "object" || !agent) return { ok: false, error: "task-invalid" };
    const goal = boundedText(input.goal, 600);
    const detail = boundedText(input.detail, 1800);
    const action = boundedText(input.action || "investigate", 40);
    if (!goal || !["investigate", "propose-fix"].includes(action)) return { ok: false, error: "task-action-not-allowed" };
    return {
      ok: true,
      task: {
        id: boundedText(input.id, 160),
        protocolVersion: PROTOCOL_VERSION,
        npcId: agent.npcId,
        roleId: agent.roleId,
        domain: agent.domain,
        action,
        goal,
        detail,
        createdAt: boundedText(input.createdAt || new Date().toISOString(), 40)
      }
    };
  }

  return Object.freeze({
    PROTOCOL_VERSION,
    ROLES,
    EVENT_KINDS: Object.freeze(Array.from(EVENT_KINDS)),
    REMOTE_EVENT_KINDS: Object.freeze(Array.from(REMOTE_EVENT_KINDS)),
    parseVillagerName,
    isEligibleCivilian,
    roleForVillager,
    assignCivilianAgent,
    normalizeEvent,
    normalizeBridgeEndpoint,
    normalizeRemoteEnvelope,
    normalizeTask
  });
});
