/**
 * interceptor.js - StudyGuard submit interceptor (Step 4)
 *
 * WHAT THIS FILE DOES
 * Watches for the two ways a student sends a message (pressing Enter in the
 * message box, or clicking the Send button) and asks a callback whether to
 * hold it. If the callback says hold, the original action is cancelled so the
 * site never sees it.
 *
 * This file contains NO policy. It does not know about scores or advice. The
 * callback (in content.js) decides. That keeps this file small and testable.
 *
 * SAFETY RULES BUILT IN
 * - Shift+Enter (new line) and IME composition (typing Chinese, Japanese, etc.)
 *   are never treated as a send.
 * - Clicks inside the StudyGuard panel are ignored.
 * - If anything throws, the message is allowed through ("fail open"), so a bug
 *   in StudyGuard can never trap a student's message.
 * - Listeners use the capture phase so they run before the site's own handlers.
 */
(function () {
  /**
   * @param {object} deps
   * @param {() => Element|null} deps.getInput - the visible message box
   * @param {(button: Element) => boolean} deps.isSendButton
   * @param {(el: Element) => boolean} deps.isInsidePanel
   * @param {(info: {source: "enter"|"click"}) => {hold: boolean}} deps.onSubmit
   * @returns {{keydown: Function, click: Function}} handlers taking an event
   */
  function makeHandlers(deps) {
    function maybeHold(event, source) {
      let verdict;
      try {
        verdict = deps.onSubmit({ source });
      } catch (error) {
        console.error("StudyGuard failed open:", error);
        return; // fail open: let the site send the message
      }
      if (verdict && verdict.hold) {
        event.preventDefault();
        event.stopPropagation();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      }
    }

    function keydown(event) {
      if (event.key !== "Enter" || event.shiftKey) return;
      if (event.isComposing || event.keyCode === 229) return; // IME in progress
      const input = deps.getInput();
      if (!input || !input.contains(event.target)) return;
      maybeHold(event, "enter");
    }

    function click(event) {
      const target = event.target;
      const button = target && target.closest ? target.closest("button") : null;
      if (!button) return;
      if (deps.isInsidePanel(button)) return;
      if (!deps.isSendButton(button)) return;
      maybeHold(event, "click");
    }

    return { keydown, click };
  }

  /** Attach the handlers to a document in the capture phase. */
  function install(doc, deps) {
    const handlers = makeHandlers(deps);
    doc.addEventListener("keydown", handlers.keydown, true);
    doc.addEventListener("click", handlers.click, true);
    return handlers;
  }

  const api = { makeHandlers, install };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else globalThis.StudyGuardInterceptor = api;
})();
