// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

/// @title VolGuardFeeCalculator
/// @notice 动态手续费计算纯库，负责 EWMA 成交量追踪与费率选择。
///         支持两种模型：
///         1. 绝对阈值模型（兜底）：将交易规模与固定阈值比较。
///         2. 比率模型（首选）：将交易规模与池总价值进行比较。
library VolGuardFeeCalculator {
    // Uniswap v4 费率档位，单位为 pip（1 pip = 0.0001%）
    uint24 public constant LOW_FEE     = 500;    // 0.05% — 看涨（Bullish）
    uint24 public constant MEDIUM_FEE  = 3_000;  // 0.30% — 中性（Neutral）
    uint24 public constant HIGH_FEE    = 10_000; // 1.00% — 防御（Defensive）
    uint24 public constant EXTREME_FEE = 20_000; // 2.00% — 恐慌（Panic）

    // 比率阈值，单位为基点（1 bps = 0.01%）
    // 交易比率 bps = 交易量 * 10_000 / 池总价值
    uint256 public constant RATIO_MEDIUM_BPS  = 10;  // 0.10%
    uint256 public constant RATIO_HIGH_BPS    = 100; // 1.00%
    uint256 public constant RATIO_EXTREME_BPS = 500; // 5.00%

    /// @notice 返回有符号整数的绝对值。
    function abs(int256 x) internal pure returns (uint256) {
        return x < 0 ? uint256(-x) : uint256(x);
    }

    /// @notice 更新指数加权移动平均值（EWMA）。
    ///         公式：nextEwma = prevEwma * (10_000 - weightBps) / 10_000
    ///                        + currentAmount * weightBps / 10_000
    ///         当 prevEwma == 0（首笔交易）时，直接将 EWMA 设为当前交易量。
    function updateEwma(
        uint256 prevEwma,
        uint256 currentAmount,
        uint256 ewmaWeightBps
    ) internal pure returns (uint256) {
        if (prevEwma == 0) return currentAmount;
        uint256 decayPart  = prevEwma * (10_000 - ewmaWeightBps) / 10_000;
        uint256 growthPart = currentAmount * ewmaWeightBps / 10_000;
        return decayPart + growthPart;
    }

    /// @notice 使用绝对阈值模型选择费率。
    ///         优先级：极端波动（EWMA 突刺）> 鲸鱼 > 中等 > 低。
    function selectFeeAbsolute(
        uint256 absAmount,
        uint256 prevEwma,
        uint256 volatilityMultiplierBps,
        uint256 mediumThreshold,
        uint256 whaleThreshold
    ) internal pure returns (uint24) {
        // 极端：当前交易量为 EWMA 的 N 倍（默认 N=3）
        if (prevEwma > 0 && absAmount * 10_000 >= prevEwma * volatilityMultiplierBps) {
            return EXTREME_FEE;
        }
        if (absAmount >= whaleThreshold)    return HIGH_FEE;
        if (absAmount >= mediumThreshold)   return MEDIUM_FEE;
        return LOW_FEE;
    }

    /// @notice 使用比率模型选择费率（交易量 / 池总价值）。
    ///         避免除法以保持精度：改用乘法形式进行比较。
    function selectFeeRatio(
        uint256 absAmount,
        uint256 poolTotalValue,
        uint256 prevEwma,
        uint256 volatilityMultiplierBps
    ) internal pure returns (uint24) {
        if (poolTotalValue == 0) return LOW_FEE;

        // 极端：当前交易量为 EWMA 的 N 倍
        if (prevEwma > 0 && absAmount * 10_000 >= prevEwma * volatilityMultiplierBps) {
            return EXTREME_FEE;
        }

        // 比较 absAmount / poolTotalValue 与比率阈值（单位 bps）
        // 等价于：ratioBps >= threshold，即 absAmount * 10_000 >= poolTotalValue * threshold
        if (absAmount * 10_000 >= poolTotalValue * RATIO_EXTREME_BPS) return EXTREME_FEE;
        if (absAmount * 10_000 >= poolTotalValue * RATIO_HIGH_BPS)    return HIGH_FEE;
        if (absAmount * 10_000 >= poolTotalValue * RATIO_MEDIUM_BPS)  return MEDIUM_FEE;
        return LOW_FEE;
    }

    /// @notice 将费率值映射为心情指数，供前端展示。
    ///         0 = 看涨，1 = 中性，2 = 防御，3 = 恐慌
    function moodFromFee(uint24 fee) internal pure returns (uint8) {
        if (fee == LOW_FEE)     return 0;
        if (fee == MEDIUM_FEE)  return 1;
        if (fee == HIGH_FEE)    return 2;
        return 3;
    }
}
