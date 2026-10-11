---
name: brainrotnt-problems
description: Populate and maintain the brainrotnt problem bank through its MCP tools - write verified STEM problems (math, stats, physics, code), trivia with sources, templates, hints and explanations; repair flagged problems; backfill missing hints and explanations. Use when asked to add, generate, fix or backfill brainrotnt problems.
version: 1.3.0
---

# brainrotnt problems

Version 1.3.0. brainrotnt is a local app for practising STEM problems and trivia while a coding agent works. The bank only accepts what the bridge can verify, so every item you write is checked before it is stored.

## Before you write anything

If the brainrotnt tools (`get_schema`, `submit_problems`, ...) are not available, brainrotnt is not running or not registered. Ask the user to start it with `brnt` (the installed app) and, if Claude Code has never been connected, to run `brnt setup claude`, then reconnect with `/mcp`. `brnt doctor` reports what is missing. Do not guess the tools' behaviour without them.

1. Call `get_schema`. The live schema it returns is the truth; `references/schema.md` is a snapshot for reading offline and may be older.
2. Call `get_coverage` to find thin topics and difficulties, and problems still missing hints or explanations.
3. Read the subject guide in `references/subjects/` for each subject you will write, and `references/hints-and-explanations.md` before writing hints or explanations.

## Writing problems

- Submit with `submit_problems`, at most 25 items per call. Prefer several moderate batches per topic over one huge one: generation counts against the user's plan.
- Each item comes back `inserted` or `rejected` with its errors. Fix and resubmit only the rejected ones. Never resubmit an inserted item: it would be refused as a duplicate.
- Statements are original. Store a pointer such as a chapter in `source`, never copied text.
- STEM problems need a Python `reference.code` that computes the answer from scratch and prints one JSON value on its last line. Never print the key you typed: the point is an independent check. It runs in a sandbox with no network, 5 seconds and 512 MB.
- For quantitative topics, prefer a template: one statement with `{placeholders}` and a seeded `generate(seed)`. One template becomes many verified variants.
- Code problems give a starter, a correct reference and a deliberately wrong solution per language, with visible example tests and at least two hidden ones. The wrong solution must be plausible (an off-by-one, a missed edge case) so it proves the tests have teeth.
- Trivia has no reference solution. It cites sources instead: see `references/subjects/trivia.md`.

## Reporting back: no spoilers

The user practises on the problems you write, so your reply must not solve them. When you finish, report only how many items were inserted or rejected, with their subjects, topics, difficulties and types. Never show answers, options marked correct, hints, explanations or reference solutions, and do not paraphrase a statement so closely that it can be solved from your reply. This applies to submitting, repairing and backfilling alike. If something was rejected, fix it without quoting the key back, unless the user asks to see it.

## Hints and explanations

Every new problem should carry three hints and an explanation unless the user says otherwise. Rules and examples: `references/hints-and-explanations.md`. The bridge rejects a hint that contains the answer and an explanation whose final `Answer:` line disagrees with the key.

For code problems, run a reviewer pass before submitting: hand hint 3 and the reference solution to a fresh subagent and ask whether the hint lets someone write the solution without thinking. Rewrite it if so. The bridge also flags a third hint that mostly repeats the reference.

## Repairing and backfilling

- `list_flagged` lists problems the user flagged, and live problems with a review note (`inRotation: true`). Fix each with `update_problem`, passing the full corrected problem. It is verified again, stored as the next version, and the old one is retired.
- `list_missing_extras` lists live problems lacking hints or an explanation. Backfill a few at a time through `update_problem` with the full problem plus the new hints and explanation. STEM problems need their reference solution written again (none is stored); trivia needs its sources.

## When something is rejected

Read the error: it names the field and the reason. Common ones:

- `reference solution computed X but the stated key is Y`: your key or your reference is wrong. Work out which before resubmitting.
- `hints.N: contains the answer`: reword the hint so it guides without stating the value or option.
- `explanation: must end with a line 'Answer: <value>'`: add the line, in plain calculator syntax.
- `statement: "current" makes the answer change over time`: pin a year or ask about a fixed fact.
