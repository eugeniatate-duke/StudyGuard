// tests/step4.test.js
// Tests for sites.js, gate.js, interceptor.js and eventlog.js.
// Run from the repo root with:  node --test

const test = require("node:test");
const assert = require("node:assert/strict");

const Sites = require("../sites.js");
const { evaluateSubmission } = require("../gate.js");
const { makeHandlers } = require("../interceptor.js");
const { createEventLog, MAX_EVENTS, LOG_KEY } = require("../eventlog.js");

// ---------- sites.js ----------

test("sites: recognises ChatGPT and Claude, rejects others", () => {
  assert.equal(Sites.getAdapter("chatgpt.com").name, "ChatGPT");
  assert.equal(Sites.getAdapter("www.chatgpt.com").name, "ChatGPT");
  assert.equal(Sites.getAdapter("claude.ai").name, "Claude");
  assert.equal(Sites.getAdapter("example.com"), null);
  assert.equal(Sites.getAdapter("notchatgpt.com"), null);
  assert.equal(Sites.getAdapter(""), null);
});

test("sites: every adapter has the selector lists it needs", () => {
  for (const a of Object.values(Sites.ADAPTERS)) {
    assert.ok(a.inputSelectors.length > 0);
    assert.ok(a.sendButtonSelectors.length > 0);
    assert.ok(a.anchorSelectors.length > 0);
  }
});

function fakeButton({
  matches = false,
  label = "",
  testid = "",
  id = "",
} = {}) {
  return {
    matches: () => matches,
    getAttribute: (n) => (n === "aria-label" ? label : null),
    dataset: { testid },
    id,
  };
}

test("sites: isSendButton uses selectors or send/submit labels", () => {
  const a = Sites.getAdapter("claude.ai");
  assert.equal(Sites.isSendButton(a, fakeButton({ matches: true })), true);
  assert.equal(
    Sites.isSendButton(a, fakeButton({ label: "Send message" })),
    true
  );
  assert.equal(
    Sites.isSendButton(a, fakeButton({ testid: "composer-submit" })),
    true
  );
  assert.equal(
    Sites.isSendButton(a, fakeButton({ label: "Attach file" })),
    false
  );
  assert.equal(Sites.isSendButton(a, null), false);
});

// ---------- gate.js ----------

test("gate: holds a blunt request with a readable reason", () => {
  const v = evaluateSubmission("Write a Python function for a binary search");
  assert.equal(v.hold, true);
  assert.match(v.reason, /15\/100/);
  assert.match(v.reason, /direct request to produce code/);
  assert.match(v.reason, /send anyway/i);
});

test("gate: lets a good prompt through with no reason", () => {
  const v = evaluateSubmission(
    "Why does this error happen? I'm stuck on line 4"
  );
  assert.equal(v.hold, false);
  assert.equal(v.reason, "");
});

test("gate: never holds an empty message", () => {
  assert.equal(evaluateSubmission("").hold, false);
  assert.equal(evaluateSubmission("   ").hold, false);
});

test("gate: the attempt box can unlock a held prompt", () => {
  const q = "Write a Python function for a binary search";
  assert.equal(evaluateSubmission(q).hold, true);
  const unlocked = evaluateSubmission(q, {
    attempt:
      "I think I should compare the middle element and then halve the range",
  });
  assert.equal(unlocked.hold, false);
});

// ---------- interceptor.js ----------

function makeEvent(overrides = {}) {
  const calls = { prevented: 0, stopped: 0, stoppedImmediate: 0 };
  return {
    calls,
    key: "Enter",
    shiftKey: false,
    isComposing: false,
    keyCode: 13,
    target: {},
    preventDefault: () => calls.prevented++,
    stopPropagation: () => calls.stopped++,
    stopImmediatePropagation: () => calls.stoppedImmediate++,
    ...overrides,
  };
}

function setup({ hold = true, inside = false, isSend = true } = {}) {
  const inputEl = { contains: (t) => t === inputEl || t.inInput === true };
  const submits = [];
  const handlers = makeHandlers({
    getInput: () => inputEl,
    isSendButton: () => isSend,
    isInsidePanel: () => inside,
    onSubmit: (info) => {
      submits.push(info.source);
      return { hold };
    },
  });
  return { handlers, inputEl, submits };
}

test("interceptor: Enter in the message box is held when the callback says hold", () => {
  const { handlers, inputEl, submits } = setup({ hold: true });
  const e = makeEvent({ target: inputEl });
  handlers.keydown(e);
  assert.deepEqual(submits, ["enter"]);
  assert.equal(e.calls.prevented, 1);
  assert.equal(e.calls.stopped, 1);
  assert.equal(e.calls.stoppedImmediate, 1);
});

