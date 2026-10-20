# Chrome Web Store listing (copy-ready)

Everything below is written to paste into the Chrome Web Store developer dashboard. Publishing there needs a Google developer account with a **one-time $5 registration fee**, which is why this is optional for the course: the extension installs for free with **Load unpacked** (see the README). Nothing here has been submitted yet.

## Basics
- **Name:** StudyGuard
- **Summary (max 132 chars):** Explains, word by word, when a ChatGPT or Claude prompt asks for the answer instead of your own thinking.
- **Category:** Education
- **Language:** English
- **Icon:** `icons/icon128.png`
- **Privacy policy URL:** `https://github.com/eugeniatate-duke/StudyGuard/blob/main/docs/privacy-policy.md`
- **Support / homepage:** `https://github.com/eugeniatate-duke/StudyGuard`

## Detailed description

StudyGuard: a glass-box study coach for ChatGPT and Claude.

Before you send a prompt, StudyGuard scores how much of your own thinking it shows. If the prompt only asks the AI to do the work, it pauses it, gently, and tells you exactly why. You can always add your own thinking, or send anyway. It is advice, not a verdict.

WHY STUDYGUARD
AI assistants can write your homework in seconds, and research suggests that unrestricted answers can hurt learning once the help is removed. Most guardrails are invisible: they never tell you why. StudyGuard makes the reasoning visible so that you can learn from it.

KEY FEATURES
- Effort score (0 to 100) with a plain-language reason, not a black box
- Word-level highlights: red words pushed the prompt toward "give me the answer", green words showed your own thinking
- Prompt Breakdown Map in Chrome's side panel (intent, effort, evidence)
- Specific tips for what to add to unlock your prompt, each one verified against the same scorer
- Optional hint-request builder that asks the AI for one hint at a time
- Analytics dashboard: how often prompts were held, sent anyway, or improved
- Optional Learning Journal you can export (Markdown or PDF) to hand in with homework

HOW TO USE
1. Click the StudyGuard icon and turn on Study mode.
2. Open ChatGPT or Claude. A slim StudyGuard bar appears above the message box.
3. Write your question. If it is held, read the reason, add what you tried, and send again.
4. Open the dashboard or journal from the popup any time.

PRIVACY
Everything runs on your device. No account, no tracking, no network calls. Your prompt text is never stored unless you switch the journal on.

EVIDENCE AND DOCUMENTATION
The scoring rules, the evaluation (held-out set, red-team tests, SHAP/LIME comparison) and the limitations are documented in the GitHub repository. StudyGuard is a coaching tool and not an academic-integrity detector. It is not affiliated with OpenAI or Anthropic.

## Single-purpose statement
Helps students notice and add their own thinking to prompts sent to ChatGPT and Claude, and explains how each prompt was scored.

## Permission justifications
- **storage:** saves the on/off settings, a text-free event log, and the optional learning journal on this device.
- **sidePanel:** shows the Prompt Breakdown Map in Chrome's side panel.
- **Host access (chatgpt.com, claude.ai):** shows the StudyGuard bar beside the message box and reads the text at the moment the student presses Send, to score it locally.
- **Remote code:** none. All code is in the package.

## Data-use disclosures (dashboard form)
- Collects user data: **no** (nothing leaves the device). If asked about "website content" or "user activity", answer that it is handled locally only and never transmitted.
- Certify: not sold, not used for unrelated purposes, not used for creditworthiness.

## Screenshots to upload (1280x800 or 640x400, up to 5)
1. A held prompt with red words and the "Hold on" card (`docs/images/hero-soft-block.png`, retake after this UI update)
2. The slim collapsed bar above the message box
3. The Prompt Breakdown Map side panel (`docs/images/side-panel-breakdown.png`)
4. The analytics dashboard (`docs/images/analytics-dash.png`)
5. The popup settings
Optional promo tile (440x280): the logo and the line "Know why your prompt was held."

## Review checklist
- [ ] Retake screenshots with the new panel
- [ ] Zip the extension folder without `tests/`, `eval/`, `python/`, `train/`, `docs/`, `.git`, `.github`
- [ ] Confirm the manifest version matches the release tag
