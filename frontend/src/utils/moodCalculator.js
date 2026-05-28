/**
 * 前端情绪计算器 — 镜像 Solidity VolGuardFeeCalculator 的比率模型。
 * 在未连接钱包的演示模式下使用。
 */

export const LOW_FEE     = 500;
export const MEDIUM_FEE  = 3000;
export const HIGH_FEE    = 10000;
export const EXTREME_FEE = 20000;

export const RATIO_MEDIUM_BPS  = 10;   // 0.10%
export const RATIO_HIGH_BPS    = 100;  // 1.00%
export const RATIO_EXTREME_BPS = 500;  // 5.00%

// 情绪元数据：指数、费率、标签、进度条值、颜色
const MOOD_META = {
  bull:      { moodIndex: 0, fee: LOW_FEE,     feeLabel: "0.05%", meter: 15,  color: "var(--green)"  },
  neutral:   { moodIndex: 1, fee: MEDIUM_FEE,  feeLabel: "0.30%", meter: 50,  color: "var(--blue)"   },
  defensive: { moodIndex: 2, fee: HIGH_FEE,    feeLabel: "1.00%", meter: 78,  color: "var(--yellow)" },
  panic:     { moodIndex: 3, fee: EXTREME_FEE, feeLabel: "2.00%", meter: 100, color: "var(--red)"    },
};

export function parsePositiveNumber(value) {
  const n = Number(String(value).replaceAll(",", ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function tradeRatioPercent(amount, poolValue) {
  if (!poolValue || poolValue <= 0) return 0;
  return (amount / poolValue) * 100;
}

export function tradeRatioBps(amount, poolValue) {
  if (!poolValue || poolValue <= 0) return 0;
  return Math.floor((amount / poolValue) * 10000);
}

/**
 * 根据交易参数判断池情绪（前端模拟）。
 * poolValue > 0 时使用比率模型。
 */
export function classifyMood(amount, direction, poolValue, prevEwma = 0, volMultiplierBps = 30000) {
  // EWMA 突刺检查
  if (prevEwma > 0 && amount * 10000 >= prevEwma * volMultiplierBps) {
    return "panic";
  }

  if (poolValue > 0) {
    const ratioBps = tradeRatioBps(amount, poolValue);
    if (ratioBps >= RATIO_EXTREME_BPS) return "panic";
    if (ratioBps >= RATIO_HIGH_BPS)    return "defensive";
    if (ratioBps >= RATIO_MEDIUM_BPS)  return "neutral";
    // 小额买入 → 看涨
    if (direction === "buy") return "bull";
    return "neutral";
  }

  // 兜底：基于方向的演示分类
  if (direction === "sell" && amount >= 50000) return "panic";
  if (direction === "buy"  && amount >= 15000) return "bull";
  return "neutral";
}

export function getMoodMeta(moodKey) {
  return MOOD_META[moodKey] ?? MOOD_META.neutral;
}

export function formatAmount(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

export function formatRatio(value) {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(value)}%`;
}

// 生成随机假交易哈希（演示用）
export function fakeTxHash() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function shortHash(hash) {
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
}
