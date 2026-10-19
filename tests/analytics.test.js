// tests/analytics.test.js
// Tests for analytics.js. Run from the repo root with:  node --test

const test = require("node:test");
const assert = require("node:assert/strict");

const { summarize, toCsv, dayKey, percent } = require("../analytics.js");

const MIN = 60 * 1000;
// Local-time constructors keep these tests independent of the machine's timezone.
const NOW = new Date(2026, 9, 19, 12, 0, 0).getTime();
const at = (day, hour, minute = 0) =>
  new Date(2026, 9, day, hour, minute, 0).getTime();

function ev(time, action, score, extra = {}) {
  return { time, site: "ChatGPT", action, score, signalIds: [], ...extra };
}

test("summarize: counts outcomes and computes the three rates", () => {
  const s = summarize(
    [
      ev(at(19, 9, 0), "held", 15),
      ev(at(19, 9, 5), "passed", 52), // recovery (within 30 min)
      ev(at(19, 10, 0), "held", 15),
      ev(at(19, 10, 1), "sent_anyway", 15),
      ev(at(19, 11, 0), "passed", 80),
    ],
    { now: NOW }
  );
  assert.deepEqual(s.counts, { passed: 2, held: 2, sent_anyway: 1 });
  assert.equal(s.total, 5);
  assert.equal(s.holdRate, 2 / 5);
  assert.equal(s.sendAnywayRate, 1 / 2);
  assert.equal(s.recoveries, 1);
  assert.equal(s.recoveryRate, 1 / 2);
});

test("summarize: a recovery needs the next message within 30 minutes", () => {
  const s = summarize(
    [ev(at(19, 9, 0), "held", 15), ev(at(19, 10, 0), "passed", 60)],
    { now: NOW }
  );
  assert.equal(s.recoveries, 0);
});

test("summarize: rates are null (not 0) when there is nothing to divide by", () => {
  const empty = summarize([], { now: NOW });
  assert.equal(empty.total, 0);
  assert.equal(empty.holdRate, null);
  assert.equal(empty.sendAnywayRate, null);
  assert.equal(empty.recoveryRate, null);
  assert.equal(percent(empty.holdRate), null);
  assert.equal(percent(0.5), 50);

  const noHolds = summarize([ev(at(19, 9), "passed", 70)], { now: NOW });
  assert.equal(noHolds.sendAnywayRate, null);
});

test("summarize: daily series is zero-filled, ordered, and ends today", () => {
  const s = summarize(
    [ev(at(19, 9), "held", 15), ev(at(17, 9), "passed", 70)],
    { now: NOW, days: 5 }
  );
  assert.equal(s.daily.length, 5);
  assert.deepEqual(
    s.daily.map((d) => d.date),
    ["2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18", "2026-10-19"]
  );
  assert.equal(s.daily[4].held, 1);
  assert.equal(s.daily[2].passed, 1);
  assert.equal(s.daily[3].passed + s.daily[3].held, 0);
});

test("summarize: events outside the daily window still count in the totals", () => {
  const s = summarize([ev(at(1, 9), "passed", 70)], { now: NOW, days: 3 });
  assert.equal(s.total, 1);
  assert.equal(
    s.daily.reduce((n, d) => n + d.passed, 0),
    0
  );
});

test("summarize: score histogram puts 50 on the pass side and clamps 100", () => {
  const s = summarize(
    [
      ev(at(19, 9), "held", 49),
      ev(at(19, 9, 1), "passed", 50),
      ev(at(19, 9, 2), "passed", 100),
      ev(at(19, 9, 3), "held", 0),
      ev(at(19, 9, 4), "held", null),
    ],
    { now: NOW }
  );
  assert.equal(s.histogram.length, 10);
  assert.equal(s.histogram[4].count, 1); // 40-49
  assert.equal(s.histogram[5].count, 1); // 50-59
  assert.equal(s.histogram[9].count, 1); // 90-100
  assert.equal(s.histogram[0].count, 1);
  assert.equal(
    s.histogram.reduce((n, b) => n + b.count, 0),
    4
  ); // null score skipped
});

test("summarize: average scores by outcome", () => {
  const s = summarize(
    [
      ev(at(19, 9), "held", 10),
      ev(at(19, 9, 1), "held", 20),
      ev(at(19, 9, 2), "passed", 71),
    ],
    { now: NOW }
  );
  assert.equal(s.avgScore.held, 15);
  assert.equal(s.avgScore.passed, 71);
});

test("summarize: top signals are ranked, labelled, and capped at six", () => {
  const events = [];
  for (let i = 0; i < 3; i++)
    events.push(
      ev(at(19, 9, i), "held", 15, { signalIds: ["direct_code_request"] })
    );
  events.push(
    ev(at(19, 10), "passed", 70, {
      signalIds: ["why_question", "code_present"],
    })
  );
  ["a", "b", "c", "d", "e"].forEach((id, i) =>
    events.push(ev(at(19, 11, i), "passed", 60, { signalIds: [id] }))
  );
  const s = summarize(events, {
    now: NOW,
    signalInfo: {
      direct_code_request: {
        label: "Direct request to produce code",
        kind: "request",
      },
    },
  });
  assert.equal(s.topSignals.length, 6);
  assert.equal(s.topSignals[0].id, "direct_code_request");
  assert.equal(s.topSignals[0].count, 3);
  assert.equal(s.topSignals[0].label, "Direct request to produce code");
  assert.equal(s.topSignals[0].kind, "request");
  assert.equal(s.topSignals[1].label.includes("_"), false); // fallback label is readable
});

test("summarize: ignores malformed events and tallies sites", () => {
  const s = summarize(
    [
      null,
      { time: 1, action: "hacked" },
      ev(at(19, 9), "passed", 70, { site: "Claude" }),
    ],
    { now: NOW }
  );
  assert.equal(s.total, 1);
  assert.deepEqual(s.bySite, { Claude: 1 });
});

test("csv: header, one row per event, oldest first", () => {
  const csv = toCsv([
    ev(Date.UTC(2026, 9, 19, 17, 5), "passed", 70, { signalIds: ["a", "b"] }),
    ev(Date.UTC(2026, 9, 19, 17, 0), "held", 15, {
      signalIds: ["direct_code_request"],
    }),
  ]);
  const lines = csv.trim().split("\n");
  assert.equal(lines[0], "time,site,action,score,signals");
  assert.equal(
    lines[1],
    "2026-10-19T17:00:00.000Z,ChatGPT,held,15,direct_code_request"
  );
  assert.equal(lines[2], "2026-10-19T17:05:00.000Z,ChatGPT,passed,70,a;b");
});

test("csv: quotes commas and neutralises spreadsheet formulas", () => {
  const csv = toCsv([
    ev(0, "held", null, { site: '=HYPERLINK("x"),bad', signalIds: [] }),
  ]);
  assert.match(csv, /"'=HYPERLINK\(""x""\),bad"/);
  assert.match(csv, /,held,,/); // null score is an empty cell
});

test("dayKey: formats local dates with zero padding", () => {
  assert.equal(dayKey(new Date(2026, 0, 5, 12).getTime()), "2026-01-05");
});
