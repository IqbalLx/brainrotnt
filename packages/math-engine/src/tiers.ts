// Ordered from least to most capable.
export const CALCULATOR_TIERS = ["none", "basic", "scientific", "stats"] as const;
export type CalculatorTier = (typeof CALCULATOR_TIERS)[number];

export const tierRank = (tier: CalculatorTier) => CALCULATOR_TIERS.indexOf(tier);
