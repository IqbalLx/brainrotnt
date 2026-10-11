import { describe, expect, test } from "bun:test";
import { calculate, restrictedMath } from "./engine";

const value = (expr: string, tier: Parameters<typeof calculate>[1]) => {
  const result = calculate(expr, tier);
  return result.ok ? result.text : `ERR:${result.error}`;
};
const blocked = (expr: string, tier: Parameters<typeof calculate>[1]) => !calculate(expr, tier).ok;

describe("basic tier", () => {
  test("arithmetic, powers, roots, percent and parentheses", () => {
    expect(value("2+3*4", "basic")).toBe("14");
    expect(value("(1+2)^3", "basic")).toBe("27");
    expect(value("sqrt(16)", "basic")).toBe("4");
    expect(value("-3+5", "basic")).toBe("2");
    expect(value("10/4", "basic")).toBe("2.5");
    expect(value("50%", "basic")).toBe("0.5");
    expect(value("200*15%", "basic")).toBe("30");
    // After + or -, a percentage is of the left side, like a handheld calculator.
    expect(value("200+10%", "basic")).toBe("220");
    expect(value("200-10%", "basic")).toBe("180");
    expect(value("0.1+0.2", "basic")).toBe("0.3");
    expect(value("2(3+4)", "basic")).toBe("14");
  });

  test("blocks everything above the tier", () => {
    for (const expr of ["sin(1)", "log(10)", "pi", "e", "5!", "mean(1,2)", "combinations(5,2)", "exp(1)"]) {
      expect(blocked(expr, "basic")).toBe(true);
    }
  });

  test("blocks modulo, comparison and conditionals", () => {
    for (const expr of ["5 % 2", "1<2", "1==1", "1 ? 2 : 3", "not 1", "1 and 2"]) expect(blocked(expr, "basic")).toBe(true);
  });
});

describe("scientific tier", () => {
  test("trig, logs, exponentials, constants and factorial", () => {
    expect(value("sin(pi/2)", "scientific")).toBe("1");
    expect(value("log10(1000)", "scientific")).toBe("3");
    expect(value("log(e)", "scientific")).toBe("1");
    expect(value("exp(0)", "scientific")).toBe("1");
    expect(value("5!", "scientific")).toBe("120");
    expect(value("2pi", "scientific")).toBe("6.28318530718");
    expect(value("atan(1)*4", "scientific")).toBe("3.14159265359");
  });

  test("still blocks statistics functions", () => {
    expect(blocked("mean(1,2,3)", "scientific")).toBe(true);
    expect(blocked("std(1,2,3)", "scientific")).toBe(true);
    expect(blocked("permutations(5,2)", "scientific")).toBe(true);
  });
});

describe("stats tier", () => {
  test("mean, sample standard deviation and combinatorics", () => {
    expect(value("mean(1,2,3)", "stats")).toBe("2");
    expect(value("std(2,4,4,4,5,5,7,9)", "stats")).toBe("2.1380899353");
    expect(value("combinations(5,2)", "stats")).toBe("10");
    expect(value("permutations(5,2)", "stats")).toBe("20");
    expect(value("sin(0)+5!", "stats")).toBe("120");
  });
});

describe("none tier", () => {
  test("nothing is available", () => {
    expect(value("1+1", "none")).toBe("ERR:The calculator is not available for this problem");
  });
});

describe("rejects every escape hatch at every tier", () => {
  const attempts = [
    "evaluate('1+1')",
    "parse('1')",
    "simplify('x+x')",
    "derivative('x^2', 'x')",
    "import({a: 1})",
    "createUnit('foo')",
    "a=2",
    "a=2; a",
    "f(x)=x",
    "[1,2,3]",
    "1:5",
    "x.y",
    "cos.constructor",
    "'string'",
    "true",
    "2 cm",
    "5 inch",
    "det([[1]])",
    "sqrt(-1)",
    "__proto__",
    "constructor",
    "1;2",
  ];
  for (const tier of ["basic", "scientific", "stats"] as const) {
    test(tier, () => {
      for (const expr of attempts) expect(blocked(expr, tier)).toBe(true);
    });
  }
});

describe("results and limits", () => {
  test("division by zero and overflow are Undefined, not a crash", () => {
    expect(value("1/0", "basic")).toBe("ERR:Undefined");
    expect(value("9^9^9^9", "basic")).toBe("ERR:Undefined");
  });

  test("complex results are refused", () => {
    expect(value("sqrt(-4)", "basic")).toBe("ERR:The result is not a real number");
  });

  test("oversized expressions and empty input are refused", () => {
    expect(blocked("1+".repeat(150) + "1", "basic")).toBe(true);
    expect(blocked("   ", "basic")).toBe(true);
  });

  test("unbounded combinatorics are capped and return quickly", () => {
    const started = performance.now();
    expect(blocked("1000000!", "scientific")).toBe(true);
    expect(blocked("171!", "scientific")).toBe(true);
    expect(blocked("combinations(100000, 50000)", "stats")).toBe(true);
    expect(blocked("permutations(100000, 5)", "stats")).toBe(true);
    expect(performance.now() - started).toBeLessThan(500);
    expect(value("170! > 0", "scientific").startsWith("ERR")).toBe(true);
    expect(value("170!", "scientific")).not.toContain("ERR");
  });
});

describe("layer 1: the instance itself refuses escape hatches", () => {
  test("bypassing the syntax check still cannot reach them", () => {
    expect(() => restrictedMath.evaluate("1+1")).toThrow();
    expect(() => restrictedMath.import({ x: 1 })).toThrow();
    expect(() => restrictedMath.createUnit("foo")).toThrow();
    expect(() => restrictedMath.simplify("x+x")).toThrow();
    expect(() => restrictedMath.derivative("x^2", "x")).toThrow();
  });
});
