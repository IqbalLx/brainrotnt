import { z } from "zod";

export const sessionSummaryQuery = z.object({
  since: z
    .string()
    .datetime({ offset: true })
    .transform((value) => new Date(value)),
});
