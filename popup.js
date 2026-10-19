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

// Open Chrome's side panel (needs a click, which this is). Chrome 116 or newer.
document.querySelector("#open-map").addEventListener("click", async () => {
  try {
    const currentWindow = await chrome.windows.getCurrent();
    await chrome.sidePanel.open({ windowId: currentWindow.id });
    window.close();
  } catch (error) {
    statusMessage.textContent =
      "Could not open the side panel. Try Chrome's side panel menu instead.";
    console.error("StudyGuard could not open the side panel:", error);
  }
});

// ---- Learning journal controls (Step 7) ----
const journalCheckbox = document.querySelector("#journal-opt-in");
const journalCount = document.querySelector("#journal-count");
const clearJournalButton = document.querySelector("#clear-journal");
const journal = StudyGuardJournal.createJournal(chrome.storage.local);

async function loadJournal() {
  try {
    journalCheckbox.checked = await journal.isEnabled();
    const entries = await journal.getAll();
    journalCount.textContent = entries.length + (entries.length === 1 ? " entry" : " entries");
    journalCheckbox.disabled = false;
  } catch (error) {
    journalCount.textContent = "Could not load journal.";
    console.error("StudyGuard could not load the journal:", error);
  }
}

journalCheckbox.addEventListener("change", async () => {
  try {
    await journal.setEnabled(journalCheckbox.checked);
  } catch (error) {
    journalCheckbox.checked = !journalCheckbox.checked; // restore the old state
    console.error("StudyGuard could not save the journal setting:", error);
  }
});

clearJournalButton.addEventListener("click", async () => {
  if (!confirm("Delete all journal entries on this device? This cannot be undone.")) return;
  await journal.clear();
  loadJournal();
});

// Open the printable journal page in a new tab (Step 8).
document.querySelector("#open-journal").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("journalpage.html") });
});

loadJournal();

// Restore the setting each time the popup opens.
loadSettings();
