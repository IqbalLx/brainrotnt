# Code

Programming problems use `type: code` and `subject: code`. The student writes one function (`entry`, usually `solve`) in Python or JavaScript.

- Tests are JSON: `{"args": [...], "expected": <JSON>, "hidden": true|false}`. Give at least 4, with at least 1 visible (shown as an example) and at least 2 hidden. Put the edge cases (empty input, negatives, duplicates, large values) among the hidden ones.
- For each language you offer, give:
  - `starter`: the signature with a TODO body that does not already pass.
  - `reference`: a correct solution. It must pass every test.
  - `wrong`: a plausible wrong solution that still runs. It must fail at least one test.
- Arguments and return values are plain JSON: numbers, strings, booleans, null, arrays and objects. Python `None`/`True` map to `null`/`true`.
- The statement says exactly what the function receives and returns, and shows the visible tests as examples.
- Run the reviewer pass on hint 3 before submitting (see SKILL.md).
