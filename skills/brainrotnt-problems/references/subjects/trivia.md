# Trivia

`subject: trivia`, `type: mcq` or `numeric` (a year or a count). Topics: history, geography, science, culture (art, music, film, literature, food, sport), or any other free-form topic. Biology and anatomy stay out.

## Sources

Trivia cannot be checked by code, so each question carries `sources`: `{"url": ..., "title": ..., "quote": ...}`.

- Open every page you cite and copy the sentence that states the fact into `quote`, exactly. Never cite a page you have not opened in this session.
- Two or more sources on different sites that agree make the question verified. With fewer it is stored as unverified and shown with an Unverified badge, so aim for two.
- Prefer reference works, archives, museums and official sites.

## Stable facts only

Ask about dates, events, borders as of a stated year, who did what. Wording such as current, currently, today, now, latest, recently, still or reigning is rejected unless the statement pins a year ("as of 2020", "in 1999").

## Answers

- `numeric`: a year is exact by default (tolerance 0). Give a tolerance only for counts where rounding is fair.
- `mcq`: plausible distractors from the same era or region. The explanation says why each wrong option is wrong.
- No calculator, no drawing board.
