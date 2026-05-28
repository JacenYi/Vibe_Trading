// Fee tiers in Uniswap v4 pips (1 pip = 0.0001%)
export const FEE_TIERS = {
  LOW:     { pips: 500,    label: "0.05%", mood: "bull",      moodIndex: 0 },
  MEDIUM:  { pips: 3000,   label: "0.30%", mood: "neutral",   moodIndex: 1 },
  HIGH:    { pips: 10000,  label: "1.00%", mood: "defensive", moodIndex: 2 },
  EXTREME: { pips: 20000,  label: "2.00%", mood: "panic",     moodIndex: 3 },
};

export const MOOD_INDEX_MAP = [
  FEE_TIERS.LOW,
  FEE_TIERS.MEDIUM,
  FEE_TIERS.HIGH,
  FEE_TIERS.EXTREME,
];

export function feeToLabel(pips) {
  const n = Number(pips);
  if (n <= 500)  return "0.05%";
  if (n <= 3000) return "0.30%";
  if (n <= 10000) return "1.00%";
  return "2.00%";
}

export function moodFromPips(pips) {
  const n = Number(pips);
  if (n <= 500)  return "bull";
  if (n <= 3000) return "neutral";
  if (n <= 10000) return "defensive";
  return "panic";
}

export function moodIndexFromPips(pips) {
  const n = Number(pips);
  if (n <= 500)  return 0;
  if (n <= 3000) return 1;
  if (n <= 10000) return 2;
  return 3;
}
