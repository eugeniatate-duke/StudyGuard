/**
 * gate.js - StudyGuard submit gate decision (Step 4)
 *
 * WHAT THIS FILE DOES
 * Answers one question: "Should StudyGuard hold this message before it is
 * sent?" It runs the analysis engine and returns:
 *   hold     true when the prompt needs more effort (a SOFT block)
 *   analysis the full engine result (score, signals, intent)
 *   reason   a plain-English explanation to show the student
 *
 * SOFT BLOCK, NOT A HARD BLOCK
 * Holding a message never deletes it and never prevents sending for good: the
 * student can always choose "Send anyway". This is deliberate. A hard block
 * would be bypassed, would punish legitimate questions the scorer misjudges,
 * and would turn a learning aid into a gatekeeper. The scorer is advice, not a
 * verdict (see docs/project-plan.md, Limitations).
 *
 * No DOM code here, so it runs in Chrome and in Node tests.
 */
(function () {
  const isNode = typeof module !== "undefined" && module.exports;
  const Engine = isNode ? require("./engine.js") : globalThis.StudyGuardEngine;

  /**
   * @param {string} question - text in the chat box
   * @param {{attempt?: string}} [options] - text in the attempt box
   * @returns {{hold: boolean, analysis: object, reason: string}}
   */
  function evaluateSubmission(question, options = {}) {
    const analysis = Engine.analyzePrompt(question, options);
    const hold = analysis.decision === "needs_effort";

    let reason = "";
    if (hold) {
      const stoodOut = analysis.signals
        .filter((s) => s.kind === "request")
        .map((s) => s.label.toLowerCase());
      reason =
        `Your effort score is ${analysis.score}/100 and this needs ${analysis.threshold}. ` +
        (stoodOut.length ? `What stood out: ${stoodOut.join("; ")}. ` : "") +
        "This is advice, not a verdict. You can add your own thinking first, or send anyway.";
    }
    return { hold, analysis, reason };
  }

  /**
   * Remembers the hint requests that StudyGuard itself generated, so pasting
   * one back into the chat is not scored again. Those requests contain words
   * like "final answer" and "complete solution" ONLY because they tell the AI
   * NOT to give them, and scoring them would hold the student's own hint
   * request. Matching is exact (whitespace-normalised), so a student cannot
   * unlock an answer request by borrowing a few of these phrases: any change
   * to the text makes it an ordinary prompt again. Lives in page memory only.
   */
  function createHintRegistry() {
    const known = new Set();
    const norm = (text) => String(text || "").replace(/\s+/g, " ").trim();
    return {
      register(text) {
        const t = norm(text);
        if (t) known.add(t);
      },
      has(text) {
        const t = norm(text);
        return t !== "" && known.has(t);
      },
      clear() {
        known.clear();
      },
    };
  }

  const api = { evaluateSubmission, createHintRegistry };
  if (isNode) module.exports = api;
  else globalThis.StudyGuardGate = api;
})();
