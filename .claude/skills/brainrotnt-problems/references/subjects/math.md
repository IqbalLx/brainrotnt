# Math

Topics: arithmetic, algebra, functions, derivatives, integrals, probability, combinatorics, sequences, geometry, and more.

- Use `numeric` for a single value, `mcq` for concept checks, `symbolic` when the answer is an expression (a derivative, a simplification, an expansion).
- Symbolic answers: give `expression` in calculator syntax (`3*x^2 + 2`), `variables` (single letters other than e and i) and, if the default [-5, 5] is wrong for the function, a `domain`. The reference prints at least 6 points computed independently of the key, for example a derivative by central differences: `{"points": [{"vars": {"x": 1.5}, "value": 6.75}, ...]}`. Avoid points where the function is undefined.
- Pick the calculator tier the problem needs (`none` for mental arithmetic, `scientific` for trig and logs). The user's setting caps it.
- Prefer templates for drill topics (arithmetic, linear equations): one generator, many variants.
