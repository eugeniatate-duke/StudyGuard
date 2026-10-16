(() => {
  const panelId = "studyguard-panel";

  // Match the editable input shown in your screenshots.
  const inputSelector =
    '[contenteditable="true"][role="textbox"][data-composer-markdown]';

  let studyModeEnabled = false;
  let updateScheduled = false;

  function createPanel() {
    const panel = document.createElement("aside");
    panel.id = panelId;
    panel.setAttribute("aria-label", "StudyGuard study support");

    // Remember which conversation this panel belongs to.
    panel.dataset.conversationPath = window.location.pathname;

    const heading = document.createElement("h2");
    heading.textContent = "StudyGuard";

    const label = document.createElement("label");
    label.htmlFor = "studyguard-attempt";
    label.textContent = "What have you tried—or where are you stuck?";

    const attempt = document.createElement("textarea");
    attempt.id = "studyguard-attempt";
    attempt.rows = 3;
    attempt.placeholder =
      "Write your initial reasoning, or describe what you don't understand.";
    attempt.setAttribute("aria-describedby", "studyguard-attempt-note");

    const note = document.createElement("p");
    note.id = "studyguard-attempt-note";
    note.textContent =
      "Optional. This draft clears when you switch chats, refresh, or turn study mode off.";

    panel.append(heading, label, attempt, note);
    return panel;
  }

  function updatePanel() {
    const existingPanel = document.getElementById(panelId);

    if (!studyModeEnabled) {
      existingPanel?.remove();
      return;
    }

    // Navigation can leave hidden chat inputs in the page.
    // Find the first matching input that actually occupies visible space.
    const input = [...document.querySelectorAll(inputSelector)].find(
      (candidate) => {
        const rect = candidate.getBoundingClientRect();
        const style = getComputedStyle(candidate);

        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          style.visibility !== "collapse"
        );
      }
    );

    const form = input?.closest("form");

    // Hide our panel if the expected input or form isn't available.
    if (!form) {
      existingPanel?.remove();
      return;
    }

    const panel = existingPanel ?? createPanel();

    // Clear the previous attempt when moving to a different conversation.
    const currentPath = window.location.pathname;

    if (panel.dataset.conversationPath !== currentPath) {
      panel.querySelector("#studyguard-attempt").value = "";
      panel.dataset.conversationPath = currentPath;
    }

    // Only change the page if the panel needs to be placed or moved.
    if (form.previousElementSibling !== panel) {
      form.before(panel);
    }
  }

  function scheduleUpdate() {
    // Combine multiple page changes into one update per frame.
    if (updateScheduled) return;

    updateScheduled = true;

    requestAnimationFrame(() => {
      updateScheduled = false;
      updatePanel();
    });
  }

  async function syncSettings() {
    try {
      const settings = await chrome.storage.local.get({
        studyModeEnabled: false,
      });

      studyModeEnabled = settings.studyModeEnabled;
      scheduleUpdate();
    } catch (error) {
      console.error("StudyGuard could not load study mode:", error);
    }
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.studyModeEnabled) {
      syncSettings();
    }
  });

  // ChatGPT can replace page elements without a full browser refresh.
  // Watch for elements being added or removed so we can restore placement.
  const observer = new MutationObserver(scheduleUpdate);

  observer.observe(document.body, {
    childList: true,
    subtree: true,

    // Also detect when an element becomes the chat input.
    attributes: true,
    attributeFilter: [
      "contenteditable",
      "role",
      "data-composer-markdown",
      "class",
      "style",
      "hidden",
    ],
  });

  syncSettings();
})();
