"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const serviceWorker = fs.readFileSync("sw.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");
const navigationSource = fs.readFileSync("scripts/nordic/navigation-suite.js", "utf8");

// A game shell cached for offline use must also preload every required navigation module.
assert.match(serviceWorker,
  /SHELL_FILES\s*=\s*\[[\s\S]*?"\.\/scripts\/nordic\/navigation-suite\.js"/,
  "The navigation suite must be part of the initial offline shell cache.");
assert.match(html,
  /<script\s+src=["']\.\/scripts\/nordic\/navigation-suite\.js["']\s+defer><\/script>/,
  "The game must load the navigation suite exactly as a deferred runtime module.");
assert.equal((html.match(/\.\/scripts\/nordic\/navigation-suite\.js/g) || []).length, 1,
  "The navigation suite must not be loaded more than once.");

const calls = [];
const clickHandlers = {};
const children = [];
const button = {
  id: "",
  type: "",
  textContent: "",
  attributes: {},
  addEventListener(type, handler) { clickHandlers[type] = handler; },
  setAttribute(name, value) { this.attributes[name] = value; }
};
const host = { appendChild(child) { children.push(child); } };
let readyHandler = null;
const body = { classList: { contains: () => false } };
const contextWindow = {
  BABYLON: {
    Engine: {
      Instances: [{
        scenes: [{ isDisposed: false, activeCamera: {} }]
      }]
    }
  },
  __ELSN_CAMERA_CONTROL: {
    setMode(mode) {
      calls.push(mode);
      return true;
    }
  }
};
const contextDocument = {
  readyState: "loading",
  body,
  addEventListener(type, handler) {
    if (type === "DOMContentLoaded") readyHandler = handler;
  },
  getElementById(id) {
    if (id === "quickActions") return host;
    if (id === "map") return {};
    return null;
  },
  createElement(tag) {
    assert.equal(tag, "button");
    return button;
  }
};
class MockMutationObserver {
  constructor(callback) { this.callback = callback; }
  observe() {}
}
const sandbox = {
  window: contextWindow,
  document: contextDocument,
  MutationObserver: MockMutationObserver,
  setTimeout() { throw new Error("Unexpected retry timer when the scene is already available."); },
  console
};

vm.runInNewContext(navigationSource, sandbox, { filename: "navigation-suite.js" });
assert.equal(typeof readyHandler, "function", "The module must wait for DOM readiness.");
readyHandler();

assert.deepEqual(calls, ["follow"], "The navigation suite must start in follow mode.");
assert.equal(children.length, 1, "Exactly one camera control must be attached to the existing quick actions.");
assert.equal(button.id, "cameraModeBtn");
assert.equal(button.textContent, "CÁMARA: SEGUIR");
assert.deepEqual(
  JSON.parse(JSON.stringify(contextWindow.__NorseNavigationSuite.getStatus())),
  { mode: "follow", originalMap: true, duplicateMap: false }
);

const expected = [
  ["free", "CÁMARA: LIBRE"],
  ["ship", "CÁMARA: NÁUTICA"],
  ["orbit", "CÁMARA: ORBITAL"],
  ["follow", "CÁMARA: SEGUIR"]
];
for (const [mode, label] of expected) {
  clickHandlers.click();
  assert.equal(contextWindow.__NorseNavigationSuite.state.mode, mode);
  assert.equal(button.textContent, label);
}
assert.deepEqual(calls, ["follow", "free", "ship", "orbit", "follow"]);
assert.equal(contextWindow.__NorseNavigationSuite.setMode("invalid"), false,
  "Unsupported camera modes must be rejected.");
assert.equal(children.length, 1, "Repeated module evaluation must not add another camera control.");

vm.runInNewContext(navigationSource, sandbox, { filename: "navigation-suite-second-load.js" });
assert.equal(children.length, 1, "The runtime guard must prevent duplicate navigation controls.");

console.log("NAVIGATION SUITE TESTS PASSED: offline precache, deferred load, four camera modes, original map and duplicate prevention.");
