/**
 * dashboard.js - the StudyGuard analytics dashboard (Step 9)
 *
 * WHAT THIS FILE DOES
 * Runs on the extension's own dashboard.html. It reads the always-on event log
 * (scores, outcomes and rule names only, never any text), summarises it with
 * analytics.js and draws:
 *   - four headline numbers (total, hold rate, sent-anyway rate, recovery rate)
 *   - daily outcomes (stacked bars, last 14 days)
 *   - the spread of effort scores, split at the pass mark
 *   - which rules fire most
 * plus Export CSV, Print / Save as PDF, "Show data tables" and a clear button.
 *
 * Charts are plain inline SVG/HTML, with no external libraries. Colour is never
 * the only cue: every chart has a legend or labels, numbers are written out,
 * and "Show data tables" gives the same data as tables.
 * All text is added with textContent, never innerHTML.
 */
(function () {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const root = document.getElementById("dashboard");
  const eventLog = StudyGuardEventLog.createEventLog(chrome.storage.local);

  // id -> {label, kind} from the engine, so the signals chart reads in plain English.
  const signalInfo = {};
  (StudyGuardEngine.SIGNALS || []).forEach((s) => {
    signalInfo[s.id] = { label: s.label, kind: s.kind };
  });

  const OUTCOMES = [
    { key: "passed", label: "Sent normally", cls: 1 },
    { key: "held", label: "Held", cls: 2 },
    { key: "sent_anyway", label: "Sent anyway", cls: 3 },
  ];

  let events = [];

  // ---------- small helpers ----------
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function svg(tag, attrs, text) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, v));
    if (text !== undefined) node.textContent = text;
    return node;
  }

  const pct = (value) => {
    const p = StudyGuardAnalytics.percent(value);
    return p === null ? "\u2013" : p + "%";
  };

  function legend(items) {
    const box = el("div", "legend");
    items.forEach((item) => {
      const entry = el("span");
      const swatch = el("span", "sw sw-" + item.cls);
      entry.append(swatch, item.text);
      box.append(entry);
    });
    return box;
  }

  function makeTable(headers, rows) {
    const table = el("table");
    const head = el("tr");
    headers.forEach((h) => head.append(el("th", "", h)));
    table.append(head);
    rows.forEach((row) => {
      const tr = el("tr");
      row.forEach((cell) => tr.append(el("td", "", String(cell))));
      table.append(tr);
    });
    return table;
  }

  function niceMax(m) {
    if (m <= 4) return 4;
    return Math.ceil(m / 2) * 2; // even, so the half-way gridline is a whole number
  }

  // Draw y gridlines at 0, half and max, with labels.
  function yGrid(chart, plot, yMax) {
    [0, yMax / 2, yMax].forEach((tick) => {
      const y = plot.top + plot.h - (tick / yMax) * plot.h;
      chart.append(
        svg("line", {
          class: "grid",
          x1: plot.left,
          x2: plot.left + plot.w,
          y1: y,
          y2: y,
        })
      );
      chart.append(
        svg(
          "text",
          { x: plot.left - 6, y: y + 4, "text-anchor": "end" },
          String(tick)
        )
      );
    });
  }

  function shortDate(key) {
    const [, m, d] = key.split("-");
    return Number(m) + "/" + Number(d);
  }

  // ---------- sections ----------
  function tiles(summary) {
    const holds = summary.counts.held;
    const data = [
      { value: String(summary.total), label: "Submit attempts recorded" },
      {
        value: pct(summary.holdRate),
        label: "Held for more effort (" + holds + " of " + summary.total + ")",
      },
      {
        value: pct(summary.sendAnywayRate),
        label:
          "Of holds, sent anyway (" +
          summary.counts.sent_anyway +
          " of " +
          holds +
          ")",
      },
      {
        value: pct(summary.recoveryRate),
        label:
          "Of holds, revised and sent within 30 min (" +
          summary.recoveries +
          " of " +
          holds +
          ")",
      },
    ];
    const grid = el("div", "tiles");
    data.forEach((t) => {
      const tile = el("div", "tile");
      tile.append(el("div", "value", t.value), el("div", "label", t.label));
      grid.append(tile);
    });
    return grid;
  }

  function dailyChart(summary) {
    const section = el("section");
    section.append(el("h2", "", "Outcomes by day"));
    section.append(
      el(
        "p",
        "sub",
        "Last " +
          summary.daily.length +
          " days. Each bar is one day; segments are stacked."
      )
    );
    section.append(
      legend(
        OUTCOMES.map((o) => ({
          cls: o.cls,
          text: o.label + " (" + summary.counts[o.key] + ")",
        }))
      )
    );

    const W = 640,
      H = 230;
    const plot = { left: 34, top: 14, w: W - 34 - 8, h: H - 14 - 28 };
    const totals = summary.daily.map((d) => d.passed + d.held + d.sent_anyway);
    const yMax = niceMax(Math.max(0, ...totals));
    const chart = svg("svg", {
      viewBox: "0 0 " + W + " " + H,
      role: "img",
      "aria-label":
        "Stacked bar chart of sent, held and sent-anyway messages per day",
    });
    yGrid(chart, plot, yMax);

    const band = plot.w / summary.daily.length;
    const barW = band * 0.6;
    summary.daily.forEach((day, i) => {
      const x = plot.left + i * band + (band - barW) / 2;
      const group = svg("g");
      const total = totals[i];
      group.append(
        svg(
          "title",
          {},
          day.date +
            ": " +
            day.passed +
            " sent normally, " +
            day.held +
            " held, " +
            day.sent_anyway +
            " sent anyway"
        )
      );
      // invisible full-height hover target, bigger than the bar
      group.append(
        svg("rect", {
          x: plot.left + i * band,
          y: plot.top,
          width: band,
          height: plot.h,
          fill: "transparent",
        })
      );

      let used = 0;
      OUTCOMES.forEach((o) => {
        const n = day[o.key];
        if (!n) return;
        const h = (n / yMax) * plot.h;
        const y = plot.top + plot.h - used - h;
        group.append(
          svg("rect", {
            class: "bar fill-" + o.cls,
            x,
            y,
            width: barW,
            height: h,
            rx: 2,
          })
        );
        used += h;
      });
      if (total > 0) {
        group.append(
          svg(
            "text",
            {
              class: "value",
              x: x + barW / 2,
              y: plot.top + plot.h - used - 4,
              "text-anchor": "middle",
            },
            String(total)
          )
        );
      }
      if (i % 2 === summary.daily.length % 2 || summary.daily.length <= 7) {
        group.append(
          svg(
            "text",
            {
              class: "axis-label",
              x: x + barW / 2,
              y: H - 8,
              "text-anchor": "middle",
            },
            shortDate(day.date)
          )
        );
      }
      chart.append(group);
    });
    section.append(chart);
    section.append(
      makeTable(
        ["Day", "Sent normally", "Held", "Sent anyway"],
        summary.daily.map((d) => [d.date, d.passed, d.held, d.sent_anyway])
      )
    );
    return section;
  }

  function histogramChart(summary) {
    const section = el("section");
    section.append(el("h2", "", "Effort scores"));
    section.append(
      el(
        "p",
        "sub",
        "How many attempts landed at each score. Below 50 is held; 50 and above would send."
      )
    );
    section.append(
      legend([
        { cls: 2, text: "Below the pass mark (held)" },
        { cls: 1, text: "At or above the pass mark" },
      ])
    );

    const W = 640,
      H = 200;
    const plot = { left: 34, top: 22, w: W - 34 - 8, h: H - 22 - 28 };
    const yMax = niceMax(Math.max(0, ...summary.histogram.map((b) => b.count)));
    const chart = svg("svg", {
      viewBox: "0 0 " + W + " " + H,
      role: "img",
      "aria-label": "Histogram of effort scores with the pass mark at 50",
    });
    yGrid(chart, plot, yMax);

    const band = plot.w / summary.histogram.length;
    const barW = band * 0.74;
    summary.histogram.forEach((b, i) => {
      const x = plot.left + i * band + (band - barW) / 2;
      const h = (b.count / yMax) * plot.h;
      const y = plot.top + plot.h - h;
      const group = svg("g");
      group.append(
        svg(
          "title",
          {},
          "Scores " + b.from + "\u2013" + b.to + ": " + b.count + " attempt(s)"
        )
      );
      group.append(
        svg("rect", {
          x: plot.left + i * band,
          y: plot.top,
          width: band,
          height: plot.h,
          fill: "transparent",
        })
      );
      if (b.count > 0) {
        group.append(
          svg("rect", {
            class: "bar fill-" + (i < 5 ? 2 : 1),
            x,
            y,
            width: barW,
            height: h,
            rx: 2,
          })
        );
        group.append(
          svg(
            "text",
            {
              class: "value",
              x: x + barW / 2,
              y: y - 4,
              "text-anchor": "middle",
            },
            String(b.count)
          )
        );
      }
      group.append(
        svg(
          "text",
          {
            class: "axis-label",
            x: x + barW / 2,
            y: H - 8,
            "text-anchor": "middle",
          },
          b.from + "\u2013" + b.to
        )
      );
      chart.append(group);
    });
    // pass mark between the 40-49 and 50-59 buckets
    const markX = plot.left + 5 * band;
    chart.append(
      svg("line", {
        class: "passmark",
        x1: markX,
        x2: markX,
        y1: plot.top - 6,
        y2: plot.top + plot.h,
      })
    );
    chart.append(
      svg("text", { x: markX + 6, y: plot.top - 8 }, "Pass mark: 50")
    );
    section.append(chart);
    section.append(
      makeTable(
        ["Score range", "Attempts"],
        summary.histogram.map((b) => [b.from + "\u2013" + b.to, b.count])
      )
    );
    return section;
  }

  function signalsChart(summary) {
    const section = el("section");
    section.append(el("h2", "", "Which rules fire most"));
    section.append(
      el(
        "p",
        "sub",
        "Orange rules ask for the answer; blue rules show your own thinking."
      )
    );
    section.append(
      legend([
        { cls: 2, text: "Asks for the answer" },
        { cls: 1, text: "Shows effort" },
      ])
    );
    if (summary.topSignals.length === 0) {
      section.append(el("p", "empty", "No rules have fired yet."));
      return section;
    }
    const max = Math.max(...summary.topSignals.map((s) => s.count));
    const list = el("div", "hbars");
    summary.topSignals.forEach((s) => {
      const row = el("div", "hrow");
      const track = el("div", "track");
      const bar = el("div", "bar");
      bar.style.width = Math.round((s.count / max) * 100) + "%";
      bar.style.background =
        s.kind === "request" ? "var(--series-2)" : "var(--series-1)";
      track.append(bar);
      row.append(
        el("span", "", s.label),
        track,
        el("span", "count", String(s.count))
      );
      list.append(row);
    });
    section.append(list);
    section.append(
      makeTable(
        ["Rule", "Type", "Times fired"],
        summary.topSignals.map((s) => [
          s.label,
          s.kind === "request" ? "asks for the answer" : "shows effort",
          s.count,
        ])
      )
    );
    return section;
  }

  function render() {
    const summary = StudyGuardAnalytics.summarize(events, { signalInfo });
    const parts = [];
    parts.push(el("h1", "", "StudyGuard Analytics"));
    parts.push(
      el(
        "p",
        "sub",
        "What happened when you tried to send messages on ChatGPT or Claude. This log stores scores and rule names only, never your text."
      )
    );

    if (summary.total === 0) {
      parts.push(
        el(
          "p",
          "empty",
          "No activity recorded yet. Turn on study mode in the StudyGuard popup, then send a message on ChatGPT or Claude."
        )
      );
      root.replaceChildren(...parts);
      return;
    }

    parts.push(tiles(summary));
    parts.push(dailyChart(summary));
    parts.push(histogramChart(summary));
    parts.push(signalsChart(summary));
    parts.push(
      el(
        "p",
        "note",
        "These numbers describe behaviour, not learning. A message that is held and retried counts each time it is attempted."
      )
    );
    root.replaceChildren(...parts);
  }

  // ---------- controls ----------
  function exportCsv() {
    const blob = new Blob([StudyGuardAnalytics.toCsv(events)], {
      type: "text/csv",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download =
      "studyguard-analytics-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  document.getElementById("export-csv").addEventListener("click", exportCsv);
  document
    .getElementById("print")
    .addEventListener("click", () => window.print());
  document.getElementById("show-tables").addEventListener("change", (e) => {
    document.body.classList.toggle("show-tables", e.target.checked);
  });
  document.getElementById("clear-log").addEventListener("click", async () => {
    if (
      !confirm(
        "Delete the analytics log on this device? This cannot be undone."
      )
    )
      return;
    await eventLog.clear();
    events = [];
    render();
  });

  eventLog
    .getAll()
    .then((all) => {
      events = all;
      render();
    })
    .catch((error) => {
      root.replaceChildren(
        el("p", "empty", "Could not load the analytics log.")
      );
      console.error("StudyGuard could not load the analytics log:", error);
    });
})();
