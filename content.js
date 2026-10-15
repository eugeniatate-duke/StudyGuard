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
    panel.setAttribute("aria-label", "StudyGuard study reminder");

    const heading = document.createElement("h2");
    heading.textContent = "StudyGuard";

    const reminder = document.createElement("p");
    reminder.textContent =
      "Before asking AI, what have you tried—or where are you stuck?";

    panel.append(heading, reminder);
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
