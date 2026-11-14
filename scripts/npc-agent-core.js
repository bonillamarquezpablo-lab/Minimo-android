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


  const SPECIALISTS = Object.freeze([
    Object.freeze({ id: "npc-agent:eira", npcId: "Eira", name: "Eira", roleId: "performance", roleName: "Rendimiento", domain: "performance", focus: "FPS, estabilidad y tirones", protocolVersion: PROTOCOL_VERSION }),
    Object.freeze({ id: "npc-agent:sol", npcId: "Sól", name: "Sól", roleId: "water-coast", roleName: "Agua y costa", domain: "water-coast", focus: "Agua, orillas y transiciones costeras", protocolVersion: PROTOCOL_VERSION }),
    Object.freeze({ id: "npc-agent:ulf", npcId: "Ulf", name: "Ulf", roleId: "terrain-structures", roleName: "Terreno y estructuras", domain: "terrain-structures", focus: "Terreno, obstáculos, estructuras y colisiones", protocolVersion: PROTOCOL_VERSION }),
    Object.freeze({ id: "npc-agent:tyr", npcId: "Týr", name: "Týr", roleId: "materials-lighting", roleName: "Materiales e iluminación", domain: "materials-lighting", focus: "Texturas, materiales, iluminación y sombras", protocolVersion: PROTOCOL_VERSION })
  ]);

  function finiteMetric(value) {
    if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function medianMetric(values) {
    const sorted = values.map(finiteMetric).filter(value => value !== null).sort((a, b) => a - b);
    if (!sorted.length) return null;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function analyzeSessionReports(reports) {
    const seenSessionIds = new Set();
    const source = Array.isArray(reports) ? reports.filter(report => {
      if (!report || typeof report !== "object" || !Array.isArray(report.samples)) return false;
      const sessionId = String(report.sessionId || "").trim();
      if (!sessionId || seenSessionIds.has(sessionId)) return false;
      seenSessionIds.add(sessionId);
      return true;
    }) : [];
    const performanceSessions = [];
    const allWindows = [];
    let waterEvidenceSamples = 0;

    for (const report of source) {
      const valid = report.samples.map(sample => {
        const frame = sample && sample.frameTiming && typeof sample.frameTiming === "object" ? sample.frameTiming : {};
        const p95 = finiteMetric(frame.p95Ms);
        const targetFps = finiteMetric(sample && sample.targetFps);
        return p95 !== null && targetFps !== null && targetFps > 0
          ? { p95Ms: p95, targetFps, capturedAt: sample.capturedAt || null }
          : null;
      }).filter(Boolean);
      if (valid.length) allWindows.push(...valid);
      if (valid.length >= 3) {
        const breached = valid.filter(window => window.p95Ms > 1000 / window.targetFps).length;
        performanceSessions.push({
          sessionId: String(report.sessionId || ""),
          validWindows: valid.length,
          breachRate: breached / valid.length,
          medianP95Ms: medianMetric(valid.map(window => window.p95Ms))
        });
      }
      waterEvidenceSamples += report.samples.filter(sample =>
        sample && sample.waterDiagnostics && sample.waterDiagnostics.available === true
      ).length;
    }

    const validWindows = allWindows.length;
    const independentSessions = performanceSessions.length;
    const breachedWindows = allWindows.filter(window => window.p95Ms > 1000 / window.targetFps).length;
    const breachRate = validWindows ? breachedWindows / validWindows : null;
    const medianP95Ms = medianMetric(allWindows.map(window => window.p95Ms));
    let performanceStatus = "sin-datos-suficientes";
    let performanceSummary = "Eira necesita al menos tres intervalos válidos con p95 y objetivo de FPS registrados.";
    let confidence = null;

    if (validWindows >= 3 && independentSessions >= 1) {
      confidence = Math.min(0.99, 0.55 + Math.min(validWindows, 12) * 0.025 + Math.min(independentSessions - 1, 3) * 0.05);
      if (independentSessions >= 2 && validWindows >= 5 && breachRate >= 0.7) {
        performanceStatus = "confirmado";
        performanceSummary = "La pérdida de presupuesto de fotograma se repite en varias sesiones independientes. La causa raíz aún necesita comprobación.";
      } else if (breachRate >= 0.5) {
        performanceStatus = "probable";
        performanceSummary = "Una parte importante de las ventanas registradas supera el objetivo de fotograma. Hace falta correlacionar isla, escena y etapa del motor.";
      } else if (breachRate <= 0.15) {
        performanceStatus = "sin-incidencia-observada";
        performanceSummary = "Las ventanas disponibles no muestran una superación repetida del objetivo. Esto no garantiza que todas las zonas estén libres de tirones.";
      } else {
        performanceStatus = "sin-datos-suficientes";
        performanceSummary = "Las lecturas son variables y todavía no permiten clasificar la estabilidad con seguridad.";
      }
    }

    const specialists = [
      {
        id: "eira", name: "Eira", roleId: "performance", status: performanceStatus,
        summary: performanceSummary,
        evidence: { sessionsWithThreeValidWindows: independentSessions, validWindows, breachedWindows, breachRate: breachRate === null ? null : Number(breachRate.toFixed(3)), medianP95Ms: medianP95Ms === null ? null : Number(medianP95Ms.toFixed(2)), confidence }
      },
      {
        id: "sol", name: "Sól", roleId: "water-coast",
        status: waterEvidenceSamples ? "evidencia-recogida" : "sin-datos-suficientes",
        summary: waterEvidenceSamples
          ? "Hay lecturas del subsistema de agua guardadas. Se muestran como evidencia; todavía no se aplican umbrales automáticos sin una referencia validada."
          : "Todavía no hay lecturas suficientes del subsistema de agua en los informes guardados.",
        evidence: { samplesWithWaterDiagnostics: waterEvidenceSamples }
      },
      {
        id: "ulf", name: "Ulf", roleId: "terrain-structures",
        status: "pendiente-recorrido-fisico",
        summary: "La inspección geométrica está disponible, pero la patrulla física con navegación y colisiones reales aún no está implementada.",
        evidence: { physicalNavigationActive: false }
      },
      {
        id: "tyr", name: "Týr", roleId: "materials-lighting",
        status: "pendiente-capturas-visuales",
        summary: "Los informes de sesión todavía no contienen capturas comparables de materiales e iluminación.",
        evidence: { synchronizedVisualCaptures: 0 }
      }
    ];

    return {
      schemaVersion: 1,
      reportCount: source.length,
      validPerformanceWindows: validWindows,
      independentPerformanceSessions: independentSessions,
      specialists,
      generatedAt: new Date().toISOString()
    };
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
    SPECIALISTS,
    analyzeSessionReports,
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
