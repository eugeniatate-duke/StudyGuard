/**
 * counterfactual.js - StudyGuard "what would unlock this?" hint generator (Step 3)
 *
 * WHAT THIS FILE DOES
 * When a prompt scores below the pass line, this works out the SMALLEST set of
 * additions that would get it to pass, and phrases each one as plain advice.
 * Example: "Add the exact error message" or "Write 5+ words about your own
 * approach in the attempt box".
 *
 * WHY THIS IS A "COUNTERFACTUAL" EXPLANATION
 * It answers: "What is the smallest change that would have led to a different
 * outcome?" (Wachter, Mittelstadt & Russell, 2017). It only suggests changes
 * a student can actually make (their own attempt, error, sticking point),
 * never anything they cannot change.
 *
 * HOW THE ADVICE IS CHECKED
 * Every suggestion comes with a short example sentence. We re-score the prompt
 * WITH those examples added, using the real engine, and report whether it
 * truly passes (`verified`). So the advice is tested, not guessed.
 *
 * KNOWN LIMITS
 * - The examples show the kind of content that helps; a student could paste
 *   filler that matches the patterns. This tool cannot tell sincere effort from
 *   gaming (red-team test E5), so the wording asks for real content.
 * - Rule-based: advice reflects this scorer, not a human judgment.
 *
 * No DOM code here, so it runs in Chrome and in Node tests.
 */
