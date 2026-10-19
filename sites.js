/**
 * sites.js - StudyGuard site adapters (Step 4)
 *
 * WHAT THIS FILE DOES
 * Holds everything that is specific to one chat website, so the rest of
 * StudyGuard does not care whether it is running on ChatGPT or Claude.
 * For each site it knows:
 *   - how to recognise the message box (CSS selectors)
 *   - how to recognise the Send button (CSS selectors, plus a generic fallback)
 *   - where to put the StudyGuard panel (a container near the message box)
 *
 * WHY A SEPARATE FILE
 * Chat sites change their page structure often. When a selector breaks, this
 * is the only file you edit. The selectors below are best-effort starting
 * points; verify them with the Console check in the README.
 *
 * Selectors are tried in order; the first visible match wins.
 */
(function () {
  const ADAPTERS = {
    chatgpt: {
      name: "ChatGPT",
      hosts: ["chatgpt.com"],
      inputSelectors: [
        '[contenteditable="true"][role="textbox"][data-composer-markdown]',
        "#prompt-textarea",
      ],
      sendButtonSelectors: [
        '[data-testid="send-button"]',
        "#composer-submit-button",
        'button[aria-label="Send"]',
        'button[aria-label="Send prompt"]',
      ],
      anchorSelectors: ["form"],
    },
    claude: {
      name: "Claude",
      hosts: ["claude.ai"],
      inputSelectors: [
        'div[contenteditable="true"].ProseMirror',
        '[contenteditable="true"][role="textbox"]',
      ],
      sendButtonSelectors: [
        'button[aria-label="Send message"]',
        'button[aria-label="Send Message"]',
      ],
      anchorSelectors: ["fieldset", "form"],
    },
  };

  /** Find the adapter for a hostname such as "chatgpt.com". Returns null if unsupported. */
  function getAdapter(hostname) {
    const host = String(hostname || "").toLowerCase();
    for (const adapter of Object.values(ADAPTERS)) {
      if (adapter.hosts.some((h) => host === h || host.endsWith("." + h))) {
        return adapter;
      }
    }
    return null;
  }

  /** Does this button look like a Send button? (selector match OR "send" in its labels) */
  function isSendButton(adapter, button) {
    if (!button) return false;
    const bySelector = adapter.sendButtonSelectors.some((sel) => {
      try {
        return button.matches(sel);
      } catch (e) {
        return false;
      }
    });
    if (bySelector) return true;
    const label = [
      button.getAttribute("aria-label") || "",
      (button.dataset && button.dataset.testid) || "",
      button.id || "",
    ].join(" ");
    // "Send feedback" style buttons are excluded by the composer-containment
    // check in content.js, so a loose match is safe here.
    return /\b(send|submit)\b/i.test(label);
  }

  /**
   * The container that holds the message box and its buttons.
   * StudyGuard places its panel directly before this container.
   * Falls back to an ancestor a few levels up when no known container matches.
   */
  function findAnchor(adapter, input) {
    if (!input) return null;
    for (const sel of adapter.anchorSelectors) {
      const found = input.closest(sel);
      if (found) return found;
    }
    let node = input;
    for (let i = 0; i < 4; i++) {
      const parent = node.parentElement;
      if (!parent || parent === document.body) break;
      node = parent;
    }
    return node;
  }

  /** Find the visible, enabled Send button belonging to this message box, or null. */
  function findSendButton(adapter, input) {
    const scope = findAnchor(adapter, input) || document;
    const usable = (b) =>
      !b.disabled &&
      (typeof b.getClientRects !== "function" || b.getClientRects().length > 0);
    for (const sel of adapter.sendButtonSelectors) {
      const button = [...scope.querySelectorAll(sel)].find(usable);
      if (button) return button;
    }
    return (
      [...scope.querySelectorAll("button")].find(
        (b) => usable(b) && isSendButton(adapter, b)
      ) || null
    );
  }

  const api = {
    ADAPTERS,
    getAdapter,
    isSendButton,
    findAnchor,
    findSendButton,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else globalThis.StudyGuardSites = api;
})();
