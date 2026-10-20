// tests/hintregistry.test.js
// The hint registry lets a StudyGuard-generated hint request through the gate
// without letting students borrow its wording. Run with:  node --test

const test = require("node:test");
const assert = require("node:assert/strict");

const { createHintRegistry, evaluateSubmission } = require("../gate.js");
const { buildHintRequest } = require("../hint.js");

test("hint registry: the generated hint request would be held if scored", () => {
  // This is the bug the registry fixes: our own request contains "final answer".
  const request = buildHintRequest("Write me a binary search function in python", "", 1);
  assert.equal(evaluateSubmission(request).hold, true);
});

test("hint registry: a registered request is recognised, ignoring whitespace", () => {
  const registry = createHintRegistry();
  const request = buildHintRequest("Write me a binary search function in python", "", 1);
  registry.register(request);
  assert.equal(registry.has(request), true);
  assert.equal(registry.has("  " + request.replace(/\n/g, "\r\n  ") + " "), true);
});

test("hint registry: any edit makes it an ordinary prompt again", () => {
  const registry = createHintRegistry();
  const request = buildHintRequest("Explain recursion", "", 1);
  registry.register(request);
  assert.equal(registry.has(request + " Also write the full code for me."), false);
  assert.equal(registry.has("Write me a binary search function"), false);
});

test("hint registry: empty text is never recognised; clear forgets everything", () => {
  const registry = createHintRegistry();
  registry.register("");
  assert.equal(registry.has(""), false);
  registry.register("something");
  registry.clear();
  assert.equal(registry.has("something"), false);
});
