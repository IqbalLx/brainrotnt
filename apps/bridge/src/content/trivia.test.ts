import { describe, expect, test } from "bun:test";
import { stabilityIssues, triviaStatus } from "./trivia";

const src = (url: string) => ({ url, quote: "The fact, stated plainly." });

describe("triviaStatus", () => {
  test("two different sites verify; one site, however many pages, does not", () => {
    expect(triviaStatus([src("https://en.wikipedia.org/a"), src("https://www.britannica.com/b")])).toBe("verified");
    expect(triviaStatus([src("https://www.britannica.com/a"), src("https://britannica.com/b")])).toBe("unverified");
    expect(triviaStatus([src("https://en.wikipedia.org/a")])).toBe("unverified");
  });
});

describe("stabilityIssues", () => {
  test("fixed facts pass", () => {
    expect(stabilityIssues("In which year did the Berlin Wall fall?")).toEqual([]);
    expect(stabilityIssues("Which river flows through Cairo?")).toEqual([]);
  });

  test("time-relative wording is rejected unless a year is pinned", () => {
    expect(stabilityIssues("Who is the current president of France?")[0]).toContain('"current"');
    expect(stabilityIssues("Which country has the largest population today?")[0]).toContain('"today"');
    expect(stabilityIssues("Who holds the record for the 100 m sprint?")).toHaveLength(1);
    expect(stabilityIssues("Who was the reigning world chess champion as of 2020?")).toEqual([]);
    expect(stabilityIssues("Which country was still a monarchy in 1950?")).toEqual([]);
  });
});
