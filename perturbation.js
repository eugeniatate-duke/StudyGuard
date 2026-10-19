/**
 * perturbation.js - StudyGuard word-importance explainer (Step 2)
 *
 * WHAT THIS FILE DOES
 * Explains WHY a prompt got its score by running a "what if this word were
 * missing?" experiment on every word:
 *   1. Score the prompt as typed (the baseline).
 *   2. Remove one word, re-score with the same engine, record the change.
 *   3. Put the word back and repeat for the next word.
 *
 * HOW TO READ THE RESULT
 * delta = (score without the word) - (baseline score)
 *   delta > 0  -> removing the word RAISES the score. The word was hurting
 *                 the prompt (e.g. "write", "function"). Show it in RED.
 *   delta < 0  -> removing the word LOWERS the score. The word was helping
 *                 (e.g. "stuck", "error"). Show it in GREEN.
 *   delta ~ 0  -> the word did not matter.
 *
 * This is the same idea behind LIME and occlusion methods (perturb the input,
 * watch the output), but exact and tiny because the engine is fast.
 *
 * KNOWN LIMITS (worth stating in the write-up)
 * - One word at a time misses redundancy: if two phrases both say "give me the
 *   answer", removing a single word may change nothing.
 * - Multi-word phrases: every word the pattern needs gets credit, because
 *   removing any one of them breaks the phrase.
 * - Importance is relative to THIS rule-based engine, not to a human's view.
 *
 * No DOM code here, so it runs in Chrome and in Node tests.
 */
(function () {
  const Engine =
    typeof module !== "undefined" && module.exports
      ? require("./engine.js")
      : globalThis.StudyGuardEngine;

  const PERTURBATION_CONFIG = {
    // Ignore changes smaller than this many points. Tiny +/-1 shifts come from
    // the length bonus changing when any word is removed, not from the word.
    minDelta: 5,
  };

  /**
   * Split text into word tokens with positions: [{text, start, end}].
   * Curly apostrophes count as part of a word (ChatGPT and Macs produce them).
   */
  function tokenize(text) {
    const tokens = [];
    for (const m of String(text || "").matchAll(/[A-Za-z0-9'\u2018\u2019]+/g)) {
      tokens.push({ text: m[0], start: m.index, end: m.index + m[0].length });
    }
    return tokens;
  }

  /** Return `text` with the characters [start, end) removed. */
  function maskToken(text, token) {
    return text.slice(0, token.start) + text.slice(token.end);
  }

  /**
   * Explain a prompt word by word.
   *
   * @param {string} prompt
   * @param {{attempt?: string}} [options] - passed through to the engine
   * @returns {{
   *   baseline: object,           // the normal analyzePrompt() result
   *   blocked: boolean,           // true when decision is "needs_effort"
   *   tokens: Array<{
   *     text, start, end,
   *     delta: number,            // score change when the word is removed
   *     importance: number,       // 0..1, |delta| relative to the biggest |delta|
   *     effect: "answer_seeking" | "effort" | "neutral",
   *     flagged: boolean,         // |delta| >= minDelta
   *     flipsDecision: boolean    // removing it changes the pass/needs_effort result
   *   }>,
   *   topFeatures: Array          // flagged tokens, biggest |delta| first
   * }}
   */
  function explainPrompt(prompt, options = {}) {
    const text = String(prompt || "");
    const baseline = Engine.analyzePrompt(text, options);
    const result = {
      baseline,
      blocked: baseline.decision === "needs_effort",
      tokens: [],
      topFeatures: [],
    };
    if (baseline.decision === "empty") return result;

    const tokens = tokenize(text).map((token) => {
      const without = Engine.analyzePrompt(maskToken(text, token), options);
      const delta = without.score - baseline.score;
      return {
        ...token,
        delta,
        importance: 0, // filled in below
        effect: delta > 0 ? "answer_seeking" : delta < 0 ? "effort" : "neutral",
        flagged: Math.abs(delta) >= PERTURBATION_CONFIG.minDelta,
        flipsDecision:
          without.decision !== "empty" &&
          without.decision !== baseline.decision,
      };
    });

    // Scale importance to 0..1 so the UI can map it straight to color strength.
    const maxAbs = Math.max(0, ...tokens.map((t) => Math.abs(t.delta)));
    for (const t of tokens) {
      t.importance = maxAbs === 0 ? 0 : Math.abs(t.delta) / maxAbs;
    }

    result.tokens = tokens;
    result.topFeatures = tokens
      .filter((t) => t.flagged)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    return result;
  }

  const api = { explainPrompt, tokenize, maskToken, PERTURBATION_CONFIG };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    globalThis.StudyGuardPerturbation = api;
  }
})();
