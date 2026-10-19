// Find the HTML elements we need to read or update.
const studyModeCheckbox = document.querySelector("#study-mode");
const statusMessage = document.querySelector("#status");

// Show the saved study mode preference.
function showStatus(enabled) {
  statusMessage.textContent = enabled
    ? "Study mode preference: on."
    : "Study mode preference: off.";
}

async function loadSettings() {
  try {
    // Use false if the user has never saved this setting.
    const settings = await chrome.storage.local.get({
      studyModeEnabled: false,
    });

    studyModeCheckbox.checked = settings.studyModeEnabled;
    showStatus(settings.studyModeEnabled);
    studyModeCheckbox.disabled = false;
  } catch (error) {
    statusMessage.textContent = "Could not load settings. Reopen the popup.";
    console.error("StudyGuard could not load settings:", error);
  }
}

studyModeCheckbox.addEventListener("change", async () => {
  const enabled = studyModeCheckbox.checked;

  // Prevent another change while this one is being saved.
  studyModeCheckbox.disabled = true;

  try {
    await chrome.storage.local.set({
      studyModeEnabled: enabled,
    });

    showStatus(enabled);
  } catch (error) {
    // Restore the previous state if saving fails.
    studyModeCheckbox.checked = !enabled;
    statusMessage.textContent = "Could not save. Please try again.";
    console.error("StudyGuard could not save settings:", error);
  } finally {
    studyModeCheckbox.disabled = false;
  }
});

// Restore the setting each time the popup opens.
loadSettings();
