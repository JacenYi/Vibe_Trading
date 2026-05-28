// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {IPoolManager}    from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey}         from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency}        from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

interface IERC20Minimal {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title VibeLiquidityHelper
/// @notice 部署脚本专用的一次性流动性注入合约。
///         通过 IUnlockCallback 模式向真实 PoolManager 注入初始流动性。
///
/// @dev 部署完成后无需保留，仅在 deployXLayer 脚本中调用一次 addLiquidity()。
contract VibeLiquidityHelper is IUnlockCallback {
    using BalanceDeltaLibrary for BalanceDelta;

    IPoolManager public immutable poolManager;

    struct CallbackData {
        address  sender;
        PoolKey  key;
        int24    tickLower;
        int24    tickUpper;
        int256   liquidityDelta;
    }

    constructor(address _poolManager) {
        poolManager = IPoolManager(_poolManager);
    }

    /// @notice 向指定池注入流动性。
    /// @param key            目标池的 PoolKey
    /// @param tickLower      流动性区间下界
    /// @param tickUpper      流动性区间上界
    /// @param liquidityDelta 增加的流动性数量（正数 = 添加）
    function addLiquidity(
        PoolKey calldata key,
        int24   tickLower,
        int24   tickUpper,
        int256  liquidityDelta
    ) external {
        poolManager.unlock(
            abi.encode(CallbackData({
                sender:         msg.sender,
                key:            key,
                tickLower:      tickLower,
                tickUpper:      tickUpper,
                liquidityDelta: liquidityDelta
            }))
        );
    }

    function unlockCallback(bytes calldata rawData) external returns (bytes memory) {
        require(msg.sender == address(poolManager), "VibeLiquidityHelper: only PM");

        CallbackData memory data = abi.decode(rawData, (CallbackData));

        ModifyLiquidityParams memory params = ModifyLiquidityParams({
            tickLower:      data.tickLower,
            tickUpper:      data.tickUpper,
            liquidityDelta: data.liquidityDelta,
            salt:           bytes32(0)
        });

        (BalanceDelta callerDelta, ) = poolManager.modifyLiquidity(
            data.key, params, bytes("")
        );

        int128 d0 = callerDelta.amount0();
        int128 d1 = callerDelta.amount1();

        // 添加流动性时 delta 为负（用户向池子提供代币）
        if (d0 < 0) _settle(data.key.currency0, data.sender, uint256(int256(-d0)));
        if (d1 < 0) _settle(data.key.currency1, data.sender, uint256(int256(-d1)));

        return bytes("");
    }

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
