/**
 * hint.js - builds the "hint request" a student can paste into the chat.
 *
 * It asks the AI for ONE hint at a time and tells it NOT to give the full
 * solution. No DOM code here, so it runs in Chrome and in Node tests.
 */
(function () {
  const isNode = typeof module !== "undefined" && module.exports;

  const HINT_LEVELS = {
    1: {
      label: "Level 1: Conceptual nudge",
      instruction:
        "Give a conceptual nudge only. Name the idea I should think about, but show no steps or calculations.",
    },
    2: {
      label: "Level 2: Point to the step",
      instruction:
        "Point to the specific step or mistake in my attempt that I should revisit, without fixing it for me.",
    },
    3: {
      label: "Level 3: One worked step",
      instruction:
        "Work through only the next single step, then stop and ask me to continue from there.",
    },
  };

  function buildHintRequest(question, attempt, level = 1) {
    const config = HINT_LEVELS[level] ?? HINT_LEVELS[1];

    return [
      "Help me learn by giving one useful hint at a time.",
      "Do not provide the complete solution or final answer yet.",
      config.instruction,
      "If my attempt contains a mistake, guide me toward noticing it.",
      "End with one question or small next step for me to try.",
      "",
      "Problem:",
      question,
      "",
      "My attempt or sticking point:",
      attempt || "I’m not sure how to start. Give me a starting hint.",
    ].join("\n");
  }

  const api = { buildHintRequest, HINT_LEVELS };
  if (isNode) module.exports = api;
  else globalThis.StudyGuardHint = api;
})();
