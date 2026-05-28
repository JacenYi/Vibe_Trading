const { ethers } = require("hardhat");

const DYNAMIC_FEE_FLAG  = 0x800000n; // LPFeeLibrary.DYNAMIC_FEE_FLAG，动态费率标志
const OVERRIDE_FEE_FLAG = 0x400000n; // LPFeeLibrary.OVERRIDE_FEE_FLAG，费率覆盖标志

/**
 * 构造与 Uniswap v4 / VolGuardHook 兼容的 PoolKey 结构体。
 * PoolKey = { currency0, currency1, fee, tickSpacing, hooks }
 * fee 必须为 DYNAMIC_FEE_FLAG，Hook 才能覆盖费率。
 */
function buildPoolKey(currency0, currency1, hookAddress) {
  return {
    currency0: currency0,
    currency1: currency1,
    fee: DYNAMIC_FEE_FLAG,
    tickSpacing: 60,
    hooks: hookAddress,
  };
}

/**
 * 使用与 PoolIdLibrary.toId() 相同的算法计算 PoolId。
 * PoolId = keccak256(abi.encode(currency0, currency1, fee, tickSpacing, hooks))
 * 注意：abi.encode 将每个值填充至 32 字节（5 个字段共 160 字节）。
 */
function computePoolId(poolKey) {
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "address", "uint24", "int24", "address"],
    [
      poolKey.currency0,
      poolKey.currency1,
      poolKey.fee,
      poolKey.tickSpacing,
      poolKey.hooks,
    ]
  );
  return ethers.keccak256(encoded);
}

/**
 * 编码比率模型所需的 hookData。
 * 前 32 字节为 poolTotalValue（uint256）。
 */
function encodePoolTotalValue(poolTotalValue) {
  return ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [poolTotalValue]);
}

/**
 * 从 beforeSwap 返回的费率覆盖值中提取基础费率。
 * 屏蔽掉 OVERRIDE_FEE_FLAG 位。
 */
function extractBaseFee(feeOverride) {
  return feeOverride & ~OVERRIDE_FEE_FLAG;
}

/**
 * 检查费率值中是否设置了 OVERRIDE_FEE_FLAG。
 */
function hasOverrideFlag(feeOverride) {
  return (BigInt(feeOverride) & OVERRIDE_FEE_FLAG) !== 0n;
}

/**
 * 构造一次交易的 SwapParams。
 */
function buildSwapParams(amountSpecified, zeroForOne = true) {
  return {
    zeroForOne: zeroForOne,
    amountSpecified: amountSpecified,
    sqrtPriceLimitX96: 0n,
  };
}

module.exports = {
  DYNAMIC_FEE_FLAG,
  OVERRIDE_FEE_FLAG,
  buildPoolKey,
  computePoolId,
  encodePoolTotalValue,
  extractBaseFee,
  hasOverrideFlag,
  buildSwapParams,
};
