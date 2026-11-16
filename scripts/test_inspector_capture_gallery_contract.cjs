"use strict";
const fs=require("node:fs");
const assert=require("node:assert/strict");
const html=fs.readFileSync("inspector/index.html","utf8");
const live=fs.readFileSync("inspector/phase1-live.js","utf8");
const css=fs.readFileSync("inspector/style.css","utf8");
new Function(live.replace(/^import .*;\n/gm,""));
for(const id of ["captureGameScreenshot","captureVaultStatus","captureVaultGrid"])
 assert.ok(html.includes('id="'+id+'"'),"Screenshot gallery control missing: "+id);
for(const marker of ["elsn-inspector-capture-vault","indexedDB.open","saveScreenshotBlob","listScreenshots","deleteScreenshot","renderScreenshotVault","canvas.toBlob","image/png","No se ha guardado ninguna imagen"])
 assert.ok(live.includes(marker),"Screenshot persistence contract missing: "+marker);
for(const marker of [".capture-vault",".capture-vault-grid",".capture-vault-card",".capture-vault-empty"])
 assert.ok(css.includes(marker),"Screenshot gallery styling missing: "+marker);
assert.ok(/style\.css\?v=phase1-live-4/.test(html),"Screenshot gallery CSS must use a fresh cache version.");
assert.ok(/phase1-live\.js\?v=4/.test(html),"Screenshot gallery script must use a fresh cache version.");
console.log("Inspector persistent screenshot gallery contract: PASS");
