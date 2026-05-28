// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {ModifyLiquidityParams, SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

/// @title VolGuardBaseHook
/// @notice 抽象基础 Hook，实现 IHooks 接口，仅启用 beforeSwap 回调。
///         其余所有 Hook 函数若被调用则直接 revert（PoolManager 也不会调用它们，
///         因为 Hook 地址的权限标志位已禁用）。
///
/// @dev 采用模板方法模式：具体的 beforeSwap() 携带 onlyPoolManager 修饰符，
///      然后委托给抽象的 _handleBeforeSwap()。子合约重写 _handleBeforeSwap()。
abstract contract VolGuardBaseHook is IHooks {
    address public immutable poolManager;

    error NotPoolManager();
    error HookNotImplemented();

    /// @dev 限制函数只能由 PoolManager 调用。
    modifier onlyPoolManager() {
        if (msg.sender != poolManager) revert NotPoolManager();
        _;
    }

    /// @param _poolManager      Uniswap v4 PoolManager 地址（测试中为 MockPoolManager）。
    /// @param _validateAddress  为 true 时校验本合约地址是否编码了正确的权限标志；
    ///                          测试时传 false 可跳过该校验。
    constructor(address _poolManager, bool _validateAddress) {
        poolManager = _poolManager;
        if (_validateAddress) {
            Hooks.validateHookPermissions(IHooks(address(this)), getHookPermissions());
        }
    }

    /// @notice 返回 Hook 权限配置。子合约如需不同权限可重写此函数。
    function getHookPermissions() public pure virtual returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize:               false,
            afterInitialize:                false,
            beforeAddLiquidity:             false,
            afterAddLiquidity:              false,
            beforeRemoveLiquidity:          false,
            afterRemoveLiquidity:           false,
            beforeSwap:                     true,
            afterSwap:                      false,
            beforeDonate:                   false,
            afterDonate:                    false,
            beforeSwapReturnDelta:          false,
            afterSwapReturnDelta:           false,
            afterAddLiquidityReturnDelta:   false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    // ─── 已启用的 Hook ────────────────────────────────────────────────────────

    /// @notice PoolManager 在每次 Swap 前调用此函数。
    ///         执行访问控制后委托给 _handleBeforeSwap。
    function beforeSwap(
        address sender,
        PoolKey calldata key,
        SwapParams calldata params,
        bytes calldata hookData
    ) external onlyPoolManager returns (bytes4, BeforeSwapDelta, uint24) {
        return _handleBeforeSwap(sender, key, params, hookData);
    }

    /// @dev 在具体 Hook 合约中重写此函数实现业务逻辑。
    function _handleBeforeSwap(
        address sender,
        PoolKey calldata key,
        SwapParams calldata params,
        bytes calldata hookData
    ) internal virtual returns (bytes4, BeforeSwapDelta, uint24);

    // ─── 未实现的 Hook（调用即 revert）────────────────────────────────────────

    function beforeInitialize(address, PoolKey calldata, uint160)
        external virtual returns (bytes4) { revert HookNotImplemented(); }

    function afterInitialize(address, PoolKey calldata, uint160, int24)
        external virtual returns (bytes4) { revert HookNotImplemented(); }

    function beforeAddLiquidity(
        address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata
    ) external virtual returns (bytes4) { revert HookNotImplemented(); }

    function afterAddLiquidity(
        address, PoolKey calldata, ModifyLiquidityParams calldata,
        BalanceDelta, BalanceDelta, bytes calldata
    ) external virtual returns (bytes4, BalanceDelta) { revert HookNotImplemented(); }

    function beforeRemoveLiquidity(
        address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata
    ) external virtual returns (bytes4) { revert HookNotImplemented(); }

    function afterRemoveLiquidity(
        address, PoolKey calldata, ModifyLiquidityParams calldata,
        BalanceDelta, BalanceDelta, bytes calldata
    ) external virtual returns (bytes4, BalanceDelta) { revert HookNotImplemented(); }

    function afterSwap(
        address, PoolKey calldata, SwapParams calldata, BalanceDelta, bytes calldata
    ) external virtual returns (bytes4, int128) { revert HookNotImplemented(); }

    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external virtual returns (bytes4) { revert HookNotImplemented(); }

    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external virtual returns (bytes4) { revert HookNotImplemented(); }
}
