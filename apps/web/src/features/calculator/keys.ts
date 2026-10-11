import type { CalculatorTier } from "@brainrotnt/math-engine";

export interface CalcKey {
  label: string;
  aria?: string;
  insert: string;
  minTier: CalculatorTier;
}

const k = (label: string, insert: string, minTier: CalculatorTier, aria?: string): CalcKey => ({ label, insert, minTier, aria });

// Every key is always shown; a key above the tier is disabled rather than removed, so the ceiling is visible.
export const FUNCTION_KEYS: CalcKey[] = [
  k("sin", "sin(", "scientific"),
  k("cos", "cos(", "scientific"),
  k("tan", "tan(", "scientific"),
  k("asin", "asin(", "scientific"),
  k("acos", "acos(", "scientific"),
  k("atan", "atan(", "scientific"),
  k("ln", "log(", "scientific", "natural log"),
  k("log", "log10(", "scientific", "log base 10"),
  k("exp", "exp(", "scientific"),
  k("π", "pi", "scientific", "pi"),
  k("e", "e", "scientific", "Euler's number"),
  k("n!", "!", "scientific", "factorial"),
  k("mean", "mean(", "stats"),
  k("std", "std(", "stats", "sample standard deviation"),
  k("nCr", "combinations(", "stats", "combinations"),
  k("nPr", "permutations(", "stats", "permutations"),
  k(",", ",", "stats", "comma"),
];

export const BASIC_KEYS: CalcKey[] = [
  k("7", "7", "basic"), k("8", "8", "basic"), k("9", "9", "basic"), k("÷", "/", "basic", "divide"), k("√", "sqrt(", "basic", "square root"),
  k("4", "4", "basic"), k("5", "5", "basic"), k("6", "6", "basic"), k("×", "*", "basic", "multiply"), k("^", "^", "basic", "power"),
  k("1", "1", "basic"), k("2", "2", "basic"), k("3", "3", "basic"), k("−", "-", "basic", "minus"), k("%", "%", "basic", "percent"),
  k("0", "0", "basic"), k(".", ".", "basic", "decimal point"), k("(", "(", "basic"), k(")", ")", "basic"), k("+", "+", "basic", "plus"),
];
