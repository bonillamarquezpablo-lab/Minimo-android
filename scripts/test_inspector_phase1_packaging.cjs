"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const inspectorHtmlPath = path.join("dist", "inspector", "index.html");
const liveModulePath = path.join("dist", "inspector", "phase1-live.js");
assert.ok(fs.existsSync(inspectorHtmlPath), "The Inspector HTML must be included in the Pages artifact.");
assert.ok(fs.existsSync(liveModulePath), "The live diagnostics module must be included in the Pages artifact.");

const html = fs.readFileSync(inspectorHtmlPath, "utf8");
const live = fs.readFileSync(liveModulePath, "utf8");
assert.ok(
  html.includes('type="module" src="phase1-live.js'),
  "The Inspector must load its live diagnostics module."
);
assert.ok(
  live.includes("frame.src = '../guest/' + query;"),
  "Live measurements must launch the same guest entry that players use."
);

const imports = [...live.matchAll(/from\\s+['"]([^'"]+\\.mjs)['"]/g)].map(match => match[1]);
assert.ok(imports.length >= 2, "The live diagnostics module must declare its ES module dependencies.");
for (const specifier of imports) {
  const relativeToInspector = path.posix.normalize(path.posix.join("inspector", specifier));
  const expected = path.join("dist", relativeToInspector);
  assert.ok(
    fs.existsSync(expected),
    "Missing published Inspector dependency: " + specifier + " -> " + expected
  );
}
for (const name of ["phase1-diagnostics-core.mjs", "phase2-world-inspection-core.mjs"]) {
  assert.ok(fs.existsSync(path.join("dist", "scripts", name)), "Missing packaged module: " + name);
}
console.log("Inspector Phase 1 dependencies and guest launch route: PASS");
