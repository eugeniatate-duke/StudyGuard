// tests/journalexport.test.js
// Tests for journalexport.js. Run from the repo root with:  node --test

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildReport,
  toMarkdown,
  describeOutcome,
} = require("../journalexport.js");

const MIN = 60 * 1000;
const fmt = (t) => "T" + t;

function entry(time, action, extra = {}) {
  return {
    time,
    action,
    site: "ChatGPT",
    score: 15,
    threshold: 50,
    intent: "Direct code generation",
    effort: "Absent",
    question: "Write a Python function for a binary search",
    attempt: "",
    redWords: ["Write", "function"],
    advice: ["Add 5 words of your own approach."],
    ...extra,
  };
}

test("report: groups entries into sessions by a 30 minute gap", () => {
  const r = buildReport([
    entry(0, "held"),
    entry(10 * MIN, "passed"),
    entry(100 * MIN, "held"),
  ]);
  assert.equal(r.sessions.length, 2);
  assert.equal(r.sessions[0].steps.length, 2);
  assert.equal(r.sessions[1].steps.length, 1);
  assert.deepEqual(
    r.sessions.map((s) => s.steps.map((x) => x.n)),
    [[1, 2], [3]]
  );
});

test("report: sorts entries by time even if given out of order", () => {
  const r = buildReport([entry(5 * MIN, "passed"), entry(0, "held")]);
  assert.deepEqual(
    r.sessions[0].steps.map((s) => s.action),
    ["held", "passed"]
  );
});

test("report: summary counts outcomes and recoveries", () => {
  const r = buildReport([
    entry(0, "held"),
    entry(MIN, "passed", { score: 52 }), // recovery
    entry(2 * MIN, "held"),
    entry(3 * MIN, "sent_anyway"), // not a recovery
    entry(4 * MIN, "passed", { score: 80 }),
  ]);
  assert.deepEqual(r.summary, {
    total: 5,
    sessions: 1,
    passed: 2,
    held: 2,
    sentAnyway: 1,
    recoveries: 1,
  });
});

test("outcome: describes what happened after a hold", () => {
  const held = { action: "held", score: 15 };
  assert.match(
    describeOutcome(held, { action: "passed", score: 52 }),
    /own thinking.*15 \u2192 52/
  );
  assert.match(
    describeOutcome(held, { action: "sent_anyway", score: 15 }),
    /send anyway/i
  );
  assert.match(
    describeOutcome(held, { action: "held", score: 30 }),
    /Revised.*15 \u2192 30.*still held/
  );
  assert.match(describeOutcome(held, null), /No further step/);
  assert.match(describeOutcome({ action: "passed" }, null), /Sent normally/);
});

test("report: a hold in one session is not linked to the next session", () => {
  const r = buildReport([entry(0, "held"), entry(200 * MIN, "passed")]);
  assert.equal(r.summary.recoveries, 0);
  assert.match(r.sessions[0].steps[0].outcome, /No further step/);
});

test("report: copes with missing scores and an empty journal", () => {
  const r = buildReport([entry(0, "held", { score: null, threshold: null })]);
  assert.equal(r.sessions[0].steps[0].score, null);
  const md = toMarkdown(r, { formatTime: fmt });
  assert.match(md, /Held \(score \?, needs \?\)/);

  const empty = toMarkdown(buildReport([]), { formatTime: fmt });
  assert.match(empty, /No journal entries yet/);
});

test("markdown: has the key sections and the student's own words", () => {
  const r = buildReport(
    [
      entry(0, "held"),
      entry(MIN, "passed", {
        score: 52,
        attempt: "Compare the middle element, then halve the range",
      }),
    ],
    {
      studentName: "Eugenia",
      assignment: "HW 3",
      version: "0.7.0",
      exportedAt: 999,
    }
  );
  const md = toMarkdown(r, { formatTime: fmt });
  assert.match(md, /^# XAI Learning Journal/);
  assert.match(md, /\*\*Student:\*\* Eugenia/);
  assert.match(md, /\*\*Assignment:\*\* HW 3/);
  assert.match(md, /StudyGuard v0\.7\.0/);
  assert.match(md, /## Session 1/);
  assert.match(md, /### Step 1: Held \(score 15, needs 50\)/);
  assert.match(md, /### Step 2: Sent \(score 52\)/);
  assert.match(md, /> Write a Python function for a binary search/);
  assert.match(md, /> Compare the middle element, then halve the range/);
  assert.match(md, /Direct code generation; my visible effort: Absent/);
  assert.match(md, /Write, function/);
  assert.match(md, /Added my own thinking and sent it \(score 15 \u2192 52\)/);
  assert.match(md, /## My reflection/);
  assert.match(md, /not probabilities/);
});

test("markdown: multi-line text is fully quoted so it cannot fake headings", () => {
  const r = buildReport([
    entry(0, "held", { question: "line one\n# Fake heading\n- fake item" }),
  ]);
  const md = toMarkdown(r, { formatTime: fmt });
  assert.match(md, /> line one\n> # Fake heading\n> - fake item/);
  assert.ok(!/^# Fake heading/m.test(md));
});

test("markdown: omits name and assignment lines when not given", () => {
  const md = toMarkdown(buildReport([entry(0, "passed")]), { formatTime: fmt });
  assert.ok(!md.includes("**Student:**"));
  assert.ok(!md.includes("**Assignment:**"));
});
