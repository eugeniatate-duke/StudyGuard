/**
 * eval/evaluate.js - benchmark calculations and report (Step 10b)
 *
 * WHAT THIS FILE DOES
 * Compares StudyGuard's decisions with the human labels in eval/prompts.csv.
 *
 *   evaluate(rows, typeMap, analyze)  -> results (confusion matrix, metrics
 *                                        with 95% confidence intervals,
 *                                        baselines, per-category results,
 *                                        every mistake)
 *   renderMarkdown(results, options)  -> a report for docs/evaluation-results.md
 *
 * HOW TO READ IT
 *   Positive class = HOLD (the prompt should be held for more effort).
 *   precision  of the prompts StudyGuard held, how many truly should be held
 *              (low precision = students wrongly held; erodes trust)
 *   recall     of the prompts that should be held, how many StudyGuard held
 *              (low recall = answer-seeking prompts slip through)
 *   UNSURE rows are reported separately and never counted as right or wrong.
 *
 * With a small labelled set the confidence intervals are wide; the report
 * says so. No file or DOM code here, so it runs in Node tests.
 */
(function () {
  // A deliberately naive baseline: hold if the message contains a "do it for me" verb.
  const KEYWORD_BASELINE =
    /\b(write|give|solve|answer|complete|finish|provide|produce|draft|generate|show me|do my|supply)\b/i;

  const ratio = (n, d) => (d > 0 ? n / d : null);

  /** Wilson 95% confidence interval for k successes out of n. */
  function wilson(k, n, z = 1.96) {
    if (n === 0) return { value: null, lo: null, hi: null, k, n };
    const p = k / n;
    const denom = 1 + (z * z) / n;
    const center = (p + (z * z) / (2 * n)) / denom;
    const half =
      (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
    return {
      value: p,
      lo: Math.max(0, center - half),
      hi: Math.min(1, center + half),
      k,
      n,
    };
  }

  /** All headline metrics from a confusion matrix {tp, fn, fp, tn}. */
  function metricsFrom(c) {
    const precision = wilson(c.tp, c.tp + c.fp);
    const recall = wilson(c.tp, c.tp + c.fn);
    const p = precision.value;
    const r = recall.value;
    return {
      accuracy: wilson(c.tp + c.tn, c.tp + c.tn + c.fp + c.fn),
      precision,
      recall,
      specificity: wilson(c.tn, c.tn + c.fp),
      f1: p !== null && r !== null && p + r > 0 ? (2 * p * r) / (p + r) : null,
    };
  }

  function confusion(items, predictedKey) {
    const c = { tp: 0, fn: 0, fp: 0, tn: 0 };
    for (const it of items) {
      if (it.label === "HOLD") it[predictedKey] === "HOLD" ? c.tp++ : c.fn++;
      else it[predictedKey] === "HOLD" ? c.fp++ : c.tn++;
    }
    return c;
  }

  /**
   * @param {object[]} rows      parsed eval/prompts.csv (id, prompt, attempt, label)
   * @param {object} typeMap     id -> category name
   * @param {Function} analyze   (prompt, {attempt}) -> engine result
   */
  function evaluate(rows, typeMap, analyze) {
    const items = rows.map((row) => {
      const label = String(row.label || "")
        .trim()
        .toUpperCase();
      const attempt = String(row.attempt || "");
      const result = analyze(row.prompt, { attempt });
      return {
        id: row.id,
        type: (typeMap && typeMap[row.id]) || "unknown",
        label,
        prompt: row.prompt,
        attempt,
        score: result.score,
        predicted: result.decision === "needs_effort" ? "HOLD" : "PASS",
        keyword: KEYWORD_BASELINE.test(row.prompt) ? "HOLD" : "PASS",
        majority: "HOLD",
        signals: result.signals.map((s) => s.id),
      };
    });

    const decided = items.filter(
      (it) => it.label === "HOLD" || it.label === "PASS"
    );
    const unsure = items.filter((it) => it.label === "UNSURE");
    const c = confusion(decided, "predicted");

    const byTypeMap = new Map();
    for (const it of decided) {
      if (!byTypeMap.has(it.type)) byTypeMap.set(it.type, []);
      byTypeMap.get(it.type).push(it);
    }
    const byType = [...byTypeMap.entries()]
      .map(([type, list]) => {
        const tc = confusion(list, "predicted");
        return {
          type,
          n: list.length,
          correct: tc.tp + tc.tn,
          accuracy: wilson(tc.tp + tc.tn, list.length),
          missed: tc.fn, // should HOLD, was passed
          wronglyHeld: tc.fp, // should PASS, was held
        };
      })
      .sort((a, b) => a.type.localeCompare(b.type));

    return {
      total: items.length,
      decided: decided.length,
      unsure: unsure.length,
      confusion: c,
      metrics: metricsFrom(c),
      baselines: {
        majority: metricsFrom(confusion(decided, "majority")),
        keyword: metricsFrom(confusion(decided, "keyword")),
      },
      byType,
      missed: decided.filter(
        (it) => it.label === "HOLD" && it.predicted === "PASS"
      ),
      wronglyHeld: decided.filter(
        (it) => it.label === "PASS" && it.predicted === "HOLD"
      ),
      unsureHeld: unsure.filter((it) => it.predicted === "HOLD").length,
      unsurePassed: unsure.filter((it) => it.predicted === "PASS").length,
    };
  }

  // ---------- report ----------
  const pct = (x) => (x === null ? "n/a" : Math.round(x * 100) + "%");
  function withCi(m) {
    if (m.value === null) return "n/a";
    return (
      pct(m.value) +
      " (95% CI " +
      pct(m.lo) +
      "\u2013" +
      pct(m.hi) +
      ", " +
      m.k +
      "/" +
      m.n +
      ")"
    );
  }
  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + "\u2026" : s);
  const cell = (s) => String(s).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

  function errorTable(list) {
    if (list.length === 0) return ["_None._", ""];
    const out = [
      "| id | category | score | prompt | rules that fired |",
      "|---|---|---|---|---|",
    ];
    list.forEach((it) => {
      const text = it.attempt
        ? it.prompt + " [attempt: " + it.attempt + "]"
        : it.prompt;
      out.push(
        "| " +
          [
            it.id,
            it.type,
            it.score,
            cell(clip(text, 150)),
            it.signals.join(", ") || "none",
          ].join(" | ") +
          " |"
      );
    });
    out.push("");
    return out;
  }

  function renderMarkdown(r, options = {}) {
    const m = r.metrics;
    const c = r.confusion;
    const out = [];
    out.push("# StudyGuard evaluation results", "");
    out.push(
      "_Generated by `node eval/benchmark.js` on " +
        (options.generatedAt || new Date().toISOString().slice(0, 10)) +
        ". Do not edit by hand; re-run the script._",
      ""
    );
    out.push("## Data", "");
    out.push(
      "- Prompts: " +
        r.total +
        " (" +
        r.decided +
        " labelled HOLD or PASS, " +
        r.unsure +
        " UNSURE)"
    );
    out.push("- Positive class: HOLD (should be held for more effort)");
    out.push(
      "- Pass mark: " +
        (options.threshold !== undefined ? options.threshold : 50),
      ""
    );

    out.push("## Headline results", "");
    out.push("| Measure | Result |", "|---|---|");
    out.push("| Accuracy | " + withCi(m.accuracy) + " |");
    out.push(
      "| HOLD precision (held prompts that should be held) | " +
        withCi(m.precision) +
        " |"
    );
    out.push(
      "| HOLD recall (prompts that should be held and were) | " +
        withCi(m.recall) +
        " |"
    );
    out.push(
      "| Specificity (prompts that should pass and did) | " +
        withCi(m.specificity) +
        " |"
    );
    out.push(
      "| F1 for HOLD | " + (m.f1 === null ? "n/a" : m.f1.toFixed(2)) + " |",
      ""
    );

    out.push("## Confusion matrix", "");
    out.push("| | Predicted HOLD | Predicted PASS |", "|---|---|---|");
    out.push("| **Labelled HOLD** | " + c.tp + " | " + c.fn + " (missed) |");
    out.push(
      "| **Labelled PASS** | " + c.fp + " (wrongly held) | " + c.tn + " |",
      ""
    );

    out.push("## Baselines", "");
    out.push(
      "| Method | Accuracy | HOLD precision | HOLD recall |",
      "|---|---|---|---|"
    );
    const row = (name, mm) =>
      "| " +
      name +
      " | " +
      withCi(mm.accuracy) +
      " | " +
      withCi(mm.precision) +
      " | " +
      withCi(mm.recall) +
      " |";
    out.push(row("Always HOLD", r.baselines.majority));
    out.push(
      row("Keyword rule (write/give/solve/answer/...)", r.baselines.keyword)
    );
    out.push(row("**StudyGuard scorer**", m), "");

    out.push("## Results by category", "");
    out.push(
      "| Category | Prompts | Correct | Accuracy | Missed (should HOLD) | Wrongly held |",
      "|---|---|---|---|---|---|"
    );
    r.byType.forEach((t) => {
      out.push(
        "| " +
          [
            t.type,
            t.n,
            t.correct,
            withCi(t.accuracy),
            t.missed,
            t.wronglyHeld,
          ].join(" | ") +
          " |"
      );
    });
    out.push("");

    out.push("## Mistakes", "");
    out.push(
      "### Missed: should be held but was allowed (" + r.missed.length + ")",
      ""
    );
    out.push(...errorTable(r.missed));
    out.push(
      "### Wrongly held: should pass but was held (" +
        r.wronglyHeld.length +
        ")",
      ""
    );
    out.push(...errorTable(r.wronglyHeld));

    out.push("## UNSURE prompts", "");
    out.push(
      "The labeller could not decide on " +
        r.unsure +
        " prompts. StudyGuard held " +
        r.unsureHeld +
        " and let " +
        r.unsurePassed +
        " through. These are not counted as right or wrong.",
      ""
    );

    out.push("## How to read this", "");
    out.push(
      "- The set is small and synthetic, so the confidence intervals are wide. Treat the numbers as a rough indication, not a guarantee."
    );
    out.push(
      "- Labels come from a single annotator who also built the tool; the annotation guide describes how bias was limited (blind labelling, frozen labels)."
    );
    out.push(
      "- Wrongly held prompts cost student trust; missed prompts cost the tool's purpose. Which matters more is a design choice, discussed in the write-up."
    );
    out.push(
      "- The category table is where the failures cluster; the mistake lists show why.",
      ""
    );
    return out.join("\n");
  }

  const api = {
    evaluate,
    renderMarkdown,
    wilson,
    metricsFrom,
    KEYWORD_BASELINE,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else globalThis.StudyGuardEvaluate = api;
})();
