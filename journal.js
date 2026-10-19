/**
 * journal.js - StudyGuard learning journal storage (Step 7)
 *
 * WHAT THIS FILE DOES
 * Keeps an OPT-IN record of the student's trial-and-error path: for each
 * submit it saves what they asked, what they tried, what StudyGuard decided and
 * why. Step 8 turns this into the "XAI Learning Journal" they can hand in.
 *
 * HOW IT DIFFERS FROM eventlog.js
 *   eventlog.js  always on, never stores any text (scores and signal ids only).
 *   journal.js   OFF by default; when the student turns it on it DOES store
 *                their question and attempt text, because the journal is the
 *                student's own record to hand in.
 *
 * PRIVACY RULES
 * - Off until the student switches it on in the popup. The flag is checked on
 *   every add(), so turning it off stops saving immediately.
 * - Stored only in chrome.storage.local on this device. Nothing is sent anywhere.
 * - Only whitelisted fields are kept, with length limits.
 * - Capped at 200 entries (oldest dropped first). The student can clear it.
 *
 * `area` is anything with get/set/remove like chrome.storage.local, so tests
 * can pass a fake one. No DOM code, so it runs in Chrome and in Node tests.
 */
(function () {
  const JOURNAL_KEY = "studyguardJournal";
  const OPT_IN_KEY = "studyguardJournalOptIn";
  const MAX_ENTRIES = 200;
  const MAX_TEXT = 4000;
  const ACTIONS = ["passed", "held", "sent_anyway"];

  const text = (value, max) => String(value == null ? "" : value).slice(0, max);
  const list = (values, itemMax) =>
    (Array.isArray(values) ? values : [])
      .slice(0, 10)
      .map((v) => text(v, itemMax));

  /**
   * Build a journal entry from what content.js knows at submit time.
   * @param {{action: string, site: string, question: string, attempt: string, map: object|null}} info
   */
  function makeEntry(info) {
    const map = info.map || null;
    return {
      action: info.action,
      site: info.site,
      question: info.question,
      attempt: info.attempt,
      score: map ? map.score : null,
      threshold: map ? map.threshold : null,
      intent: map ? map.intent.label : "",
      effort: map ? map.effort.level : "",
      redWords: map
        ? map.words
            .filter((w) => w.effect === "answer_seeking")
            .map((w) => w.text)
        : [],
      advice: map && map.unlock ? map.unlock.steps.map((s) => s.advice) : [],
    };
  }

  /** Keep only whitelisted, well-formed, length-limited fields. Null if unusable. */
  function sanitize(entry, now) {
    if (!entry || !ACTIONS.includes(entry.action)) return null;
    const score = Number(entry.score);
    const threshold = Number(entry.threshold);
    return {
      time: now(),
      site: text(entry.site || "unknown", 40),
      action: entry.action,
      score:
        entry.score != null && Number.isFinite(score)
          ? Math.min(100, Math.max(0, Math.round(score)))
          : null,
      threshold:
        entry.threshold != null && Number.isFinite(threshold)
          ? Math.round(threshold)
          : null,
      intent: text(entry.intent, 80),
      effort: text(entry.effort, 20),
      question: text(entry.question, MAX_TEXT),
      attempt: text(entry.attempt, MAX_TEXT),
      redWords: list(entry.redWords, 40),
      advice: list(entry.advice, 300),
    };
  }

  function createJournal(area, now = () => Date.now()) {
    // Reads and writes are queued so quick back-to-back entries cannot overwrite each other.
    let queue = Promise.resolve();
    function enqueue(task) {
      const run = queue.then(task);
      queue = run.catch(() => {});
      return run;
    }

    return {
      /** Is the journal switched on? */
      isEnabled() {
        return enqueue(
          async () =>
            (await area.get({ [OPT_IN_KEY]: false }))[OPT_IN_KEY] === true
        );
      },
      /** Switch the journal on or off. Turning it off keeps existing entries. */
      setEnabled(on) {
        return enqueue(() => area.set({ [OPT_IN_KEY]: on === true }));
      },
      /** Add one entry. Resolves to the stored entry, or null if off or rejected. */
      add(entry) {
        return enqueue(async () => {
          const stored = await area.get({
            [OPT_IN_KEY]: false,
            [JOURNAL_KEY]: [],
          });
          if (stored[OPT_IN_KEY] !== true) return null;
          const clean = sanitize(entry, now);
          if (!clean) return null;
          await area.set({
            [JOURNAL_KEY]: [...stored[JOURNAL_KEY], clean].slice(-MAX_ENTRIES),
          });
          return clean;
        });
      },
      /** All entries, oldest first. */
      getAll() {
        return enqueue(
          async () => (await area.get({ [JOURNAL_KEY]: [] }))[JOURNAL_KEY]
        );
      },
      /** Delete every entry (the on/off choice is kept). */
      clear() {
        return enqueue(() => area.remove(JOURNAL_KEY));
      },
    };
  }

  const api = {
    createJournal,
    makeEntry,
    JOURNAL_KEY,
    OPT_IN_KEY,
    MAX_ENTRIES,
    MAX_TEXT,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else globalThis.StudyGuardJournal = api;
})();
