
const HINT_LEVELS = {
  1: {
    label: "Level 1: Conceptual nudge",
    instruction:
      "Give a conceptual nudge only. Name the idea I should think about, but show no steps or calculations.",
  },
  2: {
    label: "Level 2: Point to the step",
    instruction:
      "Point to the specific step or mistake in my attempt that I should revisit, without fixing it for me.",
  },
  3: {
    label: "Level 3: One worked step",
    instruction:
      "Work through only the next single step, then stop and ask me to continue from there.",
  },
};

function buildHintRequest(question, attempt, level = 1) {
  const config = HINT_LEVELS[level] ?? HINT_LEVELS[1];

  return [
    "Help me learn by giving one useful hint at a time.",
    "Do not provide the complete solution or final answer yet.",
    config.instruction,
    "If my attempt contains a mistake, guide me toward noticing it.",
    "End with one question or small next step for me to try.",
    "",
    "Problem:",
    question,
    "",
    "My attempt or sticking point:",
    attempt || "I’m not sure how to start. Give me a starting hint.",
  ].join("\n");
}

// Lets you unit-test the builder in Node without affecting Chrome.
if (typeof module !== "undefined") {
  module.exports = { buildHintRequest, HINT_LEVELS };
}

(() => {
  const panelId = "studyguard-panel";

  // Which chat site are we on? (ChatGPT or Claude; see sites.js)
  const site = StudyGuardSites.getAdapter(window.location.hostname);
  if (!site) return; // not a supported chat site, so do nothing

  // The message-box selectors now come from the site adapter.
  const inputSelector = site.inputSelectors.join(", ");

  let studyModeEnabled = false;
  let updateScheduled = false;

  function findVisibleChatInput() {
    return [...document.querySelectorAll(inputSelector)].find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      const style = getComputedStyle(candidate);

      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.visibility !== "collapse"
      );
    });
  }

  // Draws the prompt as read-only text where each important word gets a colored
  // background. Red = pushed the score toward "needs more effort".
  // Green = showed your own thinking. Hover a word for the exact point change.
  // Words are also underlined (solid = red, dotted = green) so the meaning
  // doesn't depend on color alone.
  function renderBreakdown(container, prompt, explanation) {
    container.replaceChildren(); // clear any previous breakdown

    const title = document.createElement("p");
    title.className = "studyguard-breakdown-title";
    title.textContent = "Which words moved your score";

    const line = document.createElement("p");
    line.className = "studyguard-breakdown-text";

    let cursor = 0;
    for (const token of explanation.tokens) {
      // Keep spaces and punctuation between words exactly as typed.
      if (token.start > cursor) line.append(prompt.slice(cursor, token.start));

      const span = document.createElement("span");
      span.textContent = token.text;

      if (token.flagged) {
        const isRed = token.effect === "answer_seeking";
        const alpha = (0.2 + 0.6 * token.importance).toFixed(2);
        span.className = isRed
          ? "studyguard-word-red"
          : "studyguard-word-green";
        span.style.background = isRed
          ? `rgba(200, 50, 50, ${alpha})`
          : `rgba(40, 150, 90, ${alpha})`;

        const points = Math.abs(token.delta);
        span.title = isRed
          ? `Removing "${token.text}" would raise your score by ${points} points` +
            (token.flipsDecision ? " and let the prompt pass" : "")
          : `Removing "${token.text}" would lower your score by ${points} points`;
      }

      line.append(span);
      cursor = token.end;
    }
    if (cursor < prompt.length) line.append(prompt.slice(cursor));

    const legend = document.createElement("p");
    legend.className = "studyguard-breakdown-legend";
    legend.textContent =
      "Red (solid underline): pushes toward needing more effort. " +
      "Green (dotted underline): shows your own thinking. " +
      "This explains a simple rule-based scorer, not a judgment of you.";

    container.append(title, line, legend);
  }

  // Shows the counterfactual advice ("To unlock this prompt...") as a numbered
  // list under the word breakdown. The advice was verified against the engine.
  function renderHint(container, hint) {
    if (!hint.needed) return;

    const box = document.createElement("div");
    box.className = "studyguard-hint-box";

    const title = document.createElement("p");
    title.className = "studyguard-hint-title";
    title.textContent = "What would unlock this prompt";

    const list = document.createElement("ol");
    for (const step of hint.steps) {
      const item = document.createElement("li");
      item.textContent = step.advice;
      list.append(item);
    }

    box.append(title, list);

    if (hint.reword) {
      const reword = document.createElement("p");
      reword.textContent = hint.reword.message;
      box.append(reword);
    }

    const note = document.createElement("p");
    note.className = "studyguard-hint-note";
    note.textContent =
      "Each tip was checked against the same scorer. Add real thinking of your own; filler text defeats the purpose.";
    box.append(note);

    container.append(box);
  }

  // ---- Step 5: publish the Prompt Breakdown Map to the side panel ---------

  // The latest map lives only in this page's memory (it contains prompt
  // words, so it is never written to storage).
  let latestMap = null;

  function publishMap(analysis, explanation, hint) {
    latestMap = StudyGuardMap.buildMap(analysis, explanation, hint);
    // If the side panel is open it receives this; if not, the call is
    // rejected, which is fine.
    chrome.runtime
      .sendMessage({ type: "studyguard:map", map: latestMap })
      .catch(() => {});
  }

  // The side panel asks for the latest map when it opens.
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === "studyguard:getMap") {
      sendResponse({ map: latestMap });
    }
  });

  // Runs the word-importance and advice steps, draws them into `breakdown`,
  // and publishes the Prompt Breakdown Map to the side panel.
  // Shared by the "Prepare a hint request" button and the submit gate below.
  function renderAnalysis(breakdown, question, studentAttempt) {
    const options = { attempt: studentAttempt };
    const analysis = StudyGuardEngine.analyzePrompt(question, options);
    const explanation = StudyGuardPerturbation.explainPrompt(question, options);
    const hint = StudyGuardCounterfactual.generateHint(question, options);

    publishMap(analysis, explanation, hint);

    if (explanation.blocked) {
      renderBreakdown(breakdown, question, explanation);
      renderHint(breakdown, hint);
      breakdown.hidden = false;
    } else {
      breakdown.hidden = true;
    }
    return explanation;
  }

  // ---- Step 4: soft block on submit ---------------------------------------

  // After "Send anyway", submits are allowed until this time (milliseconds).
  let bypassUntil = 0;

  // Local, text-free log of what happened at each submit (see eventlog.js).
  const eventLog = StudyGuardEventLog.createEventLog(chrome.storage.local);

  function recordEvent(action, analysis) {
    const event = {
      action,
      site: site.name,
      score: analysis.score,
      signalIds: analysis.signals.map((s) => s.id),
    };
    console.log("StudyGuard event:", event); // visible in DevTools for testing
    eventLog
      .add(event)
      .catch((error) => console.error("StudyGuard could not log:", error));
  }

  // The "Hold on" card shown at the top of the breakdown when a send is paused.
  function renderSoftBlock(container, verdict) {
    const box = document.createElement("div");
    box.className = "studyguard-softblock";
    box.setAttribute("role", "alert");

    const title = document.createElement("p");
    title.className = "studyguard-softblock-title";
    title.textContent = "Hold on before you send this";

    const reason = document.createElement("p");
    reason.textContent = verdict.reason;

    const actions = document.createElement("div");
    actions.className = "studyguard-softblock-actions";

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.textContent = "Add my own thinking";
    addButton.addEventListener("click", () => {
      document.getElementById("studyguard-attempt")?.focus();
    });

    const sendButton = document.createElement("button");
    sendButton.type = "button";
    sendButton.className = "studyguard-send-anyway";
    sendButton.textContent = "Send anyway";
    sendButton.addEventListener("click", () => sendAnyway(verdict));

    actions.append(addButton, sendButton);
    box.append(title, reason, actions);
    container.prepend(box);
  }

  // The student chose to send despite the pause. Record it, then click the
  // site's own Send button on their behalf.
  function sendAnyway(verdict) {
    recordEvent("sent_anyway", verdict.analysis);
    recordJournal("sent_anyway", verdict);
    bypassUntil = Date.now() + 10000; // let the next send through

    const panel = document.getElementById(panelId);
    const status = panel?.querySelector("#studyguard-hint-status");
    const breakdown = panel?.querySelector("#studyguard-breakdown");
    const input = findVisibleChatInput();
    const button = input ? StudyGuardSites.findSendButton(site, input) : null;

    if (button) {
      button.click();
      bypassUntil = Date.now() + 1500; // the click is done; close the window quickly
      if (breakdown) breakdown.hidden = true;
      if (status) {
        status.textContent =
          "Sent. StudyGuard recorded that you chose to send anyway.";
      }
    } else if (status) {
      status.textContent =
        "Press Send in the chat box now. StudyGuard will let it through.";
    }
  }

  // Called by the interceptor each time the student tries to send.
  // ---- Step 7: opt-in learning journal ------------------------------------

  // Saves the student's question and attempt ONLY if they switched the journal
  // on in the popup (journal.js checks that flag on every add).
  const journal = StudyGuardJournal.createJournal(chrome.storage.local);

  function recordJournal(action, verdict) {
    journal
      .add(
        StudyGuardJournal.makeEntry({
          action,
          site: site.name,
          question: verdict.question,
          attempt: verdict.attempt,
          map: verdict.map,
        })
      )
      .catch((error) =>
        console.error("StudyGuard could not save journal entry:", error)
      );
  }

  function handleSubmitAttempt() {
    if (!studyModeEnabled) return { hold: false };
    if (Date.now() < bypassUntil) return { hold: false };

    const panel = document.getElementById(panelId);
    const input = findVisibleChatInput();
    if (!panel || !input) return { hold: false }; // can't help, so don't interfere

    const question = input.innerText.trim();
    if (!question) return { hold: false };

    const attemptText = panel.querySelector("#studyguard-attempt").value.trim();
    const verdict = StudyGuardGate.evaluateSubmission(question, {
      attempt: attemptText,
    });
    verdict.question = question;
    verdict.attempt = attemptText;

    if (!verdict.hold) {
      publishMap(
        verdict.analysis,
        StudyGuardPerturbation.explainPrompt(question, {
          attempt: attemptText,
        }),
        null
      );
      verdict.map = latestMap;
      recordEvent("passed", verdict.analysis);
      recordJournal("passed", verdict);
      return { hold: false };
    }

    const breakdown = panel.querySelector("#studyguard-breakdown");
    renderAnalysis(breakdown, question, attemptText); // also builds latestMap
    verdict.map = latestMap;
    recordEvent("held", verdict.analysis);
    recordJournal("held", verdict);
    renderSoftBlock(breakdown, verdict);
    panel.scrollIntoView({ block: "nearest", behavior: "smooth" });
    return { hold: true };
  }

  function createPanel() {
    const panel = document.createElement("aside");
    panel.id = panelId;
    panel.setAttribute("aria-label", "StudyGuard study support");

    // Remember which conversation this panel belongs to.
    panel.dataset.conversationPath = window.location.pathname;

    const heading = document.createElement("h2");
    heading.textContent = "StudyGuard";
    const instructions = document.createElement("p");
    instructions.id = "studyguard-instructions";
    instructions.textContent =
      "Write your question in " + site.name + "’s message box below. Use this space for your own thinking.";

    const label = document.createElement("label");
    label.htmlFor = "studyguard-attempt";
    label.textContent = "Your attempt or sticking point (optional)";

    const attempt = document.createElement("textarea");
    attempt.id = "studyguard-attempt";
    attempt.rows = 3;
    attempt.placeholder =
      "Example: I think I should add the numbers, but I’m unsure what comes next.";
    attempt.setAttribute("aria-describedby", "studyguard-attempt-note");

    const note = document.createElement("p");
    note.id = "studyguard-attempt-note";
    note.textContent =
      "Optional. This draft clears when you switch chats, refresh, or turn study mode off.";

    const levelLabel = document.createElement("label");
    levelLabel.htmlFor = "studyguard-level";
    levelLabel.textContent = "Hint level";

    const levelSelect = document.createElement("select");
    levelSelect.id = "studyguard-level";
    levelSelect.setAttribute("aria-describedby", "studyguard-level-note");

    for (const [value, config] of Object.entries(HINT_LEVELS)) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = config.label;
      levelSelect.append(option);
    }

    const levelNote = document.createElement("p");
    levelNote.id = "studyguard-level-note";

    // Friction: higher levels unlock only after the student writes an attempt.
    function syncLevelAccess() {
      const hasAttempt = attempt.value.trim().length > 0;

      for (const option of levelSelect.options) {
        option.disabled = !hasAttempt && option.value !== "1";
      }

      if (!hasAttempt) levelSelect.value = "1";

      levelNote.textContent = hasAttempt
        ? ""
        : "Write an attempt above to unlock Levels 2 and 3.";
    }

    attempt.addEventListener("input", syncLevelAccess);
    syncLevelAccess();

    const prepareButton = document.createElement("button");
    prepareButton.type = "button";
    prepareButton.textContent = "Prepare a hint request";

    const status = document.createElement("p");
    status.id = "studyguard-hint-status";
    status.setAttribute("role", "status");

    // Holds the word-importance view. Hidden until a prompt needs more effort.
    const breakdown = document.createElement("div");
    breakdown.id = "studyguard-breakdown";
    breakdown.hidden = true;

    // A native expandable section provides keyboard-accessible controls.
    const previewSection = document.createElement("details");
    previewSection.id = "studyguard-preview-section";
    previewSection.hidden = true;

    const previewSummary = document.createElement("summary");
    previewSummary.textContent = "Review and copy hint request";

    const previewHelp = document.createElement("p");
    previewHelp.id = "studyguard-preview-help";
    previewHelp.textContent =
      "This is a snapshot. If you change your question or attempt, prepare again. Preparing again replaces your preview edits.";

    const previewLabel = document.createElement("label");
    previewLabel.htmlFor = "studyguard-preview";
    previewLabel.textContent = "Request to copy into " + site.name + " (editable)";

    const preview = document.createElement("textarea");
    preview.id = "studyguard-preview";
    preview.rows = 6;
    preview.setAttribute("aria-describedby", "studyguard-preview-help");

    // previewSection.append(previewLabel, preview);
    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.textContent = "Copy hint request";

    copyButton.addEventListener("click", async () => {
      // Read the current preview, including any edits the student made.
      const request = preview.value.trim();

      if (!request) {
        status.textContent = "The preview is empty. Prepare a request first.";
        return;
      }

      try {
        await navigator.clipboard.writeText(request);

        status.textContent =
          "Copied. Paste it into " + site.name + "’s input, review it, then send.";
      } catch (error) {
        // Offer a manual alternative if Chrome blocks clipboard access.
        preview.focus();
        preview.select();

        status.textContent =
          "Automatic copying was blocked. The preview is selected; press Cmd+C on Mac or Ctrl+C on Windows.";

        console.error("StudyGuard could not copy the request:", error);
      }
    });

    previewSection.append(
      previewSummary,
      previewHelp,
      previewLabel,
      preview,
      copyButton
    );

    prepareButton.addEventListener("click", () => {
      // Use the same visibility check that fixed our navigation issue.
      const chatInput = findVisibleChatInput();

      if (!chatInput) {
        previewSection.hidden = true;
        breakdown.hidden = true;
        preview.value = "";
        status.textContent = "Could not find the chat input.";
        return;
      }

      // innerText reads the text shown inside the editable chat input.
      const question = chatInput.innerText.trim();
      const studentAttempt = attempt.value.trim();

      // Run the local analysis engine on the question and the attempt box.
      const analysis = StudyGuardEngine.analyzePrompt(question, {
        attempt: studentAttempt,
      });
      console.log("StudyGuard analysis:", analysis); // inspect in DevTools

      renderAnalysis(breakdown, question, studentAttempt);

      if (!question) {
        previewSection.hidden = true;
        breakdown.hidden = true;
        preview.value = "";
        status.textContent = "Type your question in " + site.name + "’s input first.";
        return;
      }

      // Joining separate lines keeps the generated prompt readable.
      preview.value = buildHintRequest(
        question,
        studentAttempt,
        Number(levelSelect.value)
      );

      previewSection.hidden = false;
      previewSection.open = true;
      const verdict =
        analysis.decision === "pass"
          ? "ready to send"
          : "try adding more of your own thinking first";
      status.textContent = `Preview ready. Nothing has been sent. Effort score: ${analysis.score}/100 (${verdict}).`;
    });

    panel.append(
      heading,
      instructions,
      label,
      attempt,
      note,
      levelLabel,
      levelSelect,
      levelNote,
      prepareButton,
      status,
      breakdown,
      previewSection
    );
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
    const input = findVisibleChatInput();

    const form = input ? StudyGuardSites.findAnchor(site, input) : null;

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
      panel
        .querySelector("#studyguard-attempt")
        .dispatchEvent(new Event("input")); // re-locks levels 2 and 3
      panel.querySelector("#studyguard-preview").value = "";
      panel.querySelector("#studyguard-preview-section").hidden = true;
      panel.querySelector("#studyguard-hint-status").textContent = "";
      panel.querySelector("#studyguard-breakdown").hidden = true;
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

  // Watch for Enter and Send-button clicks. The check on isSendButton makes
  // sure the button belongs to the message box (not, say, "Send feedback").
  StudyGuardInterceptor.install(document, {
    getInput: findVisibleChatInput,
    isSendButton: (button) => {
      if (!StudyGuardSites.isSendButton(site, button)) return false;
      const input = findVisibleChatInput();
      const anchor = input ? StudyGuardSites.findAnchor(site, input) : null;
      return !!anchor && anchor.contains(button);
    },
    isInsidePanel: (el) => !!el.closest("#" + panelId),
    onSubmit: handleSubmitAttempt,
  });

  syncSettings();
})();
