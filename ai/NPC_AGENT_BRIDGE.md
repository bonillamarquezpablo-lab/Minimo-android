# EL SIN NOMBRE — Inspector NPC specialists and external agent bridge

## Inspector-only specialist identities

The specialist runtime is loaded by Inspector Center only. The player-facing game HTML does not load or initialize the specialist runtime, does not tag civilian actors, and does not instantiate extra models, skeletons, animations or colliders for inspection.

| Specialist | Responsibility |
| --- | --- |
| Eira | Performance, FPS, frame times, p95/p99 and stutter evidence |
| Sól | Water, foam, reflections, splashes and shoreline transitions |
| Ulf | Island terrain, structures, obstacles and collision investigation |
| Týr | Materials, PBR textures, lighting and shadows |

These are logical Inspector identities in this stage. Physical navigation and obstacle avoidance are not yet active; the Inspector must not report a camera visit as a physical patrol.

## Session reports

The game writes a small local report while a real top-level player session is active. Embedded Inspector diagnostic runs are excluded. Reports are stored in IndexedDB database \`elsn-game-session-reports\`, independently from game saves. Sampling is bounded to one reading every 10 seconds, 360 samples per session, and 20 retained sessions. The payload contains the game build, timing/FPS measurements where available, selected CPU/GPU/scene metrics, optional player coordinates if exposed by the health API, and compact water-debug measurements.

The recorder does not create meshes, characters or physics objects. It does not run a continuous profiler. The Inspector Center reads the same-origin report database and imports report summaries into the specialists' shared memory.

## Local specialist intelligence

Eira currently applies a conservative evidence rule to the saved performance windows. A single session can only produce a probable observation; a repeated finding requires independent sessions and enough valid samples. Missing target FPS or p95 values remain unavailable rather than being treated as zero.

Sól records the presence of water diagnostics without declaring a defect until a validated threshold exists. Ulf remains pending until physical navigation and collision tests are implemented. Týr remains pending until synchronized visual evidence is available. No diagnosis is silently promoted to a confirmed root cause.

The shared memory stores events, task outbox items and the external cursor in IndexedDB database \`elsn-npc-shared-memory\`. Its event history is bounded to 500 entries. Tabs on the same origin exchange new records through BroadcastChannel.

The Inspector API is exposed as \`window.__ELSN_NPC_AGENT_SYSTEM__\`:

- \`await api.ready\`
- \`api.listAgents()\` and \`api.listRoles()\`
- \`await api.getSnapshot()\`
- \`await api.getMemory({ domain, limit })\`
- \`await api.remember(event)\`
- \`await api.submitTask(npcId, { action, goal, detail })\`
- \`await api.exportSnapshot()\`
- \`await api.connectExternalBridge(endpoint)\`
- \`api.disconnectExternalBridge()\`
- \`await api.syncExternal()\`

Tasks accept only \`investigate\` or \`propose-fix\`. External responses remain data-only: no remote event can execute JavaScript, edit repository files, deploy a build or merge code.

## External bridge protocol v1

The game is a static GitHub Pages site, so it must not contain a model-provider key, GitHub token or other long-lived secret. A separate HTTPS service must authenticate the Inspector browser with a secure session cookie and call external agents server-side.

Configure an endpoint on the Inspector page before the specialist runtime loads:

\`\`\`js
window.__ELSN_NPC_AGENT_BRIDGE_CONFIG__ = {
  endpoint: "https://YOUR-SECURE-BRIDGE.example"
};
\`\`\`

The endpoint must implement:

1. \`GET /v1/health\` — JSON with \`protocolVersion: 1\`, capabilities \`tasks:submit\` and \`events:read\`, and a \`csrfToken\` string of 16–512 characters.
2. \`POST /v1/tasks\` — accepts a task payload with a stable idempotency key.
3. \`GET /v1/events?cursor=...\` — returns allowlisted observations, diagnoses, task proposals and task results.

The browser sends requests with \`credentials: "include"\`; it never sends a bearer token. The bridge must enforce exact-origin credentialed CORS, a Secure/HttpOnly session cookie, Origin and CSRF validation, authorization and rate limits. Provider keys and GitHub credentials stay server-side.

## Current connection status

The local memory and Inspector API work without a remote bridge. A live external AI connection is not active until a real HTTPS endpoint and authenticated session are configured. The current local analysis is deterministic and evidence-based; it is not a connected ChatGPT model and does not autonomously apply repairs.
