"use strict";
const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const source = fs.readFileSync("scripts/game-session-recorder.js", "utf8");
const workbench = fs.readFileSync("inspector/unified-workbench.js", "utf8");
const inspectorHtml = fs.readFileSync("inspector/index.html", "utf8");
const workbenchCss = fs.readFileSync("inspector/unified-workbench.css", "utf8");
new vm.Script(source, { filename: "scripts/game-session-recorder.js" });
new vm.Script(workbench, { filename: "inspector/unified-workbench.js" });
assert.ok(workbench.includes('id="wbReportMeta"'), "The latest-session render target must exist so rendering cannot stop after writing the FPS cards.");
for (const id of ["wbReportDiagnosis","wbDiagnosisHeadline","wbDiagnosisStages","wbDiagnosisMoments","wbDiagnosisAction","wbDiagnosisEvidence"])
  assert.ok(workbench.includes(id), "The guided diagnosis view must render " + id + ".");
for (const control of ["wbReportExport","wbReportExportFull","wbReportCopy","wbReportImport","wbSpecialistCards","wbPatrolAgents","wbReportJson"])
  assert.ok(workbench.includes(control), "An existing report or inspection feature was removed: " + control);
for (const marker of [".wb-diagnosis-needs-attention",".wb-diagnosis-columns",".wb-diagnosis-moment",".wb-diagnosis-extra","@media(max-width:620px)"])
  assert.ok(workbenchCss.includes(marker), "Missing accessible responsive diagnosis styling: " + marker);
assert.ok(inspectorHtml.includes("unified-workbench.css?v=7") && inspectorHtml.includes("unified-workbench.js?v=9"),
  "Inspector cache versions must point to the new diagnostic layout.");
const loadReportStart = workbench.indexOf("  async function loadReport() {");
const loadReportEnd = workbench.indexOf("\\n  async function persistImportedReport", loadReportStart);
assert.ok(loadReportStart >= 0 && loadReportEnd > loadReportStart, "Local report loading must remain independently testable.");
const loadReportSource = workbench.slice(loadReportStart, loadReportEnd);
assert.ok(loadReportSource.includes("refreshObserverPatrolInBackground("), "Independent patrol evidence must refresh without blocking the local report.");
assert.doesNotMatch(loadReportSource, /await\\s+loadLatestObserverPatrol/, "Local match history must not wait for the remote patrol request.");

const start = source.indexOf("  function buildSessionSummary(session) {");
const end = source.indexOf("\n  function captureFinalWorldInspection()", start);
assert.ok(start >= 0 && end > start, "The real post-match summary builder must remain available for testing.");
const builder = source.slice(start, end);