test("interceptor: Enter passes through when the callback says allow", () => {
  const { handlers, inputEl } = setup({ hold: false });
  const e = makeEvent({ target: inputEl });
  handlers.keydown(e);
  assert.equal(e.calls.prevented, 0);
});

test("interceptor: Shift+Enter, IME composition and other keys are ignored", () => {
  const { handlers, inputEl, submits } = setup();
  handlers.keydown(makeEvent({ target: inputEl, shiftKey: true }));
  handlers.keydown(makeEvent({ target: inputEl, isComposing: true }));
  handlers.keydown(makeEvent({ target: inputEl, keyCode: 229 }));
  handlers.keydown(makeEvent({ target: inputEl, key: "a" }));
  assert.deepEqual(submits, []);
});

test("interceptor: Enter outside the message box is ignored", () => {
  const { handlers, submits } = setup();
  handlers.keydown(makeEvent({ target: { inInput: false } }));
  assert.deepEqual(submits, []);
});

test("interceptor: clicking Send is held; clicking other buttons is not", () => {
  const sendBtn = {};
  const target = { closest: () => sendBtn };
  const a = setup({ hold: true, isSend: true });
  const e1 = makeEvent({ target });
  a.handlers.click(e1);
  assert.deepEqual(a.submits, ["click"]);
  assert.equal(e1.calls.prevented, 1);

  const b = setup({ isSend: false });
  b.handlers.click(makeEvent({ target }));
  assert.deepEqual(b.submits, []);
});

test("interceptor: clicks inside the StudyGuard panel are ignored", () => {
  const { handlers, submits } = setup({ inside: true });
  handlers.click(makeEvent({ target: { closest: () => ({}) } }));
  assert.deepEqual(submits, []);
});

test("interceptor: fails open if the callback throws", () => {
  const inputEl = { contains: () => true };
  const handlers = makeHandlers({
    getInput: () => inputEl,
    isSendButton: () => true,
    isInsidePanel: () => false,
    onSubmit: () => {
      throw new Error("boom");
    },
  });
  const origError = console.error;
  console.error = () => {}; // silence the expected log
  const e = makeEvent({ target: inputEl });
  handlers.keydown(e);
  console.error = origError;
  assert.equal(e.calls.prevented, 0); // message was NOT trapped
});

// ---------- eventlog.js ----------

function fakeArea() {
  let data = {};
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

test("eventlog: stores a clean event", async () => {
  const log = createEventLog(fakeArea(), () => 1000);
  const stored = await log.add({
    action: "held",
    site: "ChatGPT",
    score: 15,
    signalIds: ["direct_code_request"],
  });
  assert.deepEqual(stored, {
    time: 1000,
    site: "ChatGPT",
    action: "held",
    score: 15,
    signalIds: ["direct_code_request"],
  });
  assert.equal((await log.getAll()).length, 1);
});

test("eventlog: never stores prompt text or unknown fields", async () => {
  const area = fakeArea();
  const log = createEventLog(area);
  await log.add({
    action: "held",
    score: 15,
    question: "my secret homework question",
    attempt: "my private attempt",
    text: "more text",
    signalIds: [],
  });
  const raw = JSON.stringify(area._raw());
  assert.ok(!raw.includes("secret"));
  assert.ok(!raw.includes("private"));
  assert.ok(!raw.includes("more text"));
});

test("eventlog: rejects unknown actions and clamps scores", async () => {
  const log = createEventLog(fakeArea());
  assert.equal(await log.add({ action: "hacked", score: 5 }), null);
  const e = await log.add({ action: "passed", score: 500 });
  assert.equal(e.score, 100);
  const f = await log.add({ action: "passed", score: "abc" });
  assert.equal(f.score, null);
});

test("eventlog: quick back-to-back events are all kept", async () => {
  const log = createEventLog(fakeArea());
  await Promise.all(
    Array.from({ length: 25 }, (_, i) =>
      log.add({ action: "passed", score: i })
    )
  );
  assert.equal((await log.getAll()).length, 25);
});

test("eventlog: keeps only the newest MAX_EVENTS", async () => {
  const area = fakeArea();
  await area.set({
    [LOG_KEY]: Array.from({ length: MAX_EVENTS }, (_, i) => ({
      time: i,
      site: "x",
      action: "passed",
      score: 50,
      signalIds: [],
    })),
  });
  const log = createEventLog(area, () => 999999);
  await log.add({ action: "held", score: 10 });
  const all = await log.getAll();
  assert.equal(all.length, MAX_EVENTS);
  assert.equal(all[all.length - 1].time, 999999);
  assert.equal(all[0].time, 1); // the oldest (time 0) was dropped
});

test("eventlog: clear removes everything", async () => {
  const log = createEventLog(fakeArea());
  await log.add({ action: "passed", score: 50 });
  await log.clear();
  assert.deepEqual(await log.getAll(), []);
});
