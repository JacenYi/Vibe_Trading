/**
 * mineHookAddress.js
 *
 * 挖掘一个 CREATE2 盐值，使 VolGuardHook 部署地址
 * 编码了正确的 Uniswap v4 Hook 权限（BEFORE_SWAP_FLAG = 第 7 位）。
 *
 * 部署地址低 14 位必须恰好为 0x0080：
 *   - 第 7 位（BEFORE_SWAP_FLAG）= 1
 *   - 其他所有权限位 = 0
 *
 * 用法：
 *   node scripts/mineHookAddress.js [--network xlayer_testnet]
 *
 * 必需环境变量：
 *   POOL_MANAGER_ADDRESS  — 目标链上的 PoolManager 地址
 *   DEPLOYER_ADDRESS      — 调用 CREATE2 工厂的部署者地址
 *
 * 标准 CREATE2 工厂（Arachnid 确定性部署代理）地址：
 *   0x4e59b44847b379578588920cA78FbF26c0B4956b
 * 该工厂已预部署于大多数 EVM 链。
 */

require("dotenv").config();
const { ethers } = require("hardhat");

// Uniswap v4 Hook 权限标志（来自 Hooks.sol）
const BEFORE_SWAP_FLAG = 1n << 7n; // 0x80
const ALL_HOOK_MASK    = (1n << 14n) - 1n; // 0x3FFF — 仅低 14 位有效

// 目标：仅第 7 位置 1，其余 Hook 位全为 0
const REQUIRED_FLAGS = BEFORE_SWAP_FLAG; // 0x0080

// 标准 CREATE2 部署工厂（目标链上必须已部署）
const CREATE2_FACTORY = "0x4e59b44847b379578588920cA78FbF26c0B4956C";

async function main() {
  const [deployer] = await ethers.getSigners();
  const poolManagerAddress =
    process.env.POOL_MANAGER_ADDRESS || ethers.ZeroAddress;

  console.log("正在挖掘 Hook 地址...");
  console.log("  部署者：       ", deployer.address);
  console.log("  PoolManager：  ", poolManagerAddress);
  console.log("  CREATE2 工厂：  ", CREATE2_FACTORY);
  console.log("  目标标志位：    ", `0x${REQUIRED_FLAGS.toString(16).padStart(4, "0")}`);

  // 构造函数参数：(poolManager, owner, mediumThreshold, whaleThreshold, ewmaWeightBps, volMultiplierBps, validateAddress)
  const constructorArgs = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "address", "uint256", "uint256", "uint256", "uint256", "bool"],
    [
      poolManagerAddress,
      deployer.address,            // 管理员
      ethers.parseEther("5000"),   // mediumTradeThreshold
      ethers.parseEther("50000"),  // whaleThreshold
      2000,                        // ewmaWeightBps（20%）
      30000,                       // volatilityMultiplierBps（3 倍）
      true,                        // validateAddress = true（生产环境）
    ]
  );

  // 获取部署字节码
  const HookFactory    = await ethers.getContractFactory("VolGuardHook");
  const deployBytecode = HookFactory.bytecode + constructorArgs.slice(2); // 去掉 "0x"
  const initCodeHash   = ethers.keccak256(deployBytecode);

  console.log("  InitCodeHash：  ", initCodeHash);
  console.log("\n开始搜索有效盐值...\n");

  let found = false;
  const startTime = Date.now();
  let iterations = 0;

  for (let salt = 0n; salt < 2n ** 256n; salt++) {
    iterations++;
    const saltHex  = `0x${salt.toString(16).padStart(64, "0")}`;
    const computed = ethers.getCreate2Address(CREATE2_FACTORY, saltHex, initCodeHash);
    const addrBits = BigInt(computed) & ALL_HOOK_MASK;

    if (addrBits === REQUIRED_FLAGS) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`找到有效盐值！共尝试 ${iterations} 次（耗时 ${elapsed}s）：`);
      console.log(`  盐值：          ${saltHex}`);
      console.log(`  Hook 地址：     ${computed}`);
      console.log(`  地址标志位：    0x${addrBits.toString(16).padStart(4, "0")}`);
      console.log(`\n请添加到 .env：`);
      console.log(`  HOOK_DEPLOY_SALT=${saltHex}`);
      console.log(`  HOOK_ADDRESS=${computed}`);
      found = true;
      break;
    }

    if (iterations % 10000 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      process.stdout.write(`\r  已尝试 ${iterations.toLocaleString()} 个盐值（${elapsed}s）...`);
    }
  }

  if (!found) {
    console.error("在搜索范围内未找到有效盐值。");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
