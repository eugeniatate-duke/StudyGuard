/**
 * engine.js - StudyGuard local analysis engine (Step 1)
 *
 * WHAT THIS FILE DOES
 * Reads a student's prompt and returns an "effort score" from 0 to 100 plus a
 * decision: "pass" (ready to send) or "needs_effort" (add more of your own
 * thinking first).
 *
 * HOW IT WORKS (a transparent, rule-based scorer; no ML yet)
 * - Start at a neutral score of 50.
 * - "Request" signals (e.g. "write a function") subtract points.
 * - "Effort" signals (e.g. "here is my attempt", an error message, code) add points.
 * - Each signal counts once, however many times it appears.
 * - score >= 50 -> pass. score < 50 -> needs_effort.
 *
 * WHY RULES FIRST
 * Every point can be traced to a named signal and the exact words that matched,
 * so the explanation is exact. A trained model (SHAP/LIME) replaces the rules
 * later behind this same analyzePrompt() interface.
 *
 * KNOWN LIMITS (also documented in docs/project-plan.md)
 * - Pattern matching cannot judge whether an attempt is correct or sincere.
 * - Padding a prompt with filler phrases can raise the score (red-team test E5).
 * - English only.
 *
 * This file has no DOM code, so it runs in Chrome AND in Node for testing.
 */

const ENGINE_CONFIG = {
  baseScore: 50, // neutral starting point
  passThreshold: 50, // score at or above this passes
  minScore: 0,
  maxScore: 100,
  lengthBonusStartWords: 12, // length bonus begins after this many words
  lengthBonusCap: 10, // at most this many bonus points for length
  attemptFieldMinWords: 5, // words needed in the "attempt" box to count
  attemptFieldWeight: 25, // points for a real attempt in the attempt box
};

/**
 * Each signal: id, kind ("request" subtracts, "effort" adds), weight (points),
 * label (plain English for the UI), pattern (what to look for).
 */
