# Hints and explanations

## Hints

Up to three hints per problem, revealed one at a time and never skipped ahead. Each one gets closer to the answer without stating it. Each hint the student opens takes a quarter point off a correct answer, so make every one worth its cost.

| Tier | STEM (math, stats, physics, code) | Trivia |
|---|---|---|
| Hint 1 | Nudges the concept or the kind of problem | Era or region |
| Hint 2 | Names the method and how to set it up | Narrows to a decade, country or small set |
| Hint 3 | The exact formula or approach, not the answer | Near-giveaway: rule out wrong options, or give a first letter |

The bridge rejects a hint that contains the answer:

- numeric: any number within the key's tolerance (so "about 2.14" leaks a key of 2.138 at 0.5%)
- multiple choice: the correct option's text (ruling out wrong options is fine)
- symbolic: the key expression, however it is spaced
- code: a fenced code block that passes every test

In a template, hints may use the same `{placeholders}` as the statement; they are checked against every variant.

Example, for "A car accelerates from rest at 3 m/s² for 8 s. How far does it travel?":

1. "Constant acceleration from rest: which kinematics equation has distance, acceleration and time but no final speed?"
2. "Use s = ut + ½at² with u = 0."
3. "Substitute a = 3 and t = 8 into ½at², squaring the time first."

## Explanations

Shown only on the score screen, after the session. Markdown, with maths in KaTeX: `$...$` inline, and `$$` on lines of their own around display maths. Raw HTML is not rendered.

- STEM: a worked solution a student can follow step by step.
- Trivia: short context, plus why each wrong option is wrong.
- Code: the idea of the solution and its edge cases. No Answer line is needed.

Every explanation except a code problem's must end with a line `Answer: <value>` in plain calculator syntax (no LaTeX): a number with its unit if any, the correct option's text or letter, or the expression. The bridge grades that line against the key like a student answer, so an explanation can never teach a different answer.

In a template, the explanation may use the placeholders and `{answer}`, which becomes each variant's answer.

Example ending: `Answer: 96 m`
