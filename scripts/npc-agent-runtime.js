(function () {
  "use strict";
  if (!window || !window.ELSN_NPC_AGENT_CORE || !window.__ELSN_NPC_AGENT_CONTEXT__) return;

  const Core = window.ELSN_NPC_AGENT_CORE;
  const context = window.__ELSN_NPC_AGENT_CONTEXT__;
  const DB_NAME = "elsn-npc-shared-memory";
  const DB_VERSION = 1;
  const MAX_MEMORY_EVENTS = 500;
  const BRIDGE_POLL_MS = 30000;
  const GAME_VERSION = document.querySelector('meta[name="el-sin-nombre-build"]')?.content || "unknown";
  const state = {
    db: null,
    persistent: false,
    memoryOnly: false,
    events: new Map(),
    outbox: new Map(),
    agents: [],
    bridge: { status: "not-configured", endpoint: null, lastSyncAt: null, lastError: null, cursor: "" },
    channel: null,
    pollTimer: null,
    syncBusy: false
  };

  function makeId(prefix) {
    const random = window.crypto && typeof window.crypto.randomUUID === "function"
      ? window.crypto.randomUUID()
      : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
    return prefix + "-" + random;
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error("IndexedDB no disponible"));
      let request;
      try { request = window.indexedDB.open(DB_NAME, DB_VERSION); }
      catch (error) { reject(error); return; }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("events")) db.createObjectStore("events", { keyPath: "id" });
        if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "id" });
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("No se pudo abrir IndexedDB"));
      request.onblocked = () => reject(new Error("La base de memoria está bloqueada por otra pestaña"));
    });
  }

  function storeRequest(storeName, method, value) {
    return new Promise((resolve, reject) => {
      if (!state.db) return reject(new Error("Memoria persistente no disponible"));
      let transaction;
      try { transaction = state.db.transaction(storeName, "readwrite"); }
      catch (error) { reject(error); return; }
      const store = transaction.objectStore(storeName);
      let request;
      try { request = method === "getAll" ? store.getAll() : method === "delete" ? store.delete(value) : method === "get" ? store.get(value) : store.put(value); }
      catch (error) { reject(error); return; }
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Error de almacenamiento"));
    });
  }

  async function putRecord(storeName, value) {
    if (state.db) {
      try { await storeRequest(storeName, "put", value); return true; }
      catch (error) { console.warn("NPC memory write fell back to session memory:", error); }
    }
    const map = storeName === "events" ? state.events : state.outbox;
    if (storeName === "meta") return false;
    map.set(value.id, value);
    return false;
  }

  async function getRecords(storeName) {
    if (state.db) {
      try { return await storeRequest(storeName, "getAll"); }
      catch (error) { console.warn("NPC memory read fell back to session memory:", error); }
    }
    if (storeName === "events") return Array.from(state.events.values());
    if (storeName === "outbox") return Array.from(state.outbox.values());
    return [];
  }

  async function deleteRecord(storeName, id) {
    if (state.db) {
      try { await storeRequest(storeName, "delete", id); }
      catch (error) { console.warn("NPC memory delete fell back to session memory:", error); }
    }
    if (storeName === "events") state.events.delete(id);
    if (storeName === "outbox") state.outbox.delete(id);
  }

  async function readMeta(key) {
    if (!state.db) return null;
    try {
      const value = await storeRequest("meta", "get", key);
      return value ? value.value : null;
    } catch (_) { return null; }
  }

  async function writeMeta(key, value) {
    if (!state.db) return false;
    try { await storeRequest("meta", "put", { key, value }); return true; }
    catch (_) { return false; }
  }

  function civilianRoster() {
    let roster = [];
    try { roster = context.getCivilianRoster(); } catch (error) { console.warn("Civilian roster unavailable:", error); }
    return Array.isArray(roster) ? roster.filter(Core.isEligibleCivilian) : [];
  }

  function refreshAgents() {
    state.agents = civilianRoster().map(npc => {
      const agent = Core.assignCivilianAgent(npc);
      if (agent) {
        // Metadata only: no meshes, transforms, materials, animation groups or movement are touched.
        npc.aiAgent = agent;
      }
      return agent;
    }).filter(Boolean);
    return state.agents.slice();
  }

  function publish(event) {
    if (state.channel) {
      try { state.channel.postMessage({ type: "memory-event", event }); } catch (_) {}
    }
  }

  async function persistEvent(event, broadcast) {
    const exists = state.events.has(event.id);
    if (exists) return false;
    state.events.set(event.id, event);
    await putRecord("events", event);
    const sorted = Array.from(state.events.values()).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    for (const stale of sorted.slice(MAX_MEMORY_EVENTS)) {
      state.events.delete(stale.id);
      await deleteRecord("events", stale.id);
    }
    if (broadcast !== false) publish(event);
    return true;
  }

  async function remember(input) {
    const payload = Object.assign({}, input || {});
    if (!payload.id) payload.id = makeId("memory");
    if (!payload.createdAt) payload.createdAt = new Date().toISOString();
    const normalized = Core.normalizeEvent(payload);
    if (!normalized.ok) throw new Error("Memoria rechazada: " + normalized.error);
    await persistEvent(normalized.event, true);
    return normalized.event;
  }

  function setupCrossTabMemory() {
    if (!("BroadcastChannel" in window)) return;
    try {
      state.channel = new BroadcastChannel("elsn-npc-shared-memory-v1");
      state.channel.onmessage = event => {
        const message = event && event.data;
        if (!message || message.type !== "memory-event" || !message.event) return;
        const normalized = Core.normalizeEvent(message.event);
        if (normalized.ok) persistEvent(normalized.event, false);
      };
    } catch (error) {
      console.info("Cross-tab NPC memory is unavailable:", error);
    }
  }

  async function initialize() {
    try {
      state.db = await openDatabase();
      state.persistent = true;
    } catch (error) {
      state.memoryOnly = true;
      console.warn("NPC memory is session-only in this browser:", error);
    }
    const [savedEvents, savedOutbox, cursor] = await Promise.all([
      getRecords("events"), getRecords("outbox"), readMeta("bridge-cursor")
    ]);
    savedEvents.forEach(event => {
      const normalized = Core.normalizeEvent(event);
      if (normalized.ok) state.events.set(normalized.event.id, normalized.event);
    });
    savedOutbox.forEach(task => { if (task && task.id) state.outbox.set(task.id, task); });
    state.bridge.cursor = cursor || "";
    setupCrossTabMemory();
    const agents = refreshAgents();
    for (const agent of agents) {
      const registrationId = "roster-v1:" + agent.npcId + ":" + agent.roleId;
      if (!state.events.has(registrationId)) {
        await remember({
          id: registrationId,
          source: "system",
          npcId: agent.npcId,
          roleId: agent.roleId,
          domain: agent.domain,
          kind: "agent-registered",
          status: "assigned",
          summary: agent.npcId + " asignado a la especialidad " + agent.roleName + ".",
          evidence: { gameVersion: GAME_VERSION, assignment: "deterministic-v1" }
        });
      }
    }
    const config = window.__ELSN_NPC_AGENT_BRIDGE_CONFIG__;
    if (config && config.endpoint) {
      try { await connectExternalBridge(config.endpoint); }
      catch (error) { console.warn("External NPC bridge is not connected:", error); }
    }
    return getSnapshot();
  }

  function getAgent(agentId) {
    refreshAgents();
    return state.agents.find(agent => agent.id === agentId || agent.npcId === agentId) || null;
  }

  function getRoleCatalog() {
    return Core.ROLES.map(role => Object.assign({}, role));
  }

  async function getMemory(options) {
    const opts = options || {};
    const domain = opts.domain ? String(opts.domain) : "";
    const limit = Math.max(1, Math.min(200, Number(opts.limit) || 50));
    const events = Array.from(state.events.values())
      .filter(event => !domain || event.domain === domain || event.roleId === domain)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return events.slice(0, limit);
  }

  async function getSnapshot() {
    refreshAgents();
    const counts = {};
    for (const role of Core.ROLES) counts[role.id] = state.agents.filter(agent => agent.roleId === role.id).length;
    return {
      protocolVersion: Core.PROTOCOL_VERSION,
      gameVersion: GAME_VERSION,
      persistentMemory: state.persistent,
      sessionOnlyFallback: state.memoryOnly,
      agentCount: state.agents.length,
      roleCounts: counts,
      memoryCount: state.events.size,
      pendingExternalTasks: state.outbox.size,
      bridge: {
        status: state.bridge.status,
        endpoint: state.bridge.endpoint ? "[configured]" : null,
        lastSyncAt: state.bridge.lastSyncAt,
        lastError: state.bridge.lastError,
        cursorAvailable: Boolean(state.bridge.cursor)
      }
    };
  }

  async function exportSnapshot() {
    const snapshot = await getSnapshot();
    return JSON.stringify({
      snapshot,
      roles: getRoleCatalog(),
      agents: state.agents,
      memory: await getMemory({ limit: MAX_MEMORY_EVENTS }),
      pendingTasks: Array.from(state.outbox.values())
    }, null, 2);
  }

  async function submitTask(agentId, input) {
    const agent = getAgent(agentId);
    if (!agent) throw new Error("El NPC indicado no es un aldeano civil habilitado.");
    const taskId = makeId("task");
    const normalized = Core.normalizeTask(Object.assign({}, input || {}, { id: taskId }), agent);
    if (!normalized.ok) throw new Error("Tarea rechazada: " + normalized.error);
    const task = Object.assign({}, normalized.task, { gameVersion: GAME_VERSION, state: "pending" });
    await putRecord("outbox", task);
    state.outbox.set(task.id, task);
    await remember({
      id: "proposal:" + task.id,
      source: "operator",
      npcId: agent.npcId,
      roleId: agent.roleId,
      domain: agent.domain,
      kind: "task-proposal",
      status: "queued",
      summary: task.goal,
      evidence: { taskId: task.id, action: task.action, detail: task.detail }
    });
    if (state.bridge.status === "connected") {
      try { await syncExternal(); } catch (error) { state.bridge.lastError = String(error.message || error); }
    }
    return { task, bridgeStatus: state.bridge.status };
  }

  async function bridgeFetch(path, options) {
    if (!state.bridge.endpoint) throw new Error("No hay una dirección externa configurada.");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(state.bridge.endpoint + path, Object.assign({
        mode: "cors",
        credentials: "include",
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
        headers: { "Accept": "application/json" }
      }, options || {}));
      if (!response.ok) throw new Error("Servicio externo HTTP " + response.status);
      const contentType = String(response.headers.get("content-type") || "").toLowerCase();
      const declaredLength = Number(response.headers.get("content-length") || 0);
      if (!contentType.includes("application/json") || declaredLength > 512 * 1024) {
        throw new Error("Respuesta externa no válida o demasiado grande.");
      }
      const body = await response.text();
      if (body.length > 512 * 1024) throw new Error("Respuesta externa superior al límite de 512 KB.");
      return JSON.parse(body);
    } finally {
      clearTimeout(timer);
    }
  }

  function startBridgePolling() {
    if (state.pollTimer) clearInterval(state.pollTimer);
    state.pollTimer = setInterval(() => {
      if (state.bridge.status === "error" && state.bridge.endpoint) state.bridge.status = "connected";
      syncExternal().catch(error => {
        state.bridge.lastError = String(error.message || error);
        state.bridge.status = "error";
      });
    }, BRIDGE_POLL_MS);
  }

  async function connectExternalBridge(endpoint) {
    const normalized = Core.normalizeBridgeEndpoint(endpoint);
    if (!normalized) throw new Error("El puente debe usar HTTPS y no puede incluir credenciales, parámetros ni fragmentos.");
    state.bridge.status = "connecting";
    state.bridge.endpoint = normalized;
    state.bridge.lastError = null;
    let health;
    try { health = await bridgeFetch("/v1/health"); }
    catch (error) {
      state.bridge.status = "error";
      state.bridge.lastError = String(error.message || error);
      throw error;
    }
    const capabilities = Array.isArray(health.capabilities) ? health.capabilities : [];
    state.bridge.csrfToken = String(health.csrfToken || "");
    if (health.protocolVersion !== Core.PROTOCOL_VERSION ||
        !capabilities.includes("tasks:submit") ||
        !capabilities.includes("events:read") ||
        state.bridge.csrfToken.length < 16 || state.bridge.csrfToken.length > 512) {
      state.bridge.status = "incompatible";
      throw new Error("El servicio externo no cumple el protocolo NPC Agent v1.");
    }
    state.bridge.status = "connected";
    state.bridge.lastSyncAt = new Date().toISOString();
    startBridgePolling();
    await syncExternal();
    return { status: state.bridge.status, protocolVersion: health.protocolVersion, capabilities };
  }

  function disconnectExternalBridge() {
    if (state.pollTimer) clearInterval(state.pollTimer);
    state.pollTimer = null;
    state.bridge.status = "disconnected";
    state.bridge.endpoint = null;
    state.bridge.csrfToken = "";
    state.bridge.lastError = null;
    return true;
  }

  async function syncExternal() {
    if (state.syncBusy) return { skipped: true, reason: "sync-already-running" };
    if (state.bridge.status !== "connected" || !state.bridge.endpoint) return { skipped: true, reason: "bridge-not-connected" };
    state.syncBusy = true;
    try {
      const queued = Array.from(state.outbox.values()).filter(task => task.state === "pending");
      let acceptedCount = 0;
      for (const task of queued) {
        const accepted = await bridgeFetch("/v1/tasks", {
          method: "POST",
          headers: { "Accept": "application/json", "Content-Type": "application/json", "X-CSRF-Token": state.bridge.csrfToken },
          body: JSON.stringify(task)
        });
        if (accepted.accepted === true) {
          acceptedCount++;
          state.outbox.delete(task.id);
          await deleteRecord("outbox", task.id);
          await remember({
            id: "accepted:" + task.id,
            source: "system",
            npcId: task.npcId,
            roleId: task.roleId,
            domain: task.domain,
            kind: "task-accepted",
            status: "accepted",
            summary: "El agente externo ha aceptado la tarea: " + task.goal,
            evidence: { taskId: task.id, remoteTaskId: String(accepted.remoteTaskId || "").slice(0, 160) }
          });
        }
      }

      const cursor = state.bridge.cursor ? "?cursor=" + encodeURIComponent(state.bridge.cursor) : "";
      const response = await bridgeFetch("/v1/events" + cursor);
      const normalized = Core.normalizeRemoteEnvelope(response);
      if (!normalized.ok) throw new Error("El servicio externo devolvió un sobre de eventos no válido.");
      for (const event of normalized.events) await persistEvent(event, true);
      if (normalized.cursor && normalized.cursor !== state.bridge.cursor) {
        state.bridge.cursor = normalized.cursor;
        await writeMeta("bridge-cursor", normalized.cursor);
      }
      state.bridge.lastSyncAt = new Date().toISOString();
      state.bridge.lastError = null;
      return { acceptedTasks: acceptedCount, importedEvents: normalized.events.length, cursor: state.bridge.cursor };
    } catch (error) {
      state.bridge.lastError = String(error.message || error);
      state.bridge.status = "error";
      throw error;
    } finally {
      state.syncBusy = false;
    }
  }

  const ready = initialize().catch(error => {
    console.error("NPC specialist system initialization failed:", error);
    return { error: String(error.message || error) };
  });

  window.__ELSN_NPC_AGENT_SYSTEM__ = Object.freeze({
    ready,
    listAgents: () => refreshAgents(),
    listRoles: getRoleCatalog,
    getSnapshot,
    getMemory,
    remember,
    submitTask,
    exportSnapshot,
    connectExternalBridge,
    disconnectExternalBridge,
    syncExternal
  });
})();
