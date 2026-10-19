/**
 * eventlog.js - StudyGuard local event log (Step 4)
 *
 * WHAT THIS FILE DOES
 * Records what happened at each submit, so the journal and analytics (later
 * steps) have data. Each event is tiny:
 *   { time, site, action, score, signalIds }
 *   action = "passed" (sent normally), "held" (StudyGuard paused it),
 *            "sent_anyway" (student chose to send after the pause)
 *
 * PRIVACY BY DESIGN
 * - The text of the question and attempt is NEVER stored here. Only the score
 *   and the names of the signals that fired.
 * - Everything stays in chrome.storage.local on this device.
 * - Only fields on a fixed whitelist are kept, even if more are passed in.
 * - The log is capped at 500 events (oldest dropped first) and can be cleared.
 *
 * `area` is anything with get/set/remove like chrome.storage.local, so tests
 * can pass a fake one.
 */
(function () {
  const LOG_KEY = "studyguardEvents";
  const MAX_EVENTS = 500;
  const ACTIONS = ["passed", "held", "sent_anyway"];

  /** Keep only whitelisted, well-formed fields. Returns null if unusable. */
  function sanitize(event, now) {
    if (!event || !ACTIONS.includes(event.action)) return null;
    const score = Number(event.score);
    return {
      time: now(),
      site: String(event.site || "unknown").slice(0, 40),
      action: event.action,
      score: Number.isFinite(score)
        ? Math.min(100, Math.max(0, Math.round(score)))
        : null,
      signalIds: Array.isArray(event.signalIds)
        ? event.signalIds.slice(0, 20).map((id) => String(id).slice(0, 40))
        : [],
    };
  }

  function createEventLog(area, now = () => Date.now()) {
    // Reads and writes are queued so quick back-to-back events cannot overwrite each other.
    let queue = Promise.resolve();

    function enqueue(task) {
      const run = queue.then(task);
      queue = run.catch(() => {}); // a failure must not block later events
      return run;
    }

    return {
      /** Add one event. Resolves to the stored event, or null if it was rejected. */
      add(event) {
        return enqueue(async () => {
          const clean = sanitize(event, now);
          if (!clean) return null;
          const stored = await area.get({ [LOG_KEY]: [] });
          const events = [...stored[LOG_KEY], clean].slice(-MAX_EVENTS);
          await area.set({ [LOG_KEY]: events });
          return clean;
        });
      },
      /** All events, oldest first. */
      getAll() {
        return enqueue(
          async () => (await area.get({ [LOG_KEY]: [] }))[LOG_KEY]
        );
      },
      /** Delete every event. */
      clear() {
        return enqueue(() => area.remove(LOG_KEY));
      },
    };
  }

  const api = { createEventLog, LOG_KEY, MAX_EVENTS, ACTIONS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else globalThis.StudyGuardEventLog = api;
})();
