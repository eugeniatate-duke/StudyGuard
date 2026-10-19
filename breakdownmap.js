/**
 * breakdownmap.js - StudyGuard Prompt Breakdown Map builder (Step 5)
 *
 * WHAT THIS FILE DOES
 * Turns the raw results of the engine, the word-importance step and the hint
 * generator into ONE plain object that the side panel can draw. It is the
 * "glass box" summary of why a prompt was scored the way it was:
 *
 *   intent   what the prompt is asking for (e.g. "Direct code generation")
 *   effort   how much of the student's own thinking is visible
 *   signals  every rule that fired, with the exact words it matched
 *   words    each word with its red/green/neutral effect
 *   unlock   what to add to pass (from the counterfactual hint)
 *
 * HONESTY NOTE
 * The numbers here are RULE POINTS from a transparent scorer, not
 * probabilities. We never call them "confidence". The map says so itself
 * (see `caveat`).
 *
 * No DOM code, so it runs in Chrome and in Node tests.
 */
(function () {
  const INTENT_LABELS = {
    direct_code_request: "Direct code generation",
    give_answer: "Asking for the final answer",
    solve_for_me: "Asking someone else to solve it",
    for_me: "Handing the task over",
  };

  const INTENT_BASE_TEXT = {
    direct_code_request: "Your prompt asks for finished code.",
    give_answer: "Your prompt asks for the final answer.",
    solve_for_me: "Your prompt asks the AI to solve the problem for you.",
    for_me: "Your prompt hands the task over to the AI.",
  };

  const CAVEAT =
    "These are rule points from a transparent scorer, not a probability or a " +
    "judgment of you. It can be wrong, so treat it as advice.";

  /** Absent / Low / Moderate / Strong, from the effort points. */
  function effortLevel(points) {
    if (points <= 0) return "Absent";
    if (points < 20) return "Low";
    if (points < 40) return "Moderate";
    return "Strong";
  }

  const clampPct = (n) => Math.max(0, Math.min(100, Math.round(n)));

  /**
   * @param {object} analysis    result of StudyGuardEngine.analyzePrompt
   * @param {object|null} explanation result of explainPrompt (may be null)
   * @param {object|null} hint   result of generateHint (may be null)
   * @returns {object} a map ready for the side panel
   */
  function buildMap(analysis, explanation, hint) {
    const requestSignals = analysis.signals
      .filter((s) => s.kind === "request")
      .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
    const effortSignals = analysis.signals.filter((s) => s.kind === "effort");
    const level = effortLevel(analysis.effortPoints);

    // ---- intent ----
    const top = requestSignals[0];
    let intentLabel;
    let intentText;
    if (top) {
      intentLabel = INTENT_LABELS[top.id] || top.label;
      intentText = INTENT_BASE_TEXT[top.id] || top.label + ".";
      intentText +=
        level === "Absent"
          ? " Nothing in it shows your own approach, pseudocode or an error message."
          : " You also showed some of your own thinking, which offsets part of this.";
    } else if (analysis.intent === "attempting") {
      intentLabel = "Working it through";
      intentText =
        "Your prompt shows your own reasoning, so it reads as an attempt.";
    } else {
      intentLabel = "General question";
      intentText = "No request-for-an-answer wording was found.";
    }

    // ---- effort ----
    const effortText =
      effortSignals.length === 0
        ? "Nothing in the prompt or attempt box shows your own work yet."
        : "Found: " +
          effortSignals.map((s) => s.label.toLowerCase()).join("; ") +
          ".";

    return {
      score: analysis.score,
      threshold: analysis.threshold,
      passed: analysis.decision !== "needs_effort",
      intent: {
        label: intentLabel,
        points: analysis.requestPoints,
        bar: clampPct(analysis.requestPoints),
        explanation: intentText,
      },
      effort: {
        level,
        points: analysis.effortPoints,
        bar: clampPct(analysis.effortPoints),
        explanation: effortText,
      },
      signals: analysis.signals.map((s) => ({
        id: s.id,
        kind: s.kind,
        label: s.label,
        weight: s.weight,
        quotes: s.matches.map((m) => m.text),
      })),
      words: explanation
        ? explanation.tokens.map((t) => ({
            text: t.text,
            effect: t.flagged ? t.effect : "neutral",
            importance: t.importance,
            delta: t.delta,
          }))
        : [],
      unlock:
        hint && hint.needed
          ? {
              steps: hint.steps.map((s) => ({
                where: s.where,
                advice: s.advice,
                gain: s.gain,
              })),
              reword: hint.reword ? hint.reword.message : "",
              projectedScore: hint.projectedScore,
            }
          : null,
      caveat: CAVEAT,
    };
  }

  const api = { buildMap, effortLevel, CAVEAT };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else globalThis.StudyGuardMap = api;
})();
