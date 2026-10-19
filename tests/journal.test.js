// tests/journal.test.js
// Tests for journal.js. Run from the repo root with:  node --test

const test = require("node:test");
const assert = require("node:assert/strict");

const { analyzePrompt } = require("../engine.js");
const { explainPrompt } = require("../perturbation.js");
const { generateHint } = require("../counterfactual.js");
const { buildMap } = require("../breakdownmap.js");
const {
  createJournal,
  makeEntry,
  MAX_ENTRIES,
  MAX_TEXT,
  JOURNAL_KEY,
} = require("../journal.js");

function fakeArea() {
  const data = {};
  return {
    async get(defaults) {
      return { ...defaults, ...data };
    },
    async set(obj) {
      Object.assign(data, obj);
    },
    async remove(key) {
      delete data[key];
    },
    _raw: () => data,
  };
}

function realMap(question, attempt = "") {
  const o = { attempt };
  return buildMap(
    analyzePrompt(question, o),
    explainPrompt(question, o),
    generateHint(question, o)
  );
}

test("journal: is OFF by default and saves nothing", async () => {
  const area = fakeArea();
  const j = createJournal(area);
  assert.equal(await j.isEnabled(), false);
  const stored = await j.add({ action: "held", question: "secret question" });
  assert.equal(stored, null);
  assert.deepEqual(await j.getAll(), []);
  assert.ok(!JSON.stringify(area._raw()).includes("secret"));
});

test("journal: saves entries once switched on, and stops when switched off", async () => {
  const j = createJournal(fakeArea(), () => 5);
  await j.setEnabled(true);
  assert.equal(await j.isEnabled(), true);
  const e = await j.add({
    action: "held",
    site: "ChatGPT",
    score: 15,
    question: "q1",
    attempt: "",
  });
  assert.equal(e.time, 5);
  await j.setEnabled(false);
  assert.equal(await j.add({ action: "held", question: "q2" }), null);
  assert.equal((await j.getAll()).length, 1); // earlier entry kept
});

test("journal: makeEntry captures the map and the student's words", async () => {
  const q = "Write a Python function for a binary search";
  const entry = makeEntry({
    action: "held",
    site: "ChatGPT",
    question: q,
    attempt: "",
    map: realMap(q),
  });
  assert.equal(entry.score, 15);
  assert.equal(entry.intent, "Direct code generation");
  assert.equal(entry.effort, "Absent");
  assert.deepEqual(entry.redWords, ["Write", "function"]);
  assert.ok(entry.advice.length >= 1);

  const j = createJournal(fakeArea());
  await j.setEnabled(true);
  const stored = await j.add(entry);
  assert.equal(stored.question, q);
  assert.equal(stored.threshold, 50);
});

test("journal: makeEntry copes with a missing map", () => {
  const entry = makeEntry({
    action: "passed",
    site: "Claude",
    question: "q",
    attempt: "a",
    map: null,
  });
  assert.equal(entry.score, null);
  assert.deepEqual(entry.redWords, []);
  assert.deepEqual(entry.advice, []);
});

test("journal: keeps only whitelisted fields and limits lengths", async () => {
  const area = fakeArea();
  const j = createJournal(area);
  await j.setEnabled(true);
  const stored = await j.add({
    action: "held",
    question: "x".repeat(MAX_TEXT + 500),
    attempt: "ok",
    password: "hunter2",
    cookies: "abc",
    advice: Array.from({ length: 30 }, (_, i) => "tip " + i),
  });
  assert.equal(stored.question.length, MAX_TEXT);
  assert.equal(stored.advice.length, 10);
  const raw = JSON.stringify(area._raw());
  assert.ok(!raw.includes("hunter2"));
  assert.ok(!raw.includes("cookies"));
});

test("journal: rejects unknown actions and clamps scores", async () => {
  const j = createJournal(fakeArea());
  await j.setEnabled(true);
  assert.equal(await j.add({ action: "hacked", question: "q" }), null);
  assert.equal((await j.add({ action: "passed", score: 900 })).score, 100);
  assert.equal((await j.add({ action: "passed", score: "abc" })).score, null);
});

test("journal: quick back-to-back entries are all kept", async () => {
  const j = createJournal(fakeArea());
  await j.setEnabled(true);
  await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      j.add({ action: "passed", question: "q" + i })
    )
  );
  assert.equal((await j.getAll()).length, 20);
});

test("journal: keeps only the newest MAX_ENTRIES", async () => {
  const area = fakeArea();
  await area.set({
    studyguardJournalOptIn: true,
    [JOURNAL_KEY]: Array.from({ length: MAX_ENTRIES }, (_, i) => ({
      time: i,
      action: "passed",
    })),
  });
  const j = createJournal(area, () => 99999);
  await j.add({ action: "held", question: "newest" });
  const all = await j.getAll();
  assert.equal(all.length, MAX_ENTRIES);
  assert.equal(all[all.length - 1].question, "newest");
  assert.equal(all[0].time, 1);
});

test("journal: clear removes entries but keeps the on/off choice", async () => {
  const j = createJournal(fakeArea());
  await j.setEnabled(true);
  await j.add({ action: "passed", question: "q" });
  await j.clear();
  assert.deepEqual(await j.getAll(), []);
  assert.equal(await j.isEnabled(), true);
});
