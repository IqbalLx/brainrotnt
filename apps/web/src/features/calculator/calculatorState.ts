import { useState } from "react";
// Type only: erased at build time, so the maths engine stays out of the main bundle.
import type { CalcResult } from "@brainrotnt/math-engine";

/**
 * The calculator's expression and last result, held by the problem rather than by one panel, so the
 * calculator beside the problem and the one in the drawing sheet are the same calculator.
 */
export interface CalculatorState {
  expression: string;
  result: CalcResult | null;
  setExpression: (expression: string) => void;
  setResult: (result: CalcResult | null) => void;
}

export function useCalculatorState(): CalculatorState {
  const [expression, setExpression] = useState("");
  const [result, setResult] = useState<CalcResult | null>(null);
  return { expression, result, setExpression, setResult };
}
