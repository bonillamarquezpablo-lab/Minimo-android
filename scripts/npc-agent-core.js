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

  function analyzeSessionIntelligence(report, events) {
    const sessionId = boundedText(report && report.sessionId, 160);
    const samples = Array.isArray(report && report.samples) ? report.samples : [];
    const world = report && report.finalWorldInspection && typeof report.finalWorldInspection === "object"
      ? report.finalWorldInspection : null;
    const sessionEvents = (Array.isArray(events) ? events : []).filter(event => {
      const evidence = event && event.evidence;
      return event && ["observation", "diagnosis", "task-result"].includes(event.kind) &&
        event.source !== "system" && evidence && String(evidence.sessionId || "") === sessionId &&
        sessionId && ["npc", "external-agent", "operator"].includes(event.source);
    });
    const roles = [
      { id: "performance", npcId: "Eira", name: "Eira" },
      { id: "water-coast", npcId: "Sól", name: "Sól" },
      { id: "terrain-structures", npcId: "Ulf", name: "Ulf" },
      { id: "materials-lighting", npcId: "Týr", name: "Týr" }
    ];
    const byRole = roleId => sessionEvents.filter(event => event.roleId === roleId);
    const findings = (title, summary, severity, extra) => Object.assign({
      title: boundedText(title, 120),
      summary: boundedText(summary, 500),
      severity: severity || "info"
    }, extra || {});
    const specialists = [];

    const performance = analyzeSessionReports([report]).specialists.find(item => item.id === "eira");
    specialists.push({
      id: "eira", name: "Eira", roleId: "performance",
      status: performance ? performance.status : "sin-datos-suficientes",
      summary: performance ? performance.summary : "No hay mediciones suficientes para revisar la fluidez.",
      confidence: performance && performance.evidence ? performance.evidence.confidence : null,
      findings: performance ? [findings("Fluidez de la partida", performance.summary,
        performance.status === "confirmado" ? "critical" : performance.status === "probable" ? "warning" : "info")] : [],
      observations: byRole("performance").slice(0, 8).map(event => ({
        source: event.source, summary: boundedText(event.summary, 500),
        status: event.status, confidence: finiteMetric(event.confidence), createdAt: event.createdAt,
        evidence: event.evidence || null
      })),
      evidence: performance ? performance.evidence : {}
    });

    const waterSamples = samples.map(sample => sample && sample.waterDiagnostics)
      .filter(item => item && item.available === true);
    const waterMeasures = {};
    for (const key of ["wetSteps", "waterParticlesEmitted", "activeSplashParticles", "aliveSplashParticles", "maxShoreStepMeters", "maximumShoreStepMeters"]) {
      const values = waterSamples.map(item => finiteMetric(item.measurements && item.measurements[key])).filter(value => value !== null);
      if (values.length) waterMeasures[key] = { latest: values[values.length - 1], maximum: Math.max(...values), readings: values.length };
    }
    const waterStatus = waterSamples.length ? "evidencia-recogida" : "sin-datos-suficientes";
    specialists.push({
      id: "sol", name: "Sól", roleId: "water-coast",
      status: waterStatus,
      summary: waterSamples.length
        ? "Sól ha reunido " + waterSamples.length + " lecturas del agua y la costa. Son mediciones reales, pero todavía no bastan para declarar que la espuma o las orillas estén bien o mal."
        : "En esta partida no se guardaron lecturas directas del sistema de agua y costa.",
      confidence: null,
      findings: waterSamples.length
        ? [findings("Mediciones de agua y costa", "Se han guardado " + waterSamples.length + " lecturas. Las variaciones quedan disponibles para compararlas con otra partida equivalente.", "info")]
        : [],
      observations: byRole("water-coast").slice(0, 8).map(event => ({
        source: event.source, summary: boundedText(event.summary, 500),
        status: event.status, confidence: finiteMetric(event.confidence), createdAt: event.createdAt,
        evidence: event.evidence || null
      })),
      evidence: { samples: waterSamples.length, measurements: waterMeasures }
    });

    const terrain = world && world.terrainObjects || {};
    const meshes = world && world.meshes || {};
    const collisions = world && world.collisions || {};
    const structures = world && world.structureAudit || {};
    const buried = finiteMetric(terrain.fullyBuriedCount) || 0;
    const penetrating = finiteMetric(terrain.penetratingCount) || 0;
    const invalidTransforms = finiteMetric(meshes.invalidTransformCount) || 0;
    const invalidColliders = finiteMetric(collisions.invalidPositionCount) || 0;
    const unsafeStructures = finiteMetric(structures.visibleInvalidAfterRepair) ?? finiteMetric(structures.unsafeVisibleBeforeRepair) ?? 0;
    const untrackedRoots = finiteMetric(structures.untrackedRootCount) || 0;
    const physicalFindings = [];
    const terrainItems = Array.isArray(terrain.items) ? terrain.items : [];
    const positionText = position => {
      if (!position || typeof position !== "object") return "";
      const parts = ["x", "y", "z"].filter(key => finiteMetric(position[key]) !== null)
        .map(key => key.toUpperCase() + " " + Number(position[key]).toFixed(2));
      return parts.length ? parts.join(" · ") : "";
    };
    if (buried + penetrating > 0) {
      const details = terrainItems.filter(item => item && ["fully-buried", "penetrates-terrain"].includes(item.status)).slice(0, 8)
        .map(item => {
          const location = positionText(item.worldPosition);
          const island = item.nearestIsland && item.nearestIsland.name ? " · " + boundedText(item.nearestIsland.name, 80) : "";
          return boundedText(item.name || item.id || "Objeto sin nombre", 100) +
            (item.status === "fully-buried" ? " (enterrado)" : " (atraviesa el terreno)") +
            (location ? " · " + location : "") + island;
        });
      physicalFindings.push(findings("Objetos dentro del terreno",
        buried + " objetos aparecen enterrados y " + penetrating + " atraviesan el terreno." +
        (details.length ? " Ejemplos: " + details.join("; ") : ""), "critical",
        { locations: details }));
    }
    if (invalidTransforms > 0) physicalFindings.push(findings("Objetos con posiciones o giros incorrectos",
      "La inspección ha encontrado " + invalidTransforms + " transformaciones que necesitan revisión.", "warning"));
    if (invalidColliders > 0) physicalFindings.push(findings("Colisiones con datos inválidos",
      "Hay " + invalidColliders + " colisionadores cuya posición no se ha podido validar.", "warning"));
    if (unsafeStructures > 0) physicalFindings.push(findings("Estructuras que aún necesitan revisión",
      "La última auditoría registra " + unsafeStructures + " estructuras visibles con problemas después de la comprobación.", "critical"));
    if (untrackedRoots > 0) physicalFindings.push(findings("Estructuras fuera del registro",
      "Se han encontrado " + untrackedRoots + " estructuras que no figuran en el registro habitual.", "warning"));
    const worldComplete = !!world && !world.error &&
      terrain.complete === true && (!world.dataQuality || world.dataQuality.fullMeshInventory !== false);
    const worldStatus = physicalFindings.length ? "necesita-revision" :
      worldComplete ? "sin-incidencia-observada" : "sin-datos-suficientes";
    specialists.push({
      id: "ulf", name: "Ulf", roleId: "terrain-structures",
      status: worldStatus,
      summary: !world || world.error
        ? "No hay una inspección final válida del terreno y las estructuras en esta partida."
        : physicalFindings.length
          ? "Ulf ha encontrado elementos concretos que necesitan revisión. Se conservan sus nombres y coordenadas cuando están disponibles."
          : worldComplete
            ? "La inspección completa no ha detectado los problemas incluidos en esta comprobación. Esto no descarta defectos que el análisis no mida."
            : "La inspección no muestra incidencias en los datos disponibles, pero está incompleta y no permite dar el mundo por revisado.",
      confidence: worldComplete ? 0.85 : null,
      findings: physicalFindings,
      observations: byRole("terrain-structures").slice(0, 8).map(event => ({
        source: event.source, summary: boundedText(event.summary, 500),
        status: event.status, confidence: finiteMetric(event.confidence), createdAt: event.createdAt,
        evidence: event.evidence || null
      })),
      evidence: {
        worldCaptured: !!world && !world.error,
        terrainComplete: terrain.complete === true,
        fullyBuried: buried, penetrating, invalidTransforms, invalidColliders,
        unsafeStructures, untrackedRoots,
        sampleLocations: terrainItems.slice(0, 8).map(item => ({
          name: boundedText(item && (item.name || item.id), 100),
          status: item && item.status || null,
          position: item && item.worldPosition || null,
          nearestIsland: item && item.nearestIsland || null
        }))
      }
    });

    const textures = world && world.textures || {};
    const textureCount = finiteMetric(textures.count);
    const pendingTextures = finiteMetric(textures.pendingCount);
    const unknownTextures = finiteMetric(textures.unknownReadinessCount);
    const shadowValues = samples.map(sample => finiteMetric(sample && sample.subsystems && sample.subsystems.activeWorldShadowCasters)).filter(value => value !== null);
    const materialFindings = [];
    if (pendingTextures !== null && pendingTextures > 0) materialFindings.push(findings("Texturas pendientes de cargar",
      "La inspección final registra " + pendingTextures + " texturas pendientes.", "warning"));
    if (unknownTextures !== null && unknownTextures > 0) materialFindings.push(findings("Texturas sin estado confirmado",
      "No se pudo confirmar la carga de " + unknownTextures + " texturas.", "info"));
    const materialStatus = materialFindings.some(item => item.severity === "warning") ? "necesita-revision" :
      textureCount !== null ? "evidencia-recogida" : "sin-datos-suficientes";
    specialists.push({
      id: "tyr", name: "Týr", roleId: "materials-lighting",
      status: materialStatus,
      summary: textureCount === null
        ? "No hay un inventario de texturas disponible. Tampoco se han guardado capturas visuales comparables para valorar materiales e iluminación."
        : materialFindings.length
          ? "Týr ha detectado texturas cuyo estado necesita comprobarse. Los datos no permiten juzgar por sí solos el aspecto visual."
          : "La inspección registró " + textureCount + " texturas y no señaló cargas pendientes. La calidad de materiales, luces y sombras todavía requiere una comparación visual.",
      confidence: null,
      findings: materialFindings.length ? materialFindings :
        textureCount !== null ? [findings("Estado de las texturas", "Inventario disponible: " + textureCount + " texturas; lecturas de sombras durante la partida: " + (shadowValues.length ? Math.max(...shadowValues) : "sin medir") + ". No equivale a una aprobación visual.", "info")] : [],
      observations: byRole("materials-lighting").slice(0, 8).map(event => ({
        source: event.source, summary: boundedText(event.summary, 500),
        status: event.status, confidence: finiteMetric(event.confidence), createdAt: event.createdAt,
        evidence: event.evidence || null
      })),
      evidence: {
        textureCount, pendingTextures, unknownTextures,
        maximumShadowCasters: shadowValues.length ? Math.max(...shadowValues) : null,
        visualComparisonAvailable: false
      }
    });

    for (const specialist of specialists) {
      const name = roles.find(role => role.id === specialist.roleId);
      specialist.npcId = name ? name.npcId : specialist.name;
    }
    const needsReview = specialists.filter(item =>
      ["confirmado", "probable", "necesita-revision"].includes(item.status) ||
      item.findings.some(finding => finding.severity === "critical" || finding.severity === "warning")
    ).length;
    const observedIssues = specialists.reduce((sum, item) => sum + item.findings.filter(finding => finding.severity === "critical" || finding.severity === "warning").length, 0);
    return {
      schemaVersion: 1,
      sessionId,
      gameBuild: boundedText(report && report.gameBuild, 40) || null,
      generatedAt: new Date().toISOString(),
      autonomy: {
        localAnalysis: true,
        sessionMemory: true,
        specialistEvents: sessionEvents.length,
        automaticWorldChanges: false,
        automaticCodeChanges: false
      },
      summary: {
        specialists: specialists.length,
        needReview: needsReview,
        findingsToReview: observedIssues,
        recordedSpecialistObservations: sessionEvents.length
      },
      specialists
    };
  }

  function analyzeObserverPatrol(report, currentBuild) {
    if (!report || typeof report !== "object" || report.schema !== 1 ||
        report.mode !== "test-only-read-only-observer-patrol" ||
        !Array.isArray(report.agents) || !report.run || !report.run.id) return null;
    const bounded = (value, limit) => boundedText(value, limit);
    const structureRows = (report.agents || []).flatMap(agent =>
      agent && agent.readings && Array.isArray(agent.readings.structures)
        ? agent.readings.structures.slice(0, 500) : []);
    const agents = report.agents.slice(0, 12).map(agent => {
      const issues = (Array.isArray(agent.issues) ? agent.issues : []).slice(0, 40).map(issue => {
        const textToMatch = [issue.title, issue.detail].map(value => String(value || "")).join(" ");
        let match = structureRows.find(row => row && row.name && String(row.name).length > 8 &&
          textToMatch.includes(String(row.name)) &&
          (finiteMetric(issue.islandIndex) === null || finiteMetric(row.islandIndex) === finiteMetric(issue.islandIndex)));
        const measuredGapCm = /(\\d+(?:[.,]\\d+)?)\\s*cm/i.exec(textToMatch);
        const expectedGapMeters = measuredGapCm ? Number(measuredGapCm[1].replace(",", ".")) / 100 : null;
        if (!match && expectedGapMeters !== null) {
          const candidates = structureRows.filter(row => row && finiteMetric(row.islandIndex) === finiteMetric(issue.islandIndex));
          match = candidates.map(row => {
            const measurements = row.measurements || {};
            const gap = finiteMetric(row.gapMeters) ??
              finiteMetric(measurements.maximumFootingGapMeters) ??
              finiteMetric(measurements.maximumStructuralBaseGapMeters) ??
              finiteMetric(measurements.maximumBaseGapMeters) ??
              finiteMetric(measurements.maximumSupportPointGapMeters);
            return { row, gap };
          }).filter(item => item.gap !== null)
            .sort((a, b) => Math.abs(a.gap - expectedGapMeters) - Math.abs(b.gap - expectedGapMeters))[0]?.row || null;
          const matchedGap = match && (finiteMetric(match.gapMeters) ??
            finiteMetric(match.measurements && match.measurements.maximumFootingGapMeters) ??
            finiteMetric(match.measurements && match.measurements.maximumStructuralBaseGapMeters) ??
            finiteMetric(match.measurements && match.measurements.maximumBaseGapMeters) ??
            finiteMetric(match.measurements && match.measurements.maximumSupportPointGapMeters));
          if (matchedGap === null || Math.abs(matchedGap - expectedGapMeters) > 0.03) match = null;
        }
        const position = match && finiteMetric(match.x) !== null && finiteMetric(match.z) !== null
          ? { x: finiteMetric(match.x), z: finiteMetric(match.z), islandIndex: finiteMetric(match.islandIndex) } : null;
        let nextStep = "Repetir la comprobación con la misma referencia y revisar el objeto antes de modificarlo.";
        if (/tolerancia|apoyo|cimentaci[oó]n|cm/i.test(textToMatch))
          nextStep = "Revisar la altura del terreno y todos los puntos de apoyo de esta estructura; no recolocarla automáticamente.";
        else if (/insegura|visible/i.test(textToMatch))
          nextStep = "Volver a comprobar la base, la visibilidad y el motivo por el que la auditoría la marca como insegura.";
        else if (/terreno|enterrad|intersecci[oó]n/i.test(textToMatch))
          nextStep = "Comprobar la altura del terreno y la posición real del objeto en esta zona.";
        return {
          title: bounded(issue.title || "Incidencia sin título", 140),
          detail: bounded(issue.detail || "", 600),
          severity: ["critical", "warning", "ok"].includes(issue.severity) ? issue.severity : "unknown",
          islandIndex: finiteMetric(issue.islandIndex),
          position,
          nextStep: bounded(nextStep, 300)
        };
      });
      const severity = ["critical", "warning", "ok"].includes(agent.severity) ? agent.severity : "unknown";
      return {
        name: bounded(agent.name || "Explorador", 60),
        specialization: bounded(agent.specialization || "", 100),
        severity,
        summary: bounded(agent.summary || "", 600),
        issues,
        missing: (Array.isArray(agent.missing) ? agent.missing : []).slice(0, 20).map(value => bounded(value, 240)),
        readings: agent.readings && typeof agent.readings === "object" ? agent.readings : {}
      };
    });
    const limitations = (Array.isArray(report.limitations) ? report.limitations : []).slice(0, 12)
      .map(value => bounded(value, 300));
    const expectedIslands = finiteMetric(report.world && report.world.expectedIslands);
    const visitedIslands = finiteMetric(report.world && report.world.visitedIslands);
    const sameBuild = currentBuild && report.build ? String(currentBuild) === String(report.build) : null;
    const renderer = bounded(report.renderer || "Entorno no declarado", 160);
    const isSoftwareRenderer = /swiftshader|software|llvmpipe/i.test(renderer);
    const issueCount = agents.reduce((sum, agent) => sum + agent.issues.length, 0);
    const missingCount = agents.reduce((sum, agent) => sum + agent.missing.length, 0);
    return {
      schemaVersion: 1,
      source: "observer-patrol",
      runId: bounded(report.run.id, 80),
      runUrl: /^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/runs\/\d+/.test(String(report.run.url || "")) ? String(report.run.url) : null,
      runSha: bounded(report.run.sha, 64) || null,
      branch: bounded(report.run.branch, 100) || null,
      build: bounded(report.build || "desconocido", 40),
      renderer,
      verdict: ["passed", "partial", "issues-found", "failed", "not-run"].includes(report.verdict) ? report.verdict : "unknown",
      startedAt: bounded(report.startedAt, 40) || null,
      finishedAt: bounded(report.finishedAt, 40) || null,
      world: {
        expectedIslands, visitedIslands,
        coverageComplete: expectedIslands !== null && visitedIslands !== null && expectedIslands > 0 && visitedIslands >= expectedIslands
      },
      sameBuild,
      softwareRenderer: isSoftwareRenderer,
      issueCount,
      missingCount,
      agents,
      limitations,
      cautions: [
        sameBuild === false ? "Esta patrulla corresponde al build " + bounded(report.build, 40) + ", no al build actual " + bounded(currentBuild, 40) + ". Sus hallazgos se muestran como evidencia independiente." : "",
        sameBuild === null ? "No se conoce el build de la partida actual; no se puede confirmar que ambas mediciones correspondan a la misma versión." : "",
        isSoftwareRenderer ? "La patrulla utilizó " + renderer + ". Sus tiempos de FPS y render no representan la GPU Adreno ni la fluidez real del móvil." : "",
        "La patrulla mueve una cámara de prueba en un entorno aislado; no equivale a una partida normal ni a una ruta física recorrida por NPCs."
      ].filter(Boolean)
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
    analyzeSessionIntelligence,
    analyzeObserverPatrol,
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
