// Keep our variables separate from other extension scripts.
(() => {
  const panelId = "studyguard-panel";

  function updatePanel(enabled) {
    const existingPanel = document.getElementById(panelId);

    if (!enabled) {
      // Remove our panel when study mode is off.
      existingPanel?.remove();
      return;
    }

    // Avoid creating duplicate panels.
    if (existingPanel) return;

    const panel = document.createElement("aside");
    panel.id = panelId;
    panel.setAttribute("aria-label", "StudyGuard study reminder");

    const heading = document.createElement("h2");
    heading.textContent = "StudyGuard";

    const reminder = document.createElement("p");
    reminder.textContent =
      "Before asking AI, what have you tried—or where are you stuck?";

    panel.append(heading, reminder);
    document.body.append(panel);
  }

  // Read the current setting whenever we need to synchronize the page.
  async function syncPanel() {
    try {
      const settings = await chrome.storage.local.get({
        studyModeEnabled: false,
      });

      updatePanel(settings.studyModeEnabled);
    } catch (error) {
      console.error("StudyGuard could not load study mode:", error);
    }
  }

  // React when the popup changes the saved setting.
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.studyModeEnabled) {
      syncPanel();
    }
  });

  // Apply the saved setting when this page first loads.
  syncPanel();
})();
