
(() => {
  const { buildHintRequest, HINT_LEVELS } = StudyGuardHint;
  const hintRegistry = StudyGuardGate.createHintRegistry();
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

    const hintButton = document.createElement("button");
    hintButton.type = "button";
    hintButton.className = "studyguard-send-anyway";
    hintButton.textContent = "Get a hint instead";
    hintButton.addEventListener("click", openHintBuilder);

    const sendButton = document.createElement("button");
    sendButton.type = "button";
    sendButton.className = "studyguard-send-anyway";
    sendButton.textContent = "Send anyway";
    sendButton.addEventListener("click", () => sendAnyway(verdict));

    actions.append(addButton, hintButton, sendButton);
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
    const input = findVisibleChatInput();
    const button = input ? StudyGuardSites.findSendButton(site, input) : null;

    if (button) {
      button.click();
      bypassUntil = Date.now() + 1500; // the click is done; close the window quickly
      if (panel) {
        hideFindings(panel);
        clearAttempt(panel);
        setSummary(panel, "Sent anyway. Your choice was logged.", "idle");
        setPanelOpen(panel, false);
      }
    } else if (panel) {
      setSummary(panel, "Press Send in the chat box now. StudyGuard will let it through.", "warn");
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

    // A hint request that StudyGuard itself wrote is exactly what we want
    // students to send, so it is never scored (see gate.js).
    if (hintRegistry.has(question)) {
      hideFindings(panel);
      clearAttempt(panel);
      setSummary(panel, "Hint request sent.", "ok");
      setPanelOpen(panel, false);
      return { hold: false };
    }

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
      hideFindings(panel);
      clearAttempt(panel);
      setSummary(panel, `Looks good. Effort score ${verdict.analysis.score}/100.`, "ok");
      setPanelOpen(panel, false);
      return { hold: false };
    }

    const breakdown = panel.querySelector("#studyguard-breakdown");
    renderAnalysis(breakdown, question, attemptText); // also builds latestMap
    verdict.map = latestMap;
    recordEvent("held", verdict.analysis);
    recordJournal("held", verdict);
    const alertBox = panel.querySelector("#studyguard-alert");
    alertBox.replaceChildren();
    renderSoftBlock(alertBox, verdict);
    alertBox.hidden = false;
    panel.querySelector("#studyguard-body").scrollTop = 0;
    setSummary(
      panel,
      `Held. Score ${verdict.analysis.score}/100 (needs ${verdict.analysis.threshold}).`,
      "warn"
    );
    setPanelOpen(panel, true);
    panel.scrollIntoView({ block: "nearest", behavior: "smooth" });
    return { hold: true };
  }

  // ---- Panel chrome: logo, open/close, one-line summary --------------------

  // The StudyGuard logo as inline SVG (built with createElementNS so no HTML
  // strings are injected into the chat page).
  function makeLogo(size) {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 128 128");
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    svg.setAttribute("aria-hidden", "true");
    const shield = document.createElementNS(NS, "path");
    shield.setAttribute(
      "d",
      "M64 6 L112 22 V62 Q112 100 64 122 Q16 100 16 62 V22 Z"
    );
    shield.setAttribute("fill", "#256b48");
    const lens = document.createElementNS(NS, "circle");
    lens.setAttribute("cx", "64");
    lens.setAttribute("cy", "60");
    lens.setAttribute("r", "29");
    lens.setAttribute("fill", "#ffffff");
    const check = document.createElementNS(NS, "path");
    check.setAttribute("d", "M49 60 L60 71 L80 47");
    check.setAttribute("fill", "none");
    check.setAttribute("stroke", "#256b48");
    check.setAttribute("stroke-width", "9");
    check.setAttribute("stroke-linecap", "round");
    check.setAttribute("stroke-linejoin", "round");
    svg.append(shield, lens, check);
    return svg;
  }

  // Opens or minimises the panel. Collapsed, it is one slim bar; it opens by
  // itself when a prompt is held and folds away after a send.
  function setPanelOpen(panel, open) {
    const body = panel.querySelector("#studyguard-body");
    const toggle = panel.querySelector("#studyguard-toggle");
    if (!body || !toggle) return;
    panel.dataset.open = open ? "true" : "false";
    body.hidden = !open;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    panel.querySelector("#studyguard-toggle-label").textContent = open
      ? "Minimize"
      : "Open";
  }

  // One line shown in the bar, with a tone: "idle", "ok", "warn".
  function setSummary(panel, text, tone = "idle") {
    const summary = panel.querySelector("#studyguard-summary");
    if (!summary) return;
    summary.textContent = text;
    panel.dataset.tone = tone;
  }

  // An attempt belongs to ONE send. After a message goes out, empty the box so
  // the next question is scored on its own (otherwise yesterday's attempt would
  // quietly let today's "just write it for me" through).
  function clearAttempt(panel) {
    const box = panel.querySelector("#studyguard-attempt");
    if (box && box.value) {
      box.value = "";
      box.dispatchEvent(new Event("input")); // re-locks hint levels 2 and 3
    }
  }

  // Hides the hold card and the word/advice view (after a send, pass, etc.).
  function hideFindings(panel) {
    const alertBox = panel.querySelector("#studyguard-alert");
    const breakdown = panel.querySelector("#studyguard-breakdown");
    if (alertBox) alertBox.hidden = true;
    if (breakdown) breakdown.hidden = true;
  }

  // Shows the hint builder and brings it into view.
  function openHintBuilder() {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    setPanelOpen(panel, true);
    const section = panel.querySelector("#studyguard-hint-section");
    section.hidden = false;
    panel.querySelector("#studyguard-hint-open").setAttribute("aria-expanded", "true");
    section.scrollIntoView({ block: "nearest", behavior: "smooth" });
    panel.querySelector("#studyguard-level")?.focus({ preventScroll: true });
  }

  // Puts text into the site's message box (no paste step). Returns true only
  // if the text really appears there; otherwise the caller falls back to copy.
  function insertIntoChat(text) {
    const input = findVisibleChatInput();
    if (!input) return false;
    input.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(input);
    selection.removeAllRanges();
    selection.addRange(range);
    let ok = false;
    try {
      ok = document.execCommand("insertText", false, text);
    } catch (error) {
      ok = false;
    }
    const squash = (t) => String(t).replace(/\s+/g, " ").trim();
    return ok && squash(input.innerText).includes(squash(text).slice(0, 40));
  }

  const IDLE_SUMMARY = "Ready. Open to add your own thinking (optional).";

  function createPanel() {
    const panel = document.createElement("aside");
    panel.id = panelId;
    panel.setAttribute("aria-label", "StudyGuard study support");

    // Remember which conversation this panel belongs to.
    panel.dataset.conversationPath = window.location.pathname;

    // ---- Always-visible bar (the whole bar is one button) ----
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.id = "studyguard-toggle";
    toggle.className = "sg-bar";
    toggle.setAttribute("aria-controls", "studyguard-body");

    const name = document.createElement("span");
    name.className = "sg-name";
    name.textContent = "StudyGuard";

    const summary = document.createElement("span");
    summary.id = "studyguard-summary";
    summary.className = "sg-summary";
    summary.setAttribute("role", "status");

    const toggleLabel = document.createElement("span");
    toggleLabel.id = "studyguard-toggle-label";
    toggleLabel.className = "sg-toggle-label";

    toggle.append(makeLogo(22), name, summary, toggleLabel);
    toggle.addEventListener("click", () =>
      setPanelOpen(panel, panel.dataset.open !== "true")
    );

    // ---- Body (hidden while minimised) ----
    const body = document.createElement("div");
    body.id = "studyguard-body";

    const instructions = document.createElement("p");
    instructions.id = "studyguard-instructions";
    instructions.textContent =
      "Write your question in " +
      site.name +
      "’s message box. If you add what you already tried, you are more likely to get a helpful answer.";

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
      "Stays on this page only. Clears when you switch chats, refresh, or turn study mode off.";

    // The "Hold on" card sits right under the summary so its buttons are
    // always visible without scrolling.
    const alertBox = document.createElement("div");
    alertBox.id = "studyguard-alert";
    alertBox.hidden = true;

    // Holds the red/green words and the advice.
    const breakdown = document.createElement("div");
    breakdown.id = "studyguard-breakdown";
    breakdown.hidden = true;

    // ---- Optional extra: build a hint request ----
    const hintOpen = document.createElement("button");
    hintOpen.type = "button";
    hintOpen.id = "studyguard-hint-open";
    hintOpen.className = "sg-hint-open";
    hintOpen.setAttribute("aria-controls", "studyguard-hint-section");
    hintOpen.setAttribute("aria-expanded", "false");
    hintOpen.textContent = "Stuck? Ask for a hint instead of the answer";
    hintOpen.addEventListener("click", () => {
      const sec = panel.querySelector("#studyguard-hint-section");
      if (sec.hidden) {
        openHintBuilder();
      } else {
        sec.hidden = true;
        hintOpen.setAttribute("aria-expanded", "false");
      }
    });

    const hintSection = document.createElement("div");
    hintSection.id = "studyguard-hint-section";
    hintSection.hidden = true;

    const hintSummary = document.createElement("p");
    hintSummary.className = "sg-card-title";
    hintSummary.textContent = "Ask for a hint, not the answer";

    const hintHelp = document.createElement("p");
    hintHelp.className = "sg-help";
    hintHelp.textContent =
      "StudyGuard writes a request that asks " +
      site.name +
      " for one hint at a time. Choose how much help, create it, then put it in the chat box.";

    const levelLabel = document.createElement("label");
    levelLabel.htmlFor = "studyguard-level";
    levelLabel.textContent = "How much help?";

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

    attempt.addEventListener("input", () => {
      syncLevelAccess();
      if (attempt.value.trim()) {
        setSummary(panel, "Attempt added. Now send your question.", "ok");
      } else {
        setSummary(panel, IDLE_SUMMARY, "idle");
      }
    });
    syncLevelAccess();

    const prepareButton = document.createElement("button");
    prepareButton.type = "button";
    prepareButton.className = "sg-primary";
    prepareButton.textContent = "Create hint request";

    const status = document.createElement("p");
    status.id = "studyguard-hint-status";
    status.setAttribute("role", "status");

    const previewSection = document.createElement("div");
    previewSection.id = "studyguard-preview-section";
    previewSection.hidden = true;

    const previewHelp = document.createElement("p");
    previewHelp.id = "studyguard-preview-help";
    previewHelp.className = "sg-help";
    previewHelp.textContent =
      "A snapshot of your question and attempt. If you change them, prepare again (this replaces edits made here).";

    const previewLabel = document.createElement("label");
    previewLabel.htmlFor = "studyguard-preview";
    previewLabel.textContent = "Your hint request (you can edit it)";

    const preview = document.createElement("textarea");
    preview.id = "studyguard-preview";
    preview.rows = 6;
    preview.setAttribute("aria-describedby", "studyguard-preview-help");

    // StudyGuard's own hint requests are let through when pasted (gate.js).
    preview.addEventListener("input", () => hintRegistry.register(preview.value));

    const insertButton = document.createElement("button");
    insertButton.type = "button";
    insertButton.className = "sg-primary";
    insertButton.textContent = "Put it in the chat box";

    insertButton.addEventListener("click", async () => {
      const request = preview.value.trim();
      if (!request) {
        status.textContent = "The preview is empty. Create a hint request first.";
        return;
      }
      hintRegistry.register(request);
      if (insertIntoChat(request)) {
        status.textContent =
          "Placed in " + site.name + "’s box. Review it, then press Send. StudyGuard will let it through.";
        return;
      }
      // Some pages block scripted typing. Copy instead.
      try {
        await navigator.clipboard.writeText(request);
        status.textContent =
          "Could not type it for you, so it was copied. Paste it into " + site.name + "’s box and press Send.";
      } catch (error) {
        preview.focus();
        preview.select();
        status.textContent =
          "Select the text above and copy it (Cmd+C or Ctrl+C), then paste it into the chat box.";
      }
    });

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "sg-secondary";
    copyButton.textContent = "Copy";

    copyButton.addEventListener("click", async () => {
      // Read the current preview, including any edits the student made.
      const request = preview.value.trim();

      if (!request) {
        status.textContent = "The preview is empty. Prepare a request first.";
        return;
      }
      hintRegistry.register(request);

      try {
        await navigator.clipboard.writeText(request);
        status.textContent =
          "Copied. Paste it into " + site.name + "’s box and press Send. StudyGuard will let it through.";
      } catch (error) {
        // Offer a manual alternative if Chrome blocks clipboard access.
        preview.focus();
        preview.select();
        status.textContent =
          "Automatic copying was blocked. The preview is selected; press Cmd+C on Mac or Ctrl+C on Windows.";
        console.error("StudyGuard could not copy the request:", error);
      }
    });

    const previewActions = document.createElement("div");
    previewActions.className = "sg-actions";
    previewActions.append(insertButton, copyButton);
    previewSection.append(previewHelp, previewLabel, preview, previewActions);

    prepareButton.addEventListener("click", () => {
      const chatInput = findVisibleChatInput();

      if (!chatInput) {
        previewSection.hidden = true;
        breakdown.hidden = true;
        preview.value = "";
        status.textContent = "Could not find the chat input.";
        return;
      }

      const question = chatInput.innerText.trim();
      const studentAttempt = attempt.value.trim();

      if (!question) {
        previewSection.hidden = true;
        preview.value = "";
        status.textContent = "Type your question in " + site.name + "’s box first.";
        return;
      }

      // The hint request replaces the "held" view, so the panel stays compact.
      hideFindings(panel);

      preview.value = buildHintRequest(
        question,
        studentAttempt,
        Number(levelSelect.value)
      );
      hintRegistry.register(preview.value);

      previewSection.hidden = false;
      status.textContent =
        "Ready. Nothing has been sent. Review it below, then put it in " +
        site.name +
        "’s box.";
      previewSection.scrollIntoView({ block: "nearest" });
    });

    hintSection.append(
      hintSummary,
      hintHelp,
      levelLabel,
      levelSelect,
      levelNote,
      prepareButton,
      status,
      previewSection
    );

    body.append(alertBox, instructions, label, attempt, note, hintOpen, hintSection, breakdown);
    panel.append(toggle, body);

    setSummary(panel, IDLE_SUMMARY, "idle");
    setPanelOpen(panel, false); // starts as a slim bar
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
      hideFindings(panel);
      panel.querySelector("#studyguard-hint-section").hidden = true;
      panel.querySelector("#studyguard-hint-open").setAttribute("aria-expanded", "false");
      setSummary(panel, IDLE_SUMMARY, "idle");
      setPanelOpen(panel, false);
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
