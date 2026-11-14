(function () {
  "use strict";
  const Core = window.ELSN_NPC_AGENT_CORE;
  const API = window.__ELSN_NPC_AGENT_SYSTEM__;
  const DB_NAME = "elsn-game-session-reports";
  const DB_VERSION = 1;
  const STORE = "sessions";
  const $ = id => document.getElementById(id);
  let reports = [];
  let analysis = null;

  function text(value) { return String(value == null ? "" : value); }
  function fmt(value, digits) {
    return value === null || value === undefined || !Number.isFinite(Number(value))
      ? "—" : Number(value).toLocaleString("es-ES", { maximumFractionDigits: digits === undefined ? 1 : digits });
  }
  function label(status) {
    const labels = {
      "confirmado": "Repetido en varias sesiones",
      "probable": "Incidencia probable",
      "sin-datos-suficientes": "Faltan evidencias",
      "sin-incidencia-observada": "Sin incidencia observada",
      "evidencia-recogida": "Evidencias recogidas",
      "pendiente-recorrido-fisico": "Pendiente de recorrido físico",
      "pendiente-capturas-visuales": "Pendiente de capturas visuales"
    };
    return labels[status] || status || "Sin estado";
  }
  function make(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  }
  function openReports() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "sessionId" });
      };
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) { db.close(); resolve([]); return; }
        const transaction = db.transaction(STORE, "readonly");
        const read = transaction.objectStore(STORE).getAll();
        read.onsuccess = () => {
          const values = Array.isArray(read.result) ? read.result : [];
          db.close();
          resolve(values.sort((a, b) => Date.parse(b.startedAt || "") - Date.parse(a.startedAt || "")));
        };
        read.onerror = () => { db.close(); reject(read.error || new Error("No se pudieron leer los informes.")); };
      };
      request.onerror = () => reject(request.error || new Error("IndexedDB no está disponible."));
      request.onblocked = () => reject(new Error("La base de informes está bloqueada por otra pestaña."));
    });
  }

  async function importSessionMemory() {
    if (!API || typeof API.getMemory !== "function" || typeof API.remember !== "function") return;
    const existing = await API.getMemory({ limit: 200 });
    const ids = new Set(existing.map(event => event.id));
    for (const report of reports.slice(0, 20)) {
      const id = "session-report:" + text(report.sessionId).slice(0, 120);
      if (ids.has(id)) continue;
      const latest = report.samples && report.samples.length ? report.samples[report.samples.length - 1] : null;
      await API.remember({
        id,
        source: "system",
        npcId: "Eira",
        roleId: "performance",
        domain: "performance",
        kind: "observation",
        status: report.status || "recorded",
        summary: "Informe de partida recibido: " + text(report.gameBuild || "versión desconocida") +
          " · " + Number(report.sampleCount || 0) + " muestras.",
        evidence: {
          sessionId: report.sessionId,
          startedAt: report.startedAt,
          finishedAt: report.finishedAt,
          gameBuild: report.gameBuild,
          sampleCount: report.sampleCount,
          latestFps: latest && latest.fps,
          latestP95Ms: latest && latest.frameTiming && latest.frameTiming.p95Ms,
          summary: report.summary || null,
          terrainObjectCandidates: report.finalWorldInspection?.terrainObjects?.items?.slice(0, 40) || [],
          terrainObjectAuditComplete: report.finalWorldInspection?.terrainObjects?.complete === true
        }
      });
      ids.add(id);
    }
  }

  function renderSpecialists() {
    const host = $("npcAgentsSpecialists");
    host.replaceChildren();
    for (const specialist of analysis.specialists) {
      const article = make("article", "chart-card");
      const heading = make("div", "chart-card-head");
      const title = make("h3", "", specialist.name + " · " + (Core.SPECIALISTS.find(item => item.name === specialist.name)?.roleName || specialist.roleId));
      const status = make("span", "step-label", label(specialist.status));
      heading.append(title, status);
      const summary = make("p", "live-diagnostic-note", specialist.summary);
      const evidence = make("pre", "npc-agent-evidence", JSON.stringify(specialist.evidence, null, 2));
      article.append(heading, summary, evidence);
      host.appendChild(article);
    }
  }

  function renderReports() {
    const host = $("npcAgentsReports");
    host.replaceChildren();
    for (const report of reports.slice(0, 12)) {
      const item = make("article", "panel");
      const start = report.startedAt ? new Date(report.startedAt).toLocaleString("es-ES") : "Fecha no disponible";
      const heading = make("strong", "", start + " · " + text(report.gameBuild || "versión desconocida"));
      const meta = make("p", "live-diagnostic-note",
        Number(report.sampleCount || 0) + " lecturas · " +
        (report.status === "active" ? "sesión abierta" : report.status === "interrupted" ? "sesión interrumpida" : "sesión finalizada") +
        " · " + text(report.sessionId).slice(0, 12));
      const last = report.samples && report.samples.length ? report.samples[report.samples.length - 1] : null;
      const summary = report.summary || {};
      const fps = summary.fps || {};
      const frame = summary.frameTimeMs || {};
      const world = report.finalWorldInspection || {};
      const terrain = world.terrainObjects || {};
      const metrics = make("p", "", "FPS medio: " + fmt(fps.average, 1) +
        " · mínimo: " + fmt(fps.minimum, 0) +
        " · p95 mediano: " + fmt(frame.p95Median, 2) + " ms" +
        " · último FPS: " + fmt(last && last.fps, 0));
      const diagnosis = make("p", "live-diagnostic-note",
        "Cuello de botella orientativo: " + text(summary.probableBottleneck || "sin atribución") +
        " · CPU mundo: " + fmt(summary.cpu && summary.cpu.worldUpdateMedianMs, 2) + " ms" +
        " · CPU render: " + fmt(summary.cpu && summary.cpu.renderPreparationMedianMs, 2) + " ms" +
        " · GPU: " + fmt(summary.gpu && summary.gpu.frameMedianMs, 2) + " ms");
      const terrainLine = make("p", "live-diagnostic-note",
        "Objetos bajo terreno: " + fmt(terrain.candidateCount, 0) +
        " · completamente enterrados: " + fmt(terrain.fullyBuriedCount, 0) +
        " · con intersección: " + fmt(terrain.penetratingCount, 0) +
        " · auditoría completa: " + (terrain.complete === true ? "sí" : terrain.complete === false ? "no" : "sin captura"));
      const details = make("details", "technical");
      const summaryLabel = make("summary", "", "Ver informe técnico y coordenadas");
      const evidence = {
        sessionId: report.sessionId, startedAt: report.startedAt, finishedAt: report.finishedAt,
        gameBuild: report.gameBuild, status: report.status, summary,
        terrainObjects: (terrain.items || []).slice(0, 40),
        worldInspectionError: world.error || null
      };
      const pre = make("pre", "npc-agent-evidence", JSON.stringify(evidence, null, 2));
      details.append(summaryLabel, pre);
      item.append(heading, meta, metrics, diagnosis, terrainLine, details);
      host.appendChild(item);
    }
    if (!reports.length) host.appendChild(make("p", "live-diagnostic-note", "Todavía no hay informes de partidas guardados en este navegador."));
  }

  function renderMemory(events) {
    const host = $("npcAgentsMemory");
    host.replaceChildren();
    for (const event of events.slice(0, 8)) {
      const item = make("li", "", new Date(event.createdAt).toLocaleString("es-ES") + " · " + event.summary);
      host.appendChild(item);
    }
    if (!events.length) host.appendChild(make("li", "", "Aún no hay observaciones guardadas en la memoria de los especialistas."));
  }

  async function refresh() {
    $("npcAgentsRefresh").disabled = true;
    $("npcAgentsStatus").textContent = "Leyendo informes locales y memoria de especialistas…";
    try {
      reports = await openReports();
      analysis = Core.analyzeSessionReports(reports);
      if (API && API.ready) await API.ready;
      await importSessionMemory();
      const memory = API && API.getMemory ? await API.getMemory({ limit: 100 }) : [];
      renderSpecialists();
      renderReports();
      renderMemory(memory);
      $("npcAgentsSessionCount").textContent = String(reports.length);
      $("npcAgentsSampleCount").textContent = String(reports.reduce((sum, report) => sum + Number(report.sampleCount || 0), 0));
      $("npcAgentsStatus").textContent = "Memoria persistente: " + (API && (await API.getSnapshot()).persistentMemory ? "activa" : "no disponible") +
        " · Puente de IA externo: " + (API ? (await API.getSnapshot()).bridge.status : "no disponible");
    } catch (error) {
      $("npcAgentsStatus").textContent = "No se pudieron actualizar los informes: " + text(error && error.message || error);
    } finally {
      $("npcAgentsRefresh").disabled = false;
    }
  }

  $("npcAgentsRefresh").addEventListener("click", refresh);
  $("npcAgentsExport").addEventListener("click", () => {
    const payload = { reports, analysis, memory: null, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "el-sin-nombre-informes-npc-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json";
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  refresh();
})();