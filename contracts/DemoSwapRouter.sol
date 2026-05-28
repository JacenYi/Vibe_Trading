// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {PoolKey}                                    from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency}                                   from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks}                                     from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {SwapParams}                                 from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {MockPoolManager}                            from "./test/MockPoolManager.sol";
import {MockERC20}                                  from "./test/MockERC20.sol";

/// @title DemoSwapRouter
/// @notice 演示用交换路由器。
///         用户调用 swap() 时，路由器自动触发 VolGuardHook.beforeSwap()，
///         按 Hook 返回的动态费率扣除手续费后将目标代币发给用户。
///
/// @dev 这不是一个真正的 AMM（不维护 x*y=k 价格曲线），
///      采用 1:1 兑换比率，手续费从输入金额中扣除，
///      目的是专注演示 Hook 费率机制，而非 AMM 定价逻辑。
///
///      兑换方向（zeroForOne）：
///        true  → token0 流入，token1 流出（卖出 token0）
///        false → token1 流入，token0 流出（买入 token0）
contract DemoSwapRouter {

    // ─── 不可变状态 ───────────────────────────────────────────────────────────

    MockPoolManager public immutable poolManager; // 用于调用 Hook
    address         public immutable hook;        // VolGuardHook 地址
    MockERC20       public immutable token0;      // 地址较小的代币
    MockERC20       public immutable token1;      // 地址较大的代币

    /// @notice 与 Hook 共用的 PoolKey（fee = DYNAMIC_FEE_FLAG，tickSpacing = 60）
    PoolKey public poolKey;

    // OVERRIDE_FEE_FLAG = 0x400000，屏蔽后得到基础费率（单位：pip）
    uint24 private constant OVERRIDE_MASK = 0x3FFFFF;

    // ─── 事件 ─────────────────────────────────────────────────────────────────

    /// @notice 每次真实 Swap 后触发。
    /// @param fee        Hook 选定的费率（pip，1pip = 0.0001%）
    /// @param feeCharged 实际扣除的手续费（代币绝对数量）
    event Swapped(
        address indexed trader,
        bool    zeroForOne,
        uint256 amountIn,
        uint256 amountOut,
        uint24  fee,
        uint256 feeCharged
    );

    // ─── 构造函数 ─────────────────────────────────────────────────────────────

    /// @param _poolManager MockPoolManager 地址（用于触发 Hook）
    /// @param _hook        VolGuardHook 地址
    /// @param _token0      地址较小的代币（token0）
    /// @param _token1      地址较大的代币（token1）
    constructor(
        address _poolManager,
        address _hook,
        address _token0,
        address _token1
    ) {
        require(_token0 < _token1, "DemoSwapRouter: token0 must be < token1");
        poolManager = MockPoolManager(_poolManager);
        hook        = _hook;
        token0      = MockERC20(_token0);
        token1      = MockERC20(_token1);

        // 构造 PoolKey，与 Hook 内部使用的 PoolId 保持一致
        // fee = 0x800000 = LPFeeLibrary.DYNAMIC_FEE_FLAG
        poolKey = PoolKey({
            currency0:   Currency.wrap(_token0),
            currency1:   Currency.wrap(_token1),
            fee:         0x800000,
            tickSpacing: 60,
            hooks:       IHooks(_hook)
        });
    }

    // ─── 核心函数 ─────────────────────────────────────────────────────────────

    /// @notice 执行一次真实 Swap，自动触发 VolGuardHook 并按动态费率收取手续费。
    ///
    /// @param amountIn   输入代币数量（wei）
    /// @param zeroForOne true = token0 → token1；false = token1 → token0
    ///
    /// @return amountOut   用户实际收到的代币数量
    /// @return fee         Hook 选定的费率（pip）
    /// @return feeCharged  实际扣除的手续费金额
    function swap(
        uint256 amountIn,
        bool    zeroForOne
    ) external returns (uint256 amountOut, uint24 fee, uint256 feeCharged) {
        MockERC20 tokenIn  = zeroForOne ? token0 : token1;
        MockERC20 tokenOut = zeroForOne ? token1 : token0;

        // 记录 Swap 前的池子总价值，用于 Hook 的比率模型
        uint256 poolTotalBefore = token0.balanceOf(address(this))
                                + token1.balanceOf(address(this));

        // 从用户处收取输入代币
        tokenIn.transferFrom(msg.sender, address(this), amountIn);

        // 构造 hookData：编码池总价值供比率模型使用
        bytes memory hookData = poolTotalBefore > 0
            ? abi.encode(poolTotalBefore)
            : bytes("");

        // 通过 MockPoolManager 触发 VolGuardHook.beforeSwap()
        // Hook 内部会：1) 计算费率  2) 更新 EWMA  3) 返回 fee | OVERRIDE_FEE_FLAG
        SwapParams memory params = SwapParams({
            zeroForOne:        zeroForOne,
            amountSpecified:   int256(amountIn),
            sqrtPriceLimitX96: 0
        });
        (, , uint24 feeOverride) = poolManager.callBeforeSwap(
            hook, msg.sender, poolKey, params, hookData
        );

        // 从 feeOverride 中提取基础费率（去掉 OVERRIDE_FEE_FLAG）
        fee        = feeOverride & OVERRIDE_MASK;
        // 手续费计算：amountIn × fee / 1_000_000（pip 精度）
        feeCharged = amountIn * uint256(fee) / 1_000_000;
        amountOut  = amountIn - feeCharged;

        // 将输出代币发给用户（路由器保留手续费作为收益）
        require(tokenOut.balanceOf(address(this)) >= amountOut, "DemoSwapRouter: insufficient liquidity");
        tokenOut.transfer(msg.sender, amountOut);

        emit Swapped(msg.sender, zeroForOne, amountIn, amountOut, fee, feeCharged);
    }

    // ─── 流动性管理 ───────────────────────────────────────────────────────────

    /// @notice 向路由器注入流动性（仅部署脚本调用）。
    function addLiquidity(uint256 amountToken0, uint256 amountToken1) external {
        if (amountToken0 > 0) token0.transferFrom(msg.sender, address(this), amountToken0);
        if (amountToken1 > 0) token1.transferFrom(msg.sender, address(this), amountToken1);
    }

    // ─── 视图函数 ─────────────────────────────────────────────────────────────

    /// @notice 当前路由器持有的池子总价值（token0 + token1，按 1:1 计）。
    function poolTotalValue() external view returns (uint256) {
        return token0.balanceOf(address(this)) + token1.balanceOf(address(this));
    }
}

