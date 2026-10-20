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
 * RULE SETS (Step 10d)
 * - "v1": the original rules, kept exactly so results can be compared.
 * - "v2" (default): v1 plus
 *     * extra REQUEST rules for polite and indirect wording ("could you put
 *       together a complete solution", "full code", "code only", a few common
 *       typos and a little Spanish). They only apply when no v1 request rule
 *       fired, so every prompt v1 already caught scores exactly as before.
 *     * an attempt box that must show some variety of words (filler such as
 *       "asdf asdf asdf" earns no credit) and earns extra credit when it is
 *       substantial (12+ words, 8+ different words).
 *     * "for me" is ignored when the prompt asks for a study aid (summarise,
 *       explain, quiz, check, review...).
 *   Choose per call with analyzePrompt(prompt, { ruleSet: "v1" | "v2" }).
 *
 * KNOWN LIMITS (also documented in docs/project-plan.md)
 * - Pattern matching cannot judge whether an attempt is correct or sincere.
 * - Padding a prompt with filler phrases can raise the score (red-team test E5).
 * - Mostly English; indirection ("print it") and role-play are not caught.
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
  ruleSet: "v2", // default rule set: "v1" or "v2"
  attemptFieldMinDistinct: 4, // v2: different words needed for the attempt to count
  attemptDepthMinWords: 12, // v2: a substantial attempt has at least this many words...
  attemptDepthMinDistinct: 8, // ...and at least this many different words
  attemptDepthWeight: 15, // v2: extra points for a substantial attempt
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


// ---- v2 request rules (only used when no v1 request rule fired) -------------
// Built from small named pieces so each part can be read and tested on its own.

// Words that introduce a request: sentence start, "please", "could you",
// "would you mind", "if you could", "help me by", ...
const LEAD =
  "(?:^|[.!?:;\\n]\\s*" +
  "|\\b(?:please|plz|pls|just|kindly|then|and|also)\\s+" +
  "|\\b(?:can|could|would|will)\\s+you\\s+(?:please\\s+|possibly\\s+|just\\s+|maybe\\s+|kindly\\s+)?" +
  "|\\bwould\\s+you\\s+(?:mind\\s+|be\\s+able\\s+to\\s+)" +
  "|\\bif\\s+you\\s+(?:could|can|would)\\s+(?:just\\s+)?" +
  "|\\b(?:need|want)\\s+you\\s+to\\s+" +
  "|\\bhelp\\s+me\\s+by\\s+" +
  "|\\b(?:possible|chance)\\s+(?:for\\s+you\\s+to|you\\s+could)\\s+" +
  "|\\bi'?d\\s+like\\s+you\\s+to\\s+)";

// "do it for me" verbs, including -ing forms and a few common typos.
const VERB =
  "(?:giv(?:e|ing)|provid(?:e|ing)|suppl(?:y|ying)|produc(?:e|ing)|show(?:ing)?|send(?:ing)?|draft(?:ing)?" +
  "|writ(?:e|ing)|wrte|wirte|compos(?:e|ing)|generat(?:e|ing)|creat(?:e|ing)|mak(?:e|ing)|build(?:ing)?" +
  "|implement(?:ing)?|cod(?:e|ing)|prepar(?:e|ing)|put(?:ting)?\\s+together|typ(?:e|ing)|print(?:ing)?" +
  "|output|finish(?:ing)?|complet(?:e|ing)|do(?:ing)?)\\b(?:\\s+(?:out|up|together|down))?";

const OBJ_PREFIX = "(?:(?:me|us)\\s+)?(?:(?:the|a|an|my|our|this|your)\\s+)?";
const SIZE = "(?:\\d+[-\\s]*(?:words?|pages?|paragraphs?)\\s+)?";
const ADJ =
  "(?:(?:full|whole|entire|complete|completed|finished|final|working|correct|actual|polished|ready[-\\s]to[-\\s]submit|full[-\\s]length)\\s+){0,2}";
const VERSION = "(?:version\\s+of\\s+(?:the\\s+|my\\s+|our\\s+)?)?";
// up to two topic words ("binary search", "history"), but not "my OWN solution"
const TOPIC = "(?:(?!own\\b|first\\b|rough\\b|initial\\b)[a-z'-]+\\s+){0,2}";
const DELIVERABLE =
  "(?:source\\s+code|code|solutions?|answers?|implementations?|programs?|prgrams?|progams?|scripts?|func" +
  "|essays?|papers?|reports?|write-?ups?|assignments?|homework|worksheets?|problem\\s+sets?|lab\\s+reports?" +
  "|reflections?(?:\\s+papers?)?|discussion\\s+posts?|posts?)\\b";

// 1) "could you please put together a complete solution for ..."
const ASK_FOR_DELIVERABLE =
  LEAD + VERB + "\\s+" + OBJ_PREFIX + SIZE + ADJ + VERSION + TOPIC + DELIVERABLE;
// 2) "full code", "the complete solution", "finished script"
const FINISHED_VERSION =
  "\\b(?:full|whole|entire|complete|completed|finished|final|ready[-\\s]to[-\\s]submit)\\s+(?:working\\s+)?" +
  "(?:source\\s+code|code|solutions?|implementations?|programs?|scripts?|essays?|papers?|write-?ups?|version|answers?)\\b";
