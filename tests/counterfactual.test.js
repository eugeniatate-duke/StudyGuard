// tests/counterfactual.test.js
// Run from the repo root with:  node --test

const test = require("node:test");
const assert = require("node:assert/strict");
const { generateHint, looksLikeCode } = require("../counterfactual.js");
const { analyzePrompt } = require("../engine.js");

test("a passing prompt needs no advice", () => {
  const h = generateHint("Explain how recursion works");
  assert.equal(h.needed, false);
  assert.deepEqual(h.steps, []);
  assert.equal(h.message, "");
});

test("an empty prompt needs no advice", () => {
  assert.equal(generateHint("").needed, false);
});

test("blunt code request gets concrete steps that really pass", () => {
  const h = generateHint("Write a Python function for a binary search");
  assert.equal(h.needed, true);
  assert.equal(h.score, 15);
  assert.equal(h.gap, 35);
  assert.ok(h.steps.length >= 1);
  assert.equal(h.verified, true);
  assert.ok(h.projectedScore >= h.threshold);
  // the attempt box is the first thing we ask for
  assert.equal(h.steps[0].id, "attempt_field");
  assert.equal(h.steps[0].where, "attempt");
});

test("explains WHY it was blocked using the request signals", () => {
  const h = generateHint("Write a Python function for a binary search");
  assert.ok(h.whyBlocked.some((s) => s.id === "direct_code_request"));
});

test("offers a reword option naming the words that matter", () => {
  const h = generateHint("Write a Python function for a binary search");
  assert.ok(h.reword);
  assert.deepEqual(h.reword.words.map((w) => w.toLowerCase()).sort(), [
    "function",
    "write",
  ]);
});

test("non-code prompts are not told to paste an error log or code", () => {
  const h = generateHint("Give me the answer to question 3 for me");
  assert.equal(h.needed, true);
  const ids = h.steps.map((s) => s.id);
  assert.ok(!ids.includes("error_log"));
  assert.ok(!ids.includes("code_present"));
  assert.equal(h.verified, true);
});

test("code prompts can be told to paste the error", () => {
  const h = generateHint("Solve this program for me, my script crashes");
  assert.equal(h.needed, true);
  assert.ok(
    h.steps.some((s) => s.id === "error_log" || s.id === "attempt_field")
  );
  assert.equal(h.verified, true);
});

test("does not repeat advice for things the student already did", () => {
  // Already has a stuck point and an attempt-box note, but still asks outright.
  const h = generateHint("Give me the answer and the solution. I'm stuck.", {
    attempt: "I would try splitting it into two parts first",
  });
  const ids = h.steps.map((s) => s.id);
  assert.ok(!ids.includes("stuck_point"));
  assert.ok(!ids.includes("attempt_field"));
});

test("every plan verifies and is minimal (dropping any step fails)", () => {
  const prompts = [
    "Write a Python function for a binary search",
    "Give me the answer to question 3 for me",
    "Solve this for me and write a function",
    "Do my homework, give me the final answer",
  ];
  for (const p of prompts) {
    const h = generateHint(p);
    assert.equal(h.verified, true, `plan should verify for: ${p}`);
    assert.ok(h.steps.length >= 1);
    // Minimal: apply every step except one; the prompt must NOT pass.
    for (let i = 0; i < h.steps.length; i++) {
      const kept = h.steps.filter((_, j) => j !== i);
      const SUG = require("../counterfactual.js").SUGGESTIONS;
      const picked = kept.map((k) => SUG.find((x) => x.id === k.id));
      const promptAdds = picked
        .filter((x) => x.where === "prompt")
        .map((x) => x.example);
      const attemptAdds = picked
        .filter((x) => x.where === "attempt")
        .map((x) => x.example);
      const r = analyzePrompt([p, ...promptAdds].join(" "), {
        attempt: attemptAdds.join(" "),
      });
      assert.ok(r.score < 50, `step ${h.steps[i].id} is unnecessary for: ${p}`);
    }
  }
});

test("advice is verified by re-scoring with the example text added", () => {
  // Rebuild the plan by hand for one prompt and confirm the engine agrees.
  const prompt = "Write a Python function for a binary search";
  const h = generateHint(prompt);
  const attemptSteps = h.steps.filter((s) => s.where === "attempt");
  assert.ok(attemptSteps.length > 0);
  const rescored = analyzePrompt(prompt + " Here is my attempt so far.", {
    attempt: "First I would break the problem into smaller parts.",
  });
  assert.ok(rescored.score > h.score);
});

test("message is readable and lists numbered steps", () => {
  const h = generateHint("Write a Python function for a binary search");
  assert.match(h.message, /effort score is 15\/100/);
  assert.match(h.message, /\n1\. /);
});

test("looksLikeCode recognises programming wording", () => {
  assert.equal(looksLikeCode("fix my python loop"), true);
  assert.equal(looksLikeCode("what caused the French Revolution"), false);
});
