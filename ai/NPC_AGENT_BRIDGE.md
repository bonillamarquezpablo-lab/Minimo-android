# EL SIN NOMBRE — NPC specialists and external agent bridge

## Existing villagers assigned as specialists

Only neutral civilian villagers named `Villager_<village>_<slot>` are eligible. The game roster is filtered again at runtime: the character parts must be marked `civilian=true` and `role="civilian"`, and the villager must not have been recruited. The player, Viking protagonist, guards, warriors, invasion units and companions are not eligible.

The assignment is deterministic and does not depend on the NPC's appearance:

| Specialist | Responsibility |
| --- | --- |
| Performance | FPS, frame times, p95/p99, stutters and regression evidence |
| Water and coast | Waves, foam, reflections, splashes and shoreline transitions |
| Terrain and structures | Island geometry, heightfields, settlement placement, grounding and collisions |
| Materials and lighting | Textures, PBR materials, lights and shadows |

The assignment is metadata only. It does not change meshes, materials, transforms, animation groups, weapons, routes, speed, or the game update loop.

## Shared memory

The browser runtime stores event records, task outbox items and the external cursor in IndexedDB. Tabs on the same origin exchange new records using BroadcastChannel. When IndexedDB is unavailable, the system reports that it has fallen back to session-only memory. The retained event history is bounded to 500 entries.

The in-game API is exposed as `window.__ELSN_NPC_AGENT_SYSTEM__`:

- `await api.ready`
- `api.listAgents()` and `api.listRoles()`
- `await api.getSnapshot()`
- `await api.getMemory({ domain, limit })`
- `await api.remember(event)`
- `await api.submitTask(npcId, { action, goal, detail })`
- `await api.exportSnapshot()`
- `await api.connectExternalBridge(endpoint)`
- `api.disconnectExternalBridge()`
- `await api.syncExternal()`

Tasks accept only `investigate` or `propose-fix`. A task is a request for an external specialist to inspect evidence and return findings. No remote event can execute JavaScript, edit files, deploy a build, or merge code.

## External bridge protocol v1

The game is a static GitHub Pages site, so it must not contain a model-provider key, GitHub token, or other long-lived secret. A separate HTTPS service must authenticate the browser with a secure session cookie and call external agents server-side.

Configure an endpoint at runtime by defining this before the runtime script executes:

```js
window.__ELSN_NPC_AGENT_BRIDGE_CONFIG__ = {
  endpoint: "https://YOUR-SECURE-BRIDGE.example"
};
```

Or connect from the browser API:

```js
await window.__ELSN_NPC_AGENT_SYSTEM__.connectExternalBridge(
  "https://YOUR-SECURE-BRIDGE.example"
);
```

The endpoint must implement:

1. `GET /v1/health` — JSON with `protocolVersion: 1`, capabilities `tasks:submit` and `events:read`, and a `csrfToken` string of 16–512 characters. The browser sends this token in `X-CSRF-Token` on task submissions.
2. `POST /v1/tasks` — accepts a task payload with a stable task idempotency key and responds with `{ "accepted": true, "remoteTaskId": "..." }`.
3. `GET /v1/events?cursor=...` — responds with `{ "protocolVersion": 1, "events": [], "nextCursor": "..." }`.

The browser sends requests with `credentials: "include"`; it never sends a bearer token. The bridge must:
- allow only the exact GitHub Pages origin through credentialed CORS;
- use a Secure, HttpOnly session cookie, server-side authorization, exact Origin validation and CSRF-token validation;
- validate user/session permissions and rate-limit requests;
- validate and cap every payload;
- return observations, diagnoses, task proposals and task results only;
- never expose provider keys or GitHub credentials to the browser.

Remote events are allowlisted and size-limited. Unknown event types (including code execution or patch application) are discarded. External agents can investigate the repository and prepare a proposed change in an isolated branch through the bridge's server-side tooling, but integration and merge remain human-approved.

## Current connection status

The client adapter and protocol contract are included, but a live external connection is not active until a real HTTPS bridge endpoint and authenticated session are supplied. With no endpoint configured, local shared memory and the task outbox continue to work; pending tasks can be exported with `exportSnapshot()`.