// 3) a little Spanish ("dame el código completo")
const SPANISH =
  "\\b(?:dame|escr[ií]beme|escribe|hazme|genera|resuelve)\\b[^.?!\\n]{0,40}\\b(?:c[oó]digo|soluci[oó]n|respuesta|programa|funci[oó]n|ensayo|tarea)\\b";
// 4) "code only", "just the answer", ", no explanation"
const ANSWER_ONLY =
  "\\b(?:only|just)\\s+(?:with\\s+|the\\s+)?(?:code|answer|solution)\\b" +
  "|\\b(?:code|answer|solution|implementation)\\s+only\\b" +
  "|(?:^|[,.;:]\\s*)no\\s+explanations?\\b";

const V2_SIGNALS = [
  {
    id: "deliverable_request",
    kind: "request",
    weight: 35,
    label: "Asks for a finished solution, code or essay",
    pattern: new RegExp([ASK_FOR_DELIVERABLE, FINISHED_VERSION, SPANISH].join("|"), "i"),
  },
  {
    id: "answer_only",
    kind: "request",
    weight: 30,
    label: 'Asks for "just the answer" or code only',
    pattern: new RegExp(ANSWER_ONLY, "i"),
  },
];

// Every signal the engine can report (for labels in the dashboard).
const ALL_SIGNALS = [...SIGNALS, ...V2_SIGNALS];

// v2: asking for a study aid ("summarize", "quiz me") is not handing over graded work.
const STUDY_AID = /\b(summari[sz]\w*|explain\w*|quiz\w*|check\w*|review\w*|rephras\w*|proofread\w*|outline\w*|simplif\w*|clarif\w*|flashcards?)\b/i;

/** Word count and number of different words, for judging an attempt. */
function attemptStats(text) {
  const words = text.toLowerCase().match(/[a-z0-9']+/g) || [];
  return { count: words.length, distinct: new Set(words).size };
}

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
 * @param {{attempt?: string, ruleSet?: "v1"|"v2"}} [options] - optional text from
 *   the attempt box, and which rule set to use (default ENGINE_CONFIG.ruleSet)
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
  const v2 = (options.ruleSet || ENGINE_CONFIG.ruleSet) !== "v1";
  // ChatGPT and Mac keyboards often produce curly quotes; make them plain so
  // patterns like "I'm stuck" match. Replacements are 1:1, so positions stay valid.
  const text = String(prompt || "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"');
  const attemptText = attempt.replace(/[‘’]/g, "'");

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

  function addSignal(signal, matches) {
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

  for (const signal of SIGNALS) {
    // v2: "for me" is ignored when the student asks for a study aid.
    if (v2 && signal.id === "for_me" && STUDY_AID.test(combined)) continue;
    const matches = findMatches(signal.pattern, combined);
    if (matches.length === 0) continue;
    addSignal(signal, matches);
  }

  // v2 request rules: only when none of the v1 request rules fired, so prompts
  // v1 already caught keep exactly their v1 score.
  if (v2 && result.requestPoints === 0) {
    for (const signal of V2_SIGNALS) {
      const matches = findMatches(signal.pattern, combined);
      if (matches.length > 0) addSignal(signal, matches);
    }
  }

  // A real attempt typed in the attempt box counts as effort by itself.
  // v2 also requires some variety of words, so filler earns nothing.
  const stats = attemptStats(attemptText);
  const attemptCounts =
    countWords(attemptText) >= ENGINE_CONFIG.attemptFieldMinWords &&
    (!v2 || stats.distinct >= ENGINE_CONFIG.attemptFieldMinDistinct);
  if (attemptCounts) {
    result.signals.push({
      id: "attempt_field",
      kind: "effort",
      label: "Wrote an attempt in the attempt box",
      weight: ENGINE_CONFIG.attemptFieldWeight,
      matches: [],
    });
    result.effortPoints += ENGINE_CONFIG.attemptFieldWeight;

    // v2: a substantial attempt earns extra credit.
    if (
      v2 &&
      stats.count >= ENGINE_CONFIG.attemptDepthMinWords &&
      stats.distinct >= ENGINE_CONFIG.attemptDepthMinDistinct
    ) {
      result.signals.push({
        id: "attempt_depth",
        kind: "effort",
        label: "Wrote a substantial attempt",
        weight: ENGINE_CONFIG.attemptDepthWeight,
        matches: [],
      });
      result.effortPoints += ENGINE_CONFIG.attemptDepthWeight;
    }
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

  if (result.requestPoints > result.effortPoints) result.intent = "answer_seeking";
  else if (result.effortPoints > 0) result.intent = "attempting";

  return result;
}

// Export for Node tests AND for Chrome (content scripts share one global scope).
const StudyGuardEngine = { analyzePrompt, ENGINE_CONFIG, SIGNALS, V2_SIGNALS, ALL_SIGNALS };
if (typeof module !== "undefined" && module.exports) {
  module.exports = StudyGuardEngine;
} else {
  globalThis.StudyGuardEngine = StudyGuardEngine;
}
