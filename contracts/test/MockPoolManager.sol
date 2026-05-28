// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {BeforeSwapDelta} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

/// @title MockPoolManager
/// @notice 最小化测试辅助合约，模拟 PoolManager 以调用 VolGuardHook.beforeSwap()。
///         不实现完整的 IPoolManager 接口——仅转发 beforeSwap 调用。
///
/// @dev 先部署 MockPoolManager，再将其地址传给 VolGuardHook 构造函数。
///      Hook 的 onlyPoolManager 修饰符检查 msg.sender == poolManager，
///      因此来自 MockPoolManager 的调用可通过访问控制。
contract MockPoolManager {
    /// @notice 将 beforeSwap 调用转发给指定 Hook。
    function callBeforeSwap(
        address hook,
        address sender,
        PoolKey calldata key,
        SwapParams calldata params,
        bytes calldata hookData
    ) external returns (bytes4 selector, BeforeSwapDelta delta, uint24 feeOverride) {
        (selector, delta, feeOverride) = IHooks(hook).beforeSwap(sender, key, params, hookData);
    }
}
