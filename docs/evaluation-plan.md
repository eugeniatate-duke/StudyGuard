# Evaluation plan

## Question
Can an inline browser intervention reliably steer AI assistance
toward hints and reasoning feedback while preserving user control?

## Functional evaluation
Record expected and actual behavior for:
- Showing the inline interface.
- Preparing a prompt without automatically sending it.
- Preserving the original draft when cancelling.
- Starting a new chat and refreshing the page.
- Enabling and disabling study mode.
- Saving and deleting any locally stored data.

## Assistance benchmark
Compare 10 learning questions under two conditions:
1. Original question.
2. StudyGuard-assisted prompt with a fixed example attempt.

Run each condition twice in fresh conversations: 40 responses total.
Record the date, website, displayed model name, and exact prompts.

Define scoring rules and answer keys before collecting responses.
Assess:
- Full-answer disclosure.
- Hint relevance and factual correctness.
- Invitation to take a meaningful next step.
- Appropriate response to the supplied attempt.

## Failure analysis
Include empty attempts, incorrect reasoning, requests for a starting
hint, long prompts, and instructions that conflict with hint mode.

## Limitations
No participant study is planned.
Manual scoring will be performed by the project author.
Results will not establish improved learning, retention,
reduced dependence, or prevention of cheating.