(function () {
  const isNode = typeof module !== "undefined" && module.exports;
  const Engine = isNode ? require("./engine.js") : globalThis.StudyGuardEngine;
  const Perturbation = isNode
    ? require("./perturbation.js")
    : globalThis.StudyGuardPerturbation;

  /**
   * What we can suggest, in the order we prefer to suggest it (most useful
   * for learning first). Each has:
   *   id        - matches a signal id in engine.js (or "attempt_field")
   *   where     - "prompt" (add to the question) or "attempt" (attempt box)
   *   codeOnly  - only suggest when the prompt looks like a programming question
   *   advice    - what we tell the student
   *   example   - sample text used ONLY to verify the advice works
   */
  const SUGGESTIONS = [
    {
      id: "attempt_field",
      where: "attempt",
      advice:
        "Write at least 5 words of your own approach in the attempt box: what you would try first, even if you are unsure.",
      example: "First I would break the problem into smaller parts.",
    },
    {
      id: "stuck_point",
      where: "prompt",
      advice:
        'Say specifically where you are stuck (for example, "I\'m stuck on how to update the index").',
      example: "I'm stuck on the second step.",
    },
    {
      id: "error_log",
      where: "prompt",
      codeOnly: true,
      advice:
        "Paste the exact error message, or say which line fails and what happened.",
      example: "I get a TypeError on line 4.",
    },
    {
      id: "attempt_marker",
      where: "prompt",
      advice:
        'Say what you tried so far (for example, "Here is my attempt: ..." and then paste or describe it).',
      example: "Here is my attempt so far.",
    },
    {
      id: "hint_request",
      where: "prompt",
      advice:
        'Ask for a hint instead of the full answer (for example, "Can you give me a hint without giving me the solution?").',
      example: "Can you give me a hint without giving me the solution?",
    },
    {
      id: "why_question",
      where: "prompt",
      advice:
        "Ask why or how something works, so the reply explains the idea rather than just handing over the result.",
      example: "Why does this approach work?",
    },
    {
      id: "code_present",
      where: "prompt",
      codeOnly: true,
      advice:
        "Include the code you have written so far, even if it is incomplete.",
      example: "```\ndef f(x):\n    return x\n```",
    },
    {
      id: "reasoning_words",
      where: "prompt",
      advice:
        'Explain your thinking with a reason (for example, "I think it is X because ...").',
      example: "I think it is the loop because the count is wrong.",
    },
  ];

  /** Does the prompt look like a programming question? (decides code-only advice) */
  function looksLikeCode(text) {
    return /\b(code|function|program|script|python|java|javascript|c\+\+|bug|class|algorithm|compile|syntax|variable|loop|array)\b|```/i.test(
      text
    );
  }

  /** Re-score the prompt after adding example text to it and/or the attempt box. */
  function scoreWithAdditions(prompt, attempt, picked) {
    const promptAdds = picked
      .filter((s) => s.where === "prompt")
      .map((s) => s.example);
    const attemptAdds = picked
      .filter((s) => s.where === "attempt")
      .map((s) => s.example);
    const newPrompt = [prompt, ...promptAdds].join(" ");
    const newAttempt = [attempt, ...attemptAdds].filter(Boolean).join(" ");
    return Engine.analyzePrompt(newPrompt, { attempt: newAttempt });
  }

  /**
   * Build the counterfactual advice for a prompt.
   *
   * @param {string} prompt
   * @param {{attempt?: string}} [options]
   * @returns {{
   *   needed: boolean,          // false when the prompt already passes
   *   score: number, threshold: number, gap: number,
   *   whyBlocked: Array<{id, label, weight}>,   // request signals found
   *   reword: null | {words: string[], message: string},
   *   steps: Array<{id, where, advice, gain}>,  // the smallest plan we found
   *   projectedScore: number,
   *   verified: boolean,        // true if re-scoring the plan really passes
   *   message: string           // ready-to-display summary
   * }}
   */
  function generateHint(prompt, options = {}) {
    const attempt = (options.attempt || "").trim();
    const base = Engine.analyzePrompt(prompt, { attempt });
    const out = {
      needed: false,
      score: base.score,
      threshold: base.threshold,
      gap: 0,
      whyBlocked: [],
      reword: null,
      steps: [],
      projectedScore: base.score,
      verified: true,
      message: "",
    };
    if (base.decision !== "needs_effort") return out; // passes or empty: nothing to add

    out.needed = true;
    out.gap = base.threshold - base.score;
    out.whyBlocked = base.signals
      .filter((s) => s.kind === "request")
      .map((s) => ({ id: s.id, label: s.label, weight: s.weight }));

    // Option A: reword. Words whose removal alone would let the prompt pass.
    const explanation = Perturbation.explainPrompt(prompt, { attempt });
    const flippers = explanation.topFeatures.filter(
      (t) => t.flipsDecision && t.effect === "answer_seeking"
    );
    if (flippers.length > 0) {
      const words = [...new Set(flippers.map((t) => t.text))];
      out.reword = {
        words,
        message:
          `Or reword: ${words
            .map((w) => `"${w}"`)
            .join(", ")} ask the AI to do the work. ` +
          `Try asking how to approach it instead.`,
      };
    }

    // Option B: add effort. Pick suggestions in preference order, skipping ones
    // already present, until the projected score reaches the pass line.
    const present = new Set(base.signals.map((s) => s.id));
    const isCode = looksLikeCode(prompt) || looksLikeCode(attempt);
    const candidates = SUGGESTIONS.filter(
      (s) => !present.has(s.id) && (!s.codeOnly || isCode)
    );

    const picked = [];
    let projected = base;
    for (const candidate of candidates) {
      if (projected.score >= base.threshold) break;
      picked.push(candidate);
      projected = scoreWithAdditions(prompt, attempt, picked);
    }

    // Trim: drop any step the plan still passes without (keeps the plan minimal).
    for (let i = picked.length - 1; i >= 0; i--) {
      const without = picked.filter((_, j) => j !== i);
      if (
        without.length &&
        scoreWithAdditions(prompt, attempt, without).score >= base.threshold
      ) {
        picked.splice(i, 1);
      }
    }
    projected = picked.length
      ? scoreWithAdditions(prompt, attempt, picked)
      : base;

    out.steps = picked.map((s) => {
      const alone = scoreWithAdditions(prompt, attempt, [s]);
      return {
        id: s.id,
        where: s.where,
        advice: s.advice,
        gain: alone.score - base.score,
      };
    });
    out.projectedScore = projected.score;
    out.verified = projected.score >= base.threshold;

    const lines = [
      `Your effort score is ${base.score}/100 and it needs ${base.threshold}. To get there:`,
      ...out.steps.map((s, i) => `${i + 1}. ${s.advice}`),
    ];
    if (out.reword) lines.push(out.reword.message);
    out.message = lines.join("\n");
    return out;
  }

  const api = { generateHint, looksLikeCode, SUGGESTIONS };
  if (isNode) module.exports = api;
  else globalThis.StudyGuardCounterfactual = api;
})();