const SIGNALS = [
  // ---- Request signals: asking the AI to do the work (subtract) ----
  {
    id: "direct_code_request",
    kind: "request",
    weight: 35,
    label: "Direct request to produce code",
    pattern:
      /\b(write|generate|create|make|build|code)\b[^.?!\n]{0,40}\b(function|program|script|class|code|algorithm|implementation)\b/i,
  },
  {
    id: "give_answer",
    kind: "request",
    weight: 35,
    label: "Asks for the answer or solution outright",
    pattern:
      /\b(give|tell|show)\s+me\s+(the\s+)?(answer|solution|result)\b|\bwhat\s+is\s+the\s+(answer|solution)\b|\bfinal\s+answer\b/i,
  },
  {
    id: "solve_for_me",
    kind: "request",
    weight: 30,
    label: "Asks the AI to solve or complete the task",
    pattern: /\b(solve|complete|finish|do)\s+(this|my|the|these)\b/i,
  },
  {
    id: "for_me",
    kind: "request",
    weight: 10,
    label: 'Hands the task over ("for me")',
    pattern: /\bfor\s+me\b/i,
  },

  // ---- Effort signals: showing your own thinking (add) ----
  {
    id: "attempt_marker",
    kind: "effort",
    weight: 25,
    label: "Mentions your own attempt",
    pattern:
      /\b(my\s+attempt|i\s+tried|i'?ve\s+tried|i\s+have\s+tried|here(?:'s|\s+is)\s+my|so\s+far|my\s+(?:code|answer|solution|approach|work))\b/i,
  },
  {
    id: "error_log",
    kind: "effort",
    weight: 25,
    label: "Includes an error message or location",
    pattern:
      /\b(error|exception|traceback|stack\s?trace|segfault)\b|\b(TypeError|ValueError|IndexError|KeyError|SyntaxError|NameError)\b|\bline\s+\d+\b/i,
  },
  {
    id: "code_present",
    kind: "effort",
    weight: 20,
    label: "Includes code you wrote",
    pattern:
      /```|\bdef\s+\w+\s*\(|\bfunction\s+\w*\s*\(|=>|\bfor\s*\(|\bwhile\s*\(|\bif\s*\(.+\)\s*\{/i,
  },
  {
    id: "stuck_point",
    kind: "effort",
    weight: 20,
    label: "Names a specific sticking point",
    pattern:
      /\b(i'?m|i\s+am)\s+(stuck|confused|not\s+sure|unsure)\b|\bi\s+(don'?t|do\s+not)\s+(understand|get)\b|\bnot\s+sure\s+(why|how|what)\b|\bwhere\s+(did|do)\s+i\s+go\s+wrong\b/i,
  },
  {
    id: "hint_request",
    kind: "effort",
    weight: 20,
    label: "Asks for a hint rather than the answer",
    pattern:
      /\b(hint|nudge|point\s+me|guide\s+me)\b|\bwithout\s+(giving|telling)\s+me\b/i,
  },
  {
    id: "why_question",
    kind: "effort",
    weight: 15,
    label: 'Asks "why" or "how" to understand',
    pattern: /\bwhy\b|\bhow\s+(does|do|come)\b/i,
  },
  {
    id: "reasoning_words",
    kind: "effort",
    weight: 10,
    label: "Shows reasoning (because, I think, pseudocode, approach)",
    pattern:
      /\b(because|since|therefore|i\s+think|i\s+assume|my\s+reasoning|pseudocode|approach)\b/i,
  },
];

/** Keep a number inside [min, max]. */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Split text into words (letters, digits, apostrophes). */
function countWords(text) {
  const words = text.match(/[A-Za-z0-9']+/g);
  return words ? words.length : 0;
}

/**
 * Find every place a signal's pattern matches. Returns [{text, start, end}].
 * Start/end positions are saved because later steps use them for highlighting.
 */
function findMatches(pattern, text) {
  const globalPattern = new RegExp(pattern.source, pattern.flags + "g");
  const matches = [];
  for (const m of text.matchAll(globalPattern)) {
    matches.push({
      text: m[0],
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return matches;
}

/**
 * Main entry point.
 *
 * @param {string} prompt - what the student typed in the chat box
 * @param {{attempt?: string}} [options] - optional text from the attempt box
 * @returns {{
 *   score: number,
 *   decision: "pass" | "needs_effort" | "empty",
 *   threshold: number,
 *   intent: "answer_seeking" | "attempting" | "neutral",
 *   requestPoints: number,
 *   effortPoints: number,
 *   signals: Array<{id, kind, label, weight, matches}>,
 *   wordCount: number
 * }}
 */
function analyzePrompt(prompt, options = {}) {
  const attempt = (options.attempt || "").trim();
  // ChatGPT and Mac keyboards often produce curly quotes; make them plain so
  // patterns like "I'm stuck" match. Replacements are 1:1, so positions stay valid.
  const text = String(prompt || "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"');
  const attemptText = attempt.replace(/[\u2018\u2019]/g, "'");

  const result = {
    score: ENGINE_CONFIG.baseScore,
    decision: "empty",
    threshold: ENGINE_CONFIG.passThreshold,
    intent: "neutral",
    requestPoints: 0,
    effortPoints: 0,
    signals: [],
    wordCount: 0,
  };

  if (!text.trim()) return result; // nothing to analyze

  // Look for signals in the prompt plus anything written in the attempt box.
  const combined = attemptText ? `${text}\n${attemptText}` : text;
  result.wordCount = countWords(combined);

  for (const signal of SIGNALS) {
    const matches = findMatches(signal.pattern, combined);
    if (matches.length === 0) continue;
    result.signals.push({
      id: signal.id,
      kind: signal.kind,
      label: signal.label,
      weight: signal.weight,
      matches,
    });
    if (signal.kind === "request") result.requestPoints += signal.weight;
    else result.effortPoints += signal.weight;
  }

  // A real attempt typed in the attempt box counts as effort by itself.
  if (countWords(attemptText) >= ENGINE_CONFIG.attemptFieldMinWords) {
    result.signals.push({
      id: "attempt_field",
      kind: "effort",
      label: "Wrote an attempt in the attempt box",
      weight: ENGINE_CONFIG.attemptFieldWeight,
      matches: [],
    });
    result.effortPoints += ENGINE_CONFIG.attemptFieldWeight;
  }

  // Small bonus for longer prompts (more of the student's own thinking).
  // Capped, and easy to pad, so it is deliberately weak.
  const extraWords = result.wordCount - ENGINE_CONFIG.lengthBonusStartWords;
  if (extraWords > 0) {
    const bonus = clamp(
      Math.floor(extraWords / 4),
      0,
      ENGINE_CONFIG.lengthBonusCap
    );
    if (bonus > 0) {
      result.signals.push({
        id: "length_bonus",
        kind: "effort",
        label: "Longer, more detailed prompt",
        weight: bonus,
        matches: [],
      });
      result.effortPoints += bonus;
    }
  }

  result.score = clamp(
    ENGINE_CONFIG.baseScore + result.effortPoints - result.requestPoints,
    ENGINE_CONFIG.minScore,
    ENGINE_CONFIG.maxScore
  );

  result.decision =
    result.score >= ENGINE_CONFIG.passThreshold ? "pass" : "needs_effort";

  if (result.requestPoints > result.effortPoints)
    result.intent = "answer_seeking";
  else if (result.effortPoints > 0) result.intent = "attempting";

  return result;
}

// Export for Node tests AND for Chrome (content scripts share one global scope).
const StudyGuardEngine = { analyzePrompt, ENGINE_CONFIG, SIGNALS };
if (typeof module !== "undefined" && module.exports) {
  module.exports = StudyGuardEngine;
} else {
  globalThis.StudyGuardEngine = StudyGuardEngine;
}
