import { describe, expect, test } from "bun:test";
import { checkEquivalent, compileExpression, samplePoints, verifyKeyAgainstPoints, type SymbolicSpec } from "./symbolic";

const x: SymbolicSpec = { variables: ["x"], domain: [-5, 5] };
const same = (key: string, given: string, spec = x) => {
  const result = checkEquivalent(key, given, spec);
  return result.ok ? result.equivalent : `ERR:${result.reason}:${result.error}`;
};

describe("equivalent forms are accepted", () => {
  test("algebra", () => {
    expect(same("(x+1)^2", "x^2+2x+1")).toBe(true);
    expect(same("x^2+4*x+4", "(x+2)^2")).toBe(true);
    expect(same("3*x^2", "3x^2")).toBe(true);
    expect(same("1/x", "x^-1")).toBe(true);
    expect(same("(x^2-1)/(x-1)", "x+1")).toBe(true);
    expect(same("2*x+2", "2(x+1)")).toBe(true);
  });

  test("functions, identities and constants", () => {
    expect(same("sin(x)^2+cos(x)^2", "1")).toBe(true);
    expect(same("2*cos(2*x)", "2*(cos(x)^2-sin(x)^2)")).toBe(true);
    expect(same("sqrt(x^2)", "abs(x)")).toBe(true);
    expect(same("pi*x", "3.141592653589793*x")).toBe(true);
    expect(same("exp(x)", "e^x")).toBe(true);
  });

  test("more than one variable", () => {
    const xy: SymbolicSpec = { variables: ["x", "y"], domain: [-3, 3] };
    expect(same("x*y+y", "y*(x+1)", xy)).toBe(true);
    expect(same("x^2-y^2", "(x-y)(x+y)", xy)).toBe(true);
    expect(same("x*y", "x+y", xy)).toBe(false);
  });
});

describe("different expressions are rejected", () => {
  test("clearly different", () => {
    expect(same("x^2", "x^3")).toBe(false);
    expect(same("x", "x+1")).toBe(false);
    expect(same("3*x^2", "3*x")).toBe(false);
    expect(same("sin(x)", "cos(x)")).toBe(false);
  });

  test("almost the same is still different", () => {
    expect(same("x^2", "1.001*x^2")).toBe(false);
    expect(same("x", "x+0.0001")).toBe(false);
    expect(same("sin(x)", "x")).toBe(false);
  });

  test("an isolated removable singularity is accepted, in either direction", () => {
    expect(same("x+3", "(x^2-9)/(x-3)")).toBe(true);
    expect(same("(x^2-9)/(x-3)", "x+3")).toBe(true);
    expect(same("x+1", "(x^2-1)/(x-1)")).toBe(true);
  });

  test("a function that is undefined where the key is defined does not match", () => {
    expect(same("log(x^2)", "2*log(x)")).toBe(false); // x < 0: log(x^2) is real, 2*log(x) is not
    expect(same("log(x^2)", "2*log(x)", { variables: ["x"], domain: [0.1, 5] })).toBe(true);
  });
});

describe("bad answers are refused with a plain message, not graded", () => {
  test("undeclared names", () => {
    expect(same("x+1", "y+1")).toBe("ERR:given:y is not a variable here; use x");
    expect(same("x+1", "z")).toContain("not a variable here");
  });

  test("escape hatches and unsupported syntax", () => {
    for (const given of ["evaluate('1+1')", "import({a: 1})", "a=2", "f(x)=x", "[1,2]", "1:3", "x.y", "'s'", "true", "x cm", "5!", "5 % 2", "mean(1,2)", "simplify(x)", "x ? 1 : 2"]) {
      const result = checkEquivalent("x+1", given, x);
      expect(result.ok).toBe(false);
      expect(!result.ok && result.reason).toBe("given");
    }
  });

  test("empty, oversized and unparseable input", () => {
    expect(same("x", "")).toBe("ERR:given:Enter an expression");
    expect(same("x", "x+".repeat(150) + "1")).toContain("under 200");
    expect(same("x", "x +")).toContain("ERR:given");
  });

  test("it cannot hang or crash on huge values", () => {
    expect(same("x", "9^9^9^9*x")).toBe(false);
    expect(same("x", "x^x^x^x")).toBe(false);
  });
});

describe("an unusable key is reported as the author's problem", () => {
  test("undefined on its domain", () => {
    const result = checkEquivalent("sqrt(x)", "sqrt(x)", { variables: ["x"], domain: [-5, -1] });
    expect(result).toMatchObject({ ok: false, reason: "key" });
  });

  test("a key using something not allowed", () => {
    expect(checkEquivalent("5!", "120", x)).toMatchObject({ ok: false, reason: "key" });
  });
});

describe("sampling", () => {
  test("is deterministic for a key and stays inside the domain", () => {
    const a = samplePoints({ variables: ["x", "y"], domain: [-2, 2] }, "x*y");
    const b = samplePoints({ variables: ["x", "y"], domain: [-2, 2] }, "x*y");
    expect(a).toEqual(b);
    expect(a).toHaveLength(40);
    for (const point of a) for (const value of Object.values(point)) expect(value >= -2 && value <= 2).toBe(true);
    expect(samplePoints({ variables: ["x"], domain: [-2, 2] }, "x")).not.toEqual(samplePoints({ variables: ["x"], domain: [-2, 2] }, "x+1"));
  });

  test("special values outside a positive domain are skipped", () => {
    const points = samplePoints({ variables: ["x"], domain: [1, 4] }, "k");
    expect(points.every((p) => p.x >= 1 && p.x <= 4)).toBe(true);
  });

  test("is fast", () => {
    const started = performance.now();
    for (let i = 0; i < 20; i++) checkEquivalent("sin(x)^2+cos(x)^2+x^3", "1+x^3", x);
    expect(performance.now() - started).toBeLessThan(500);
  });
});

describe("verifyKeyAgainstPoints", () => {
  test("accepts a key that matches the reference values and rejects one that does not", () => {
    const points = [1, 2, 3, 4, 5, 6].map((v) => ({ vars: { x: v }, value: 3 * v * v }));
    expect(verifyKeyAgainstPoints("3*x^2", ["x"], points)).toEqual({ ok: true });
    const wrong = verifyKeyAgainstPoints("3*x^3", ["x"], points);
    expect(wrong.ok).toBe(false);
    expect(!wrong.ok && wrong.error).toContain("reference solution computed");
  });

  test("tolerates the error of a numerical reference", () => {
    const points = [1, 2, 3].map((v) => ({ vars: { x: v }, value: 3 * v * v * (1 + 1e-8) }));
    expect(verifyKeyAgainstPoints("3*x^2", ["x"], points)).toEqual({ ok: true });
  });

  test("an unusable or undefined key is explained", () => {
    expect(verifyKeyAgainstPoints("5!", ["x"], [{ vars: { x: 1 }, value: 1 }]).ok).toBe(false);
    expect(verifyKeyAgainstPoints("log(x)", ["x"], [{ vars: { x: -1 }, value: 0 }])).toMatchObject({ ok: false });
  });
});

describe("compileExpression", () => {
  test("evaluates at a point, with null where undefined", () => {
    const compiled = compileExpression("sqrt(x)", ["x"]);
    expect(compiled.ok).toBe(true);
    if (compiled.ok) {
      expect(compiled.evaluate({ x: 9 })).toBe(3);
      expect(compiled.evaluate({ x: -1 })).toBeNull();
    }
  });
});
