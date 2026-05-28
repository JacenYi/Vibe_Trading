// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {IPoolManager}    from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey}         from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency}        from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams}      from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TickMath}        from "@uniswap/v4-core/src/libraries/TickMath.sol";

/// @dev 最小化 ERC20 接口，仅用于代币转移
interface IERC20Minimal {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title VibeSwapRouter
/// @notice 接入真实 Uniswap v4 PoolManager 的交换路由器。
///
/// @dev 实现 IUnlockCallback 模式：
///      swap() → PoolManager.unlock() → unlockCallback() → PoolManager.swap() → 结算
///
///      hookData 传递 poolTotalValue（前端读取后传入），供 VolGuardHook 的比率模型使用。
///      如果 poolTotalValue = 0，Hook 回退到绝对阈值模型。
contract VibeSwapRouter is IUnlockCallback {
    using BalanceDeltaLibrary for BalanceDelta;

    IPoolManager public immutable poolManager;

    /// @notice 与 Hook 共用的 PoolKey
    PoolKey public poolKey;

    // ─── 结构体 ───────────────────────────────────────────────────────────────

    /// @dev 通过 unlock → unlockCallback 传递的上下文数据
    struct CallbackData {
        address sender;
        PoolKey  key;
        bool     zeroForOne;
        uint256  amountIn;
        bytes    hookData;
    }

    // ─── 事件 ─────────────────────────────────────────────────────────────────

    /// @notice 每次 Swap 完成后触发，fee 和 feeCharged 由 amountIn - amountOut 推算
    event Swapped(
        address indexed trader,
        bool    zeroForOne,
        uint256 amountIn,
        uint256 amountOut,
        uint24  fee,
        uint256 feeCharged
    );

    // ─── 构造函数 ─────────────────────────────────────────────────────────────

    constructor(address _poolManager, PoolKey memory _poolKey) {
        poolManager = IPoolManager(_poolManager);
        poolKey     = _poolKey;
    }

    // ─── 核心函数 ─────────────────────────────────────────────────────────────

    /// @notice 执行一次 Swap，自动触发 VolGuardHook.beforeSwap()。
    ///
    /// @param amountIn        精确输入数量（wei）
    /// @param zeroForOne      true = token0 → token1；false = token1 → token0
    /// @param poolTotalValue  池总价值估算（wei，前端从 PoolManager 读取后传入）；
    ///                        传 0 时 Hook 使用绝对阈值模型
    /// @return amountOut      用户实际收到的代币数量
    function swap(
        uint256 amountIn,
        bool    zeroForOne,
        uint256 poolTotalValue
    ) external returns (uint256 amountOut) {
        bytes memory hookData = poolTotalValue > 0
            ? abi.encode(poolTotalValue)
            : bytes("");

        bytes memory result = poolManager.unlock(
            abi.encode(CallbackData({
                sender:     msg.sender,
                key:        poolKey,
                zeroForOne: zeroForOne,
                amountIn:   amountIn,
                hookData:   hookData
            }))
        );
        amountOut = abi.decode(result, (uint256));
    }

    /// @notice PoolManager 回调入口，在 unlock 期间执行实际 Swap 逻辑和货币结算。
    function unlockCallback(bytes calldata rawData) external returns (bytes memory) {
        require(msg.sender == address(poolManager), "VibeSwapRouter: only PM");

        CallbackData memory data = abi.decode(rawData, (CallbackData));

        // 精确输入：amountSpecified 为负数
        SwapParams memory params = SwapParams({
            zeroForOne:        data.zeroForOne,
            amountSpecified:   -int256(data.amountIn),
            sqrtPriceLimitX96: data.zeroForOne
                ? TickMath.MIN_SQRT_PRICE + 1
                : TickMath.MAX_SQRT_PRICE - 1
        });

        BalanceDelta delta = poolManager.swap(data.key, params, data.hookData);

        int128 d0 = delta.amount0();
        int128 d1 = delta.amount1();

        uint256 amountOut;

        if (data.zeroForOne) {
            // token0 流入（d0 < 0），token1 流出（d1 > 0）
            if (d0 < 0) _settle(data.key.currency0, data.sender, uint256(int256(-d0)));
            if (d1 > 0) {
                amountOut = uint256(int256(d1));
                poolManager.take(data.key.currency1, data.sender, amountOut);
            }
        } else {
            // token1 流入（d1 < 0），token0 流出（d0 > 0）
            if (d1 < 0) _settle(data.key.currency1, data.sender, uint256(int256(-d1)));
            if (d0 > 0) {
                amountOut = uint256(int256(d0));
                poolManager.take(data.key.currency0, data.sender, amountOut);
            }
        }

        // 从 amountIn - amountOut 推算有效费率（适用于深度充足的池子）
        uint256 feeCharged = data.amountIn > amountOut ? data.amountIn - amountOut : 0;
        uint24  fee        = data.amountIn > 0
            ? uint24(feeCharged * 1_000_000 / data.amountIn)
            : 0;

        emit Swapped(data.sender, data.zeroForOne, data.amountIn, amountOut, fee, feeCharged);

        return abi.encode(amountOut);
    }

    // ─── 内部函数 ─────────────────────────────────────────────────────────────

    /// @dev ERC20 → PoolManager 结算：sync → transferFrom → settle
    function _settle(Currency currency, address payer, uint256 amount) internal {
        poolManager.sync(currency);
        IERC20Minimal(Currency.unwrap(currency)).transferFrom(
            payer,
            address(poolManager),
            amount
        );
        poolManager.settle();
    }
}
