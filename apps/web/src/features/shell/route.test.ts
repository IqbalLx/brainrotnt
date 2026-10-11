import { describe, expect, test } from "bun:test";
import { hrefFor, parseRoute } from "./useRoute";

describe("routes", () => {
  test("parse and build the hash routes", () => {
    expect(parseRoute("")).toEqual({ page: "exercise" });
    expect(parseRoute("#/")).toEqual({ page: "exercise" });
    expect(parseRoute("#/review")).toEqual({ page: "review", sessionId: null });
    expect(parseRoute("#/review/abc")).toEqual({ page: "review", sessionId: "abc" });
    expect(parseRoute("#/nowhere")).toEqual({ page: "exercise" });
    expect(hrefFor({ page: "review", sessionId: "abc" })).toBe("#/review/abc");
    expect(hrefFor({ page: "exercise" })).toBe("#/");
  });
});
