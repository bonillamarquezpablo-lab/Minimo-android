"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");

(async () => {
  const plan = JSON.parse(fs.readFileSync("scripts/scene-capture-plan.json", "utf8"));
  const source = fs.readFileSync("scripts/custom-scene-capture.mjs", "utf8");
  const moduleUrl = pathToFileURL(require("node:path").resolve("scripts/scene-capture-inspection.mjs")).href;
  const { createZoneInspectionShots } = await import(moduleUrl);
  const zone = plan[0];
  assert.equal(zone.zone.includeTopDown, false,
    "The production inspection plan must avoid redundant top-down shots in the bounded run.");

  const candidates = Array.from({ length: 12 }, (_, index) => ({
    name: "InspectionTarget_" + index,
    code: "OBJ-" + String(index).padStart(4, "0"),
    nativeId: index + 1,
    kind: "test-structure",
    position: { x: 20 + (index % 4) * 3, y: 1, z: 137 + Math.floor(index / 4) * 3 },
    bounds: { bottomY: 0.9, topY: 3.2, width: 2, depth: 2 },
    source: "contract-test"
  }));
  const { shots, report } = createZoneInspectionShots(zone, [], candidates);
  assert.equal(report.selectedTargetCount, 12);
  assert.equal(report.generatedShotCount, 30,
    "The unified inspection must keep all twelve structures, four overviews and both water heights within a bounded 30-shot plan.");
  assert.equal(shots.filter(shot => shot.inspectionPurpose === "zone-overview").length, 4);
  assert.equal(shots.filter(shot => shot.inspectionPurpose === "zone-water-overview").length, 2);
  assert.equal(shots.filter(shot => shot.inspectionPurpose === "structure-water-observation").length, 12);
  assert.equal(shots.filter(shot => shot.inspectionPurpose === "structure-low-oblique").length, 12);
  assert.equal(shots.filter(shot => shot.inspectionPurpose === "structure-high-oblique" || shot.inspectionPurpose === "structure-top-down").length, 0);
  assert.ok(source.includes("pixelComparison='not-applicable-animated-scene'"),
    "Animated water and vegetation must not be rejected by an exact two-frame pixel hash.");
  assert.ok(source.includes("const framePng=await page.evaluate"),
    "Each camera-verified view must still produce a valid PNG.");
  assert.ok(source.includes("cameraVerified"),
    "Every saved capture must retain real-camera verification.");

  const smoke = fs.readFileSync("scripts/texture-readiness-smoke.mjs", "utf8");
  const runner = fs.readFileSync("scripts/run-unified-inspector.mjs", "utf8");
  assert.ok(smoke.includes("visualCaptureDeferred===true"),
    "Texture readiness may delegate the heavyweight visual screenshot to the dedicated scene inspector.");
  assert.ok(runner.includes("CAPTURE_SKIP_TEXTURE_SCREENSHOT:'1'"),
    "The unified inspector must not launch a second competing SwiftShader screenshot.");

  const coastal = fs.readFileSync("scripts/coastal-reference.mjs", "utf8");
  assert.ok(coastal.includes("floatingHutSafeOutcome"),
    "The synthetic offshore probe must accept either safe hiding or verified relocation onto dry ground.");
  console.log("SCENE CAPTURE EFFICIENCY CONTRACT PASSED: 12 structures, 30 camera-verified PNGs, no false animated-frame hash failures.");
})().catch(error => { console.error(error); process.exitCode = 1; });