function number(value) {
  if (value === null || value === undefined || typeof value === "boolean" || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function percentile(values, ratio) {
  const valid = values.filter(value => value !== null && Number.isFinite(value)).sort((a, b) => a - b);
  if (!valid.length) return null;
  const index = (valid.length - 1) * ratio;
  const lower = Math.floor(index), upper = Math.ceil(index);
  return Number((valid[lower] + (valid[upper] - valid[lower]) * (index - lower)).toFixed(2));
}
const sandbox = { number, percentile, SAMPLE_INTERVAL_MS: 2500 };
vm.runInNewContext(builder + "\nthis.buildSessionSummaryForTest = buildSessionSummary;", sandbox);

const startedAt = Date.parse("2026-11-16T08:00:00.000Z");
const samples = Array.from({ length: 16 }, (_, index) => {
  const slow = index >= 6 && index <= 10;
  return {
    capturedAt: new Date(startedAt + index * 2500).toISOString(),
    targetFps: 60,
    fps: slow ? 22 + index % 3 : 48,
    frameTiming: { samples: 60, averageMs: slow ? 34 : 16, p50Ms: slow ? 30 : 15,
      p95Ms: slow ? 42 + index : 17, p99Ms: slow ? 55 + index : 21, maxMs: slow ? 80 + index : 28 },
    cpu: { worldUpdateMs: 12 + index % 2, renderCpuMs: 4 },
    gpu: { frameMs: 5, sceneRenderMs: 3 },
    sceneTimings: { activeMeshesEvaluationMs: 1.2, renderTargetsMs: 1.6 },
    scene: { profileDiagnosticsEnabled: true },
    subsystems: {
      waterUpdateMs: 0.8,
      worldPhaseTimings: {
        "npc-update": { samples: 160, lastMs: slow ? 10 : 7, meanMs: 8.5, maxMs: 14 },
        "water-update": { samples: 160, lastMs: 1, meanMs: 0.9, maxMs: 2 }
      }
    },
    atmosphere: { night: slow ? 0.9 : 0.1, timeOfDay: slow ? 0.85 : 0.35 },
    playerPosition: { x: 145.25, y: 4.1, z: -82.5, islandIndex: 3 }
  };
});
const report = {
  startedAt: new Date(startedAt).toISOString(),
  finishedAt: new Date(startedAt + 15 * 2500).toISOString(),
  sampleIntervalMs: 2500,
  persistIntervalMs: 10000,
  samples,
  longTaskObserverSupported: true,
  longTasks: [
    { capturedAt: samples[8].capturedAt, durationMs: 124.5, attribution: [{ name: "npc-dialogue-runtime.js" }] },
    { capturedAt: samples[11].capturedAt, durationMs: 24, attribution: [] }
  ],
  anomalies: [{
    startedAt: samples[8].capturedAt, lastSeenAt: samples[9].capturedAt, severity: "critical",
    observations: 2, minimumFps: 22, peakP95Ms: 52, peakP99Ms: 65, signals: ["p95-supera-1.5x-presupuesto"],
    playerPosition: samples[8].playerPosition, relatedLongTasks: [], relatedRuntimeErrors: []
  }],
  runtimeErrors: [{
    capturedAt: samples[8].capturedAt, kind: "resource-load", message: "No se pudo cargar un recurso script",
    resourcePath: "https://game.test/scripts/npc-dialogue-runtime.js", source: null, line: null, column: null
  }]
};
const summary = sandbox.buildSessionSummaryForTest(report);
const diagnosis = summary.performanceDiagnosis;
assert.ok(diagnosis, "Every new post-match JSON must include a structured performance diagnosis.");
assert.equal(diagnosis.status, "needs-attention");
assert.equal(diagnosis.primaryBottleneck.id, "world-update", "The measured longest stage must rank above smaller stages.");
assert.ok(diagnosis.worstMoments.length > 0, "Slow periods must be pinpointed.");
assert.ok(diagnosis.worstMoments.some(item => item.location && item.location.islandIndex === 3), "Slow periods must retain player coordinates and island.");
assert.ok(diagnosis.worstMoments.some(item => item.topPhase && item.topPhase.id === "npc-update"), "Slow periods must identify the busiest internal world phase.");
assert.ok(diagnosis.phaseCosts.some(item => item.id === "npc-update" && item.label === "Personajes e inteligencia"), "Internal phase timings must be understandable and retained.");
assert.equal(diagnosis.longTasks.count, 2);
assert.equal(diagnosis.longTasks.top[0].durationMs, 124.5);
assert.equal(diagnosis.runtimeErrors.count, 1);
assert.match(diagnosis.runtimeErrors.recent[0].resourcePath, /npc-dialogue-runtime/);
assert.equal(diagnosis.anomalies.criticalCount, 1);
assert.ok(diagnosis.firstAction && diagnosis.firstAction.length > 10);
assert.ok(diagnosis.interpretationNote.includes("no deben sumarse"), "Overlapping timers must not be presented as additive costs.");

const stableSession = {
  startedAt: new Date(startedAt).toISOString(),
  finishedAt: new Date(startedAt + 15000).toISOString(),
  sampleIntervalMs: 2500,
  samples: Array.from({ length: 7 }, (_, index) => ({
    capturedAt: new Date(startedAt + index * 2500).toISOString(),
    targetFps: 60, fps: 58,
    frameTiming: { p95Ms: 12, p99Ms: 15, maxMs: 18 },
    cpu: { worldUpdateMs: 2, renderCpuMs: 2 },
    gpu: { frameMs: null, sceneRenderMs: null },
    scene: { profileDiagnosticsEnabled: false },
    sceneTimings: {}, subsystems: {}
  })),
  longTaskObserverSupported: false, longTasks: [], anomalies: [], runtimeErrors: []
};
const stable = sandbox.buildSessionSummaryForTest(stableSession).performanceDiagnosis;
assert.equal(stable.status, "no-major-drop-observed");
assert.equal(stable.primaryBottleneck, null);
assert.ok(stable.limitations.some(item => item.includes("GPU")), "Missing GPU measurements must be disclosed, never replaced by zero.");

const empty = sandbox.buildSessionSummaryForTest({ samples: [], longTasks: [], anomalies: [], runtimeErrors: [] }).performanceDiagnosis;
assert.equal(empty.status, "insufficient-data");
assert.equal(empty.primaryBottleneck, null);
console.log("post-match performance diagnosis: PASS");
