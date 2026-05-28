// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {VolGuardBaseHook} from "./base/VolGuardBaseHook.sol";
import {VolGuardFeeCalculator} from "./libraries/VolGuardFeeCalculator.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";

/// @title VolGuardHook
/// @notice Uniswap v4 Hook，根据交易风险信号在每次 Swap 时动态覆盖 LP 手续费。
///         实现"情绪池"（Mood Pool）概念——将交易量/池总价值比率映射为
///         看涨、中性、防御或恐慌四种状态，并选取对应费率档位。
///
/// @dev 池必须以 fee = LPFeeLibrary.DYNAMIC_FEE_FLAG（0x800000）初始化。
///
///      beforeSwap 中 hookData 的语义：
///        - 长度 >= 32：前 32 字节解码为 poolTotalValue（uint256）→ 使用比率模型
///        - 长度 <  32：回退至合约管理员设置的绝对阈值模型
contract VolGuardHook is VolGuardBaseHook {
    using PoolIdLibrary for PoolKey;

    // ─── 结构体 ───────────────────────────────────────────────────────────────

    struct RiskConfig {
        uint256 mediumTradeThreshold;    // 绝对模型：中等风险阈值（例如 5_000e18）
        uint256 whaleThreshold;          // 绝对模型：鲸鱼阈值（例如 50_000e18）
        uint256 ewmaWeightBps;           // EWMA 衰减权重（单位 bps，例如 2000 = 20%）
        uint256 volatilityMultiplierBps; // 极端触发倍数（例如 30000 = 3倍 EWMA）
    }

    // ─── 状态变量 ─────────────────────────────────────────────────────────────

    address public owner;
    RiskConfig public riskConfig;

    /// @notice 每个池的成交量指数加权移动平均值（EWMA）。
    mapping(PoolId => uint256) public ewmaState;

    /// @notice 本 Hook 最近一次为各池应用的手续费（不含 OVERRIDE_FEE_FLAG）。
    mapping(PoolId => uint24) public lastPoolFee;

    // ─── 事件 ─────────────────────────────────────────────────────────────────

    event FeeSelected(
        PoolId  indexed poolId,
        uint24  fee,
        uint256 tradeAmount,
        uint256 newEwma,
        bool    ratioModel
    );
    event OwnerChanged(address indexed oldOwner, address indexed newOwner);
    event RiskConfigUpdated(RiskConfig config);

    // ─── 错误 ─────────────────────────────────────────────────────────────────

    error Unauthorized();
    error InvalidRiskConfig(string reason);

    // ─── 修饰符 ───────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    // ─── 构造函数 ─────────────────────────────────────────────────────────────

    /// @param _poolManager      Uniswap v4 PoolManager（测试中为 MockPoolManager）
    /// @param _owner            初始合约管理员地址
    /// @param _mediumThreshold  绝对模型：中等风险阈值    （例如 5_000e18）
    /// @param _whaleThreshold   绝对模型：鲸鱼阈值        （例如 50_000e18）
    /// @param _ewmaWeightBps    EWMA 权重（bps）— 追踪速度 （例如 2000 = 20%）
    /// @param _volMultiplierBps 极端触发倍数              （例如 30000 = 3倍）
    /// @param _validateAddress  生产环境传 true（要求挖出正确地址）；测试传 false
    constructor(
        address _poolManager,
        address _owner,
        uint256 _mediumThreshold,
        uint256 _whaleThreshold,
        uint256 _ewmaWeightBps,
        uint256 _volMultiplierBps,
        bool    _validateAddress
    ) VolGuardBaseHook(_poolManager, _validateAddress) {
        owner = _owner;
        _applyRiskConfig(_mediumThreshold, _whaleThreshold, _ewmaWeightBps, _volMultiplierBps);
    }

    // ─── Hook 核心逻辑 ────────────────────────────────────────────────────────

    function _handleBeforeSwap(
        address,
        PoolKey calldata key,
        SwapParams calldata params,
        bytes calldata hookData
    ) internal override returns (bytes4, BeforeSwapDelta, uint24) {
        // 将 calldata PoolKey 复制到 memory，供 PoolIdLibrary.toId() 哈希
        PoolKey memory keyMem = PoolKey({
            currency0:   key.currency0,
            currency1:   key.currency1,
            fee:         key.fee,
            tickSpacing: key.tickSpacing,
            hooks:       key.hooks
        });
        PoolId poolId = PoolIdLibrary.toId(keyMem);

        uint256 absAmount = VolGuardFeeCalculator.abs(params.amountSpecified);
        uint256 prevEwma  = ewmaState[poolId];
        RiskConfig memory cfg = riskConfig;

        bool   useRatioModel = hookData.length >= 32;
        uint24 fee;

        if (useRatioModel) {
            uint256 poolTotalValue = abi.decode(hookData, (uint256));
            fee = VolGuardFeeCalculator.selectFeeRatio(
                absAmount, poolTotalValue, prevEwma, cfg.volatilityMultiplierBps
            );
        } else {
            fee = VolGuardFeeCalculator.selectFeeAbsolute(
                absAmount, prevEwma, cfg.volatilityMultiplierBps,
                cfg.mediumTradeThreshold, cfg.whaleThreshold
            );
        }

        uint256 newEwma = VolGuardFeeCalculator.updateEwma(prevEwma, absAmount, cfg.ewmaWeightBps);
        ewmaState[poolId]   = newEwma;
        lastPoolFee[poolId] = fee;

        emit FeeSelected(poolId, fee, absAmount, newEwma, useRatioModel);

        // OVERRIDE_FEE_FLAG 告知 PoolManager 使用此费率替代池的默认费率
        return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, fee | LPFeeLibrary.OVERRIDE_FEE_FLAG);
    }

    // ─── 前端视图函数 ─────────────────────────────────────────────────────────

    /// @notice 模拟某笔交易的手续费，不改变任何链上状态。
    /// @param rawPoolId        bytes32 池标识符（abi.encode(poolKey) 的 keccak256）
    /// @param absAmount        交易量（代币绝对数量）
    /// @param poolTotalValue   池 TVL；传 0 则使用绝对阈值模型
    /// @return fee             Uniswap v4 pip 单位的手续费
    /// @return moodIndex       0=看涨，1=中性，2=防御，3=恐慌
    /// @return nextEwma        此次交易后的预测 EWMA
    function simulateFee(bytes32 rawPoolId, uint256 absAmount, uint256 poolTotalValue)
        external view returns (uint24 fee, uint8 moodIndex, uint256 nextEwma)
    {
        PoolId poolId    = PoolId.wrap(rawPoolId);
        uint256 prevEwma = ewmaState[poolId];
        RiskConfig memory cfg = riskConfig;

        if (poolTotalValue > 0) {
            fee = VolGuardFeeCalculator.selectFeeRatio(
                absAmount, poolTotalValue, prevEwma, cfg.volatilityMultiplierBps
            );
        } else {
            fee = VolGuardFeeCalculator.selectFeeAbsolute(
                absAmount, prevEwma, cfg.volatilityMultiplierBps,
                cfg.mediumTradeThreshold, cfg.whaleThreshold
            );
        }

        moodIndex = VolGuardFeeCalculator.moodFromFee(fee);
        nextEwma  = VolGuardFeeCalculator.updateEwma(prevEwma, absAmount, cfg.ewmaWeightBps);
    }

    /// @notice 读取某个池当前的 EWMA 和最近一次应用的手续费。
    function getPoolState(bytes32 rawPoolId)
        external view returns (uint256 ewma, uint24 lastFee, uint8 moodIndex)
    {
        PoolId poolId = PoolId.wrap(rawPoolId);
        ewma      = ewmaState[poolId];
        lastFee   = lastPoolFee[poolId];
        moodIndex = VolGuardFeeCalculator.moodFromFee(lastFee);
    }

    // ─── 管理员函数 ───────────────────────────────────────────────────────────

    function setOwner(address newOwner) external onlyOwner {
        emit OwnerChanged(owner, newOwner);
        owner = newOwner;
    }

    function setRiskConfig(
        uint256 mediumThreshold,
        uint256 whaleThreshold,
        uint256 ewmaWeightBps,
        uint256 volMultiplierBps
    ) external onlyOwner {
        _applyRiskConfig(mediumThreshold, whaleThreshold, ewmaWeightBps, volMultiplierBps);
    }

    // ─── 内部函数 ─────────────────────────────────────────────────────────────

    function _applyRiskConfig(
        uint256 mediumThreshold,
        uint256 whaleThreshold,
        uint256 ewmaWeightBps,
        uint256 volMultiplierBps
    ) internal {
        if (mediumThreshold > whaleThreshold)
            revert InvalidRiskConfig("medium must be <= whale");
        if (ewmaWeightBps == 0 || ewmaWeightBps > 10_000)
            revert InvalidRiskConfig("ewmaWeightBps must be in (0, 10000]");
        if (volMultiplierBps < 10_000)
            revert InvalidRiskConfig("volMultiplierBps must be >= 10000 (1x)");

        riskConfig = RiskConfig({
            mediumTradeThreshold:    mediumThreshold,
            whaleThreshold:          whaleThreshold,
            ewmaWeightBps:           ewmaWeightBps,
            volatilityMultiplierBps: volMultiplierBps
        });

        emit RiskConfigUpdated(riskConfig);
    }
}
