/**
 * analytics.js - StudyGuard analytics calculations (Step 9)
 *
 * WHAT THIS FILE DOES
 * Turns the always-on event log (eventlog.js: time, site, action, score,
 * signal ids; never any text) into the numbers the dashboard draws:
 *
 *   summarize(events, options)  ->  counts, rates, daily series, score
 *                                   histogram, most common signals
 *   toCsv(events)               ->  a spreadsheet-ready CSV string
 *
 * HOW TO READ THE RATES (they are about behaviour, not learning)
 *   holdRate         held / all recorded submit attempts
 *   sendAnywayRate   "send anyway" / held   (how often a hold was overridden)
 *   recoveryRate     held attempts followed within 30 minutes by a normal send
 *                    / held   (a rough sign the advice was acted on)
 * A message that is held and then retried counts each time it is attempted.
 * These numbers do not show that anyone learned anything; the evaluation plan
 * (docs/evaluation-plan.md) covers what they can and cannot support.
 *
 * No DOM code, so it runs in Chrome and in Node tests.
 */
(function () {
  const ACTIONS = ["passed", "held", "sent_anyway"];
  const RECOVERY_WINDOW_MS = 30 * 60 * 1000;
  const HISTOGRAM_BUCKETS = 10; // 0-9, 10-19, ... 90-100

  const ratio = (n, d) => (d > 0 ? n / d : null);

  /** Local calendar day as "YYYY-MM-DD". */
  function dayKey(time) {
    const d = new Date(time);
    const pad = (n) => String(n).padStart(2, "0");
    return (
      d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate())
    );
  }

  /** Round to a whole percent for display, or null. */
  function percent(value) {
    return value === null || value === undefined
      ? null
      : Math.round(value * 100);
  }

  /**
   * @param {object[]} events  from eventlog.getAll()
   * @param {object} [options] { now, days (default 14), signalInfo: {id: {label, kind}} }
   */
  function summarize(events, options = {}) {
    const now = options.now !== undefined ? options.now : Date.now();
    const days = options.days || 14;
    const info = options.signalInfo || {};
    const sorted = [...(events || [])]
      .filter((e) => e && ACTIONS.includes(e.action))
      .sort((a, b) => a.time - b.time);

    const counts = { passed: 0, held: 0, sent_anyway: 0 };
    const scoreSums = { passed: 0, held: 0 };
    const scoreCounts = { passed: 0, held: 0 };
    const signalCounts = new Map();
    const bySite = {};
    const histogram = Array.from({ length: HISTOGRAM_BUCKETS }, (_, i) => ({
      from: i * 10,
      to: i === HISTOGRAM_BUCKETS - 1 ? 100 : i * 10 + 9,
      count: 0,
    }));

    // Daily series, zero-filled for the last `days` calendar days.
    const daily = [];
    const dailyIndex = new Map();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = dayKey(d.getTime());
      dailyIndex.set(key, daily.length);
      daily.push({ date: key, passed: 0, held: 0, sent_anyway: 0 });
    }

    let recoveries = 0;
    sorted.forEach((event, i) => {
      counts[event.action]++;
      bySite[event.site] = (bySite[event.site] || 0) + 1;

      if (typeof event.score === "number" && Number.isFinite(event.score)) {
        if (event.action in scoreSums) {
          scoreSums[event.action] += event.score;
          scoreCounts[event.action]++;
        }
        const bucket = Math.min(
          HISTOGRAM_BUCKETS - 1,
          Math.max(0, Math.floor(event.score / 10))
        );
        histogram[bucket].count++;
      }
      (event.signalIds || []).forEach((id) =>
        signalCounts.set(id, (signalCounts.get(id) || 0) + 1)
      );

      const idx = dailyIndex.get(dayKey(event.time));
      if (idx !== undefined) daily[idx][event.action]++;

      const next = sorted[i + 1];
      if (
        event.action === "held" &&
        next &&
        next.action === "passed" &&
        next.time - event.time <= RECOVERY_WINDOW_MS
      ) {
        recoveries++;
      }
    });

    const total = sorted.length;
    const avg = (key) =>
      scoreCounts[key] ? Math.round(scoreSums[key] / scoreCounts[key]) : null;

    const topSignals = [...signalCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 6)
      .map(([id, count]) => ({
        id,
        label: (info[id] && info[id].label) || id.replace(/_/g, " "),
        kind: (info[id] && info[id].kind) || "",
        count,
      }));

    return {
      total,
      counts,
      holdRate: ratio(counts.held, total),
      sendAnywayRate: ratio(counts.sent_anyway, counts.held),
      recoveries,
      recoveryRate: ratio(recoveries, counts.held),
      avgScore: { passed: avg("passed"), held: avg("held") },
      daily,
      histogram,
      topSignals,
      bySite,
    };
  }

  /** CSV-safe cell: quotes doubled, formula-looking text neutralised. */
  function csvCell(value) {
    let text = value === null || value === undefined ? "" : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  /** The raw event log as CSV: time, site, action, score, signals. */
  function toCsv(events) {
    const rows = ["time,site,action,score,signals"];
    [...(events || [])]
      .sort((a, b) => a.time - b.time)
      .forEach((e) => {
        rows.push(
          [
            new Date(e.time).toISOString(),
            e.site,
            e.action,
            e.score,
            (e.signalIds || []).join(";"),
          ]
            .map(csvCell)
            .join(",")
        );
      });
    return rows.join("\n") + "\n";
  }

  const api = { summarize, toCsv, dayKey, percent, HISTOGRAM_BUCKETS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else globalThis.StudyGuardAnalytics = api;
})();
