/**
 * deploy.js — 部署完整的 VolGuard / Vibe Trading 合约栈。
 *
 * 本地部署（--network localhost）：
 *  MockPoolManager → VolGuardHook → MOOD/USDC → DemoSwapRouter → 铸币注流动性
 *
 * X Layer 主网部署（--network xlayer_mainnet）：
 *  挖 CREATE2 盐 → VolGuardHook → MOOD/USDC → 初始化池 → 注入流动性 → VibeSwapRouter
 *
 * X Layer PoolManager：0x360e68faccca8ca495c1b759fd9eee466db9fb32
 */

require("dotenv").config();
const hre          = require("hardhat");
const { ethers }   = hre;
const fs   = require("fs");
const path = require("path");

// ─── 合约验证（OKLink Etherscan 插件）────────────────────────────────────────
async function verifyContract(address, constructorArguments, label) {
  console.log(`\n🔍 验证 ${label} (${address}) ...`);
  try {
    await hre.run("verify:verify", { address, constructorArguments });
    console.log(`   ✅ ${label} 验证成功`);
  } catch (err) {
    const msg = err.message ?? "";
    if (/already verified/i.test(msg) || /already been verified/i.test(msg)) {
      console.log(`   ✅ ${label} 已验证`);
    } else {
      console.warn(`   ⚠ ${label} 验证失败：${msg.slice(0, 200)}`);
    }
  }
}

// Arachnid 确定性部署代理（EVM 通用 CREATE2 工厂）
const CREATE2_FACTORY = "0x4e59b44847b379578588920cA78FbF26c0B4956C";

// 各网络 PoolManager 地址（测试网地址通过环境变量注入）
const POOL_MANAGER_BY_NETWORK = {
  xlayer_mainnet: "0x360e68faccca8ca495c1b759fd9eee466db9fb32",
  xlayer_testnet: process.env.XLAYER_TESTNET_POOL_MANAGER ?? "",
};

// 默认风险配置
const DEFAULT_MEDIUM_THRESHOLD   = ethers.parseEther("5000");
const DEFAULT_WHALE_THRESHOLD    = ethers.parseEther("50000");
const DEFAULT_EWMA_WEIGHT_BPS    = 2000n;
const DEFAULT_VOL_MULTIPLIER_BPS = 30000n;

// 初始流动性
const LIQUIDITY_AMOUNT = ethers.parseEther("500000");
const USER_MINT_AMOUNT = ethers.parseEther("100000");

// Uniswap v4 Hook 权限标志（来自 Hooks.sol）
const ALL_HOOK_MASK   = 0x3FFFn;  // 最低 14 位
const BEFORE_SWAP_FLAG = 0x0080n; // 第 7 位

// sqrtPriceX96 对应 1:1 汇率（两个 18 位精度代币）
const SQRT_PRICE_1_1 = 79228162514264337593543950336n;

// ─── PoolId 计算（与 PoolIdLibrary.toId 一致）────────────────────────────────
function computePoolId(token0, token1, hookAddress) {
  const DYNAMIC_FEE_FLAG = 0x800000n;
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "address", "uint24", "int24", "address"],
    [token0, token1, DYNAMIC_FEE_FLAG, 60, hookAddress]
  );
  return ethers.keccak256(encoded);
}

// ─── 持久化多网络配置 ─────────────────────────────────────────────────────────
function loadAllConfigs() {
  const p = path.join(__dirname, "../deployments.json");
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return {}; }
}

function saveAndMerge(chainId, cfg) {
  const all = loadAllConfigs();
  all[String(chainId)] = cfg;
  fs.writeFileSync(path.join(__dirname, "../deployments.json"), JSON.stringify(all, null, 2));
  return all;
}

// ─── 自动更新前端 contracts.js ───────────────────────────────────────────────
function writeContractsJs(all) {
  const zero   = "0x0000000000000000000000000000000000000000";
  const zeroId = "0x0000000000000000000000000000000000000000000000000000000000000000";
  const c = (id) => all[String(id)] ?? {};

  const content =
`// 各网络的合约部署地址（由 scripts/deploy.js 自动生成，请勿手动编辑）。

export const CONTRACTS = {
  // Hardhat 本地网络
  31337: {
    hookAddress:        "${c(31337).hookAddress        ?? zero}",
    poolManagerAddress: "${c(31337).poolManagerAddress ?? zero}",
    moodToken:          "${c(31337).moodToken          ?? zero}",
    usdcToken:          "${c(31337).usdcToken          ?? zero}",
    routerAddress:      "${c(31337).routerAddress      ?? zero}",
    demoPoolId:         "${c(31337).demoPoolId         ?? zeroId}",
    moodIsToken0:       ${c(31337).moodIsToken0 ?? true},
  },
  // X Layer 测试网
  195: {
    hookAddress:        "${c(195).hookAddress        ?? zero}",
    poolManagerAddress: "${c(195).poolManagerAddress ?? zero}",
    moodToken:          "${c(195).moodToken          ?? zero}",
    usdcToken:          "${c(195).usdcToken          ?? zero}",
    routerAddress:      "${c(195).routerAddress      ?? zero}",
    demoPoolId:         "${c(195).demoPoolId         ?? zeroId}",
    moodIsToken0:       ${c(195).moodIsToken0 ?? true},
  },
  // X Layer 主网
  196: {
    hookAddress:        "${c(196).hookAddress        ?? zero}",
    poolManagerAddress: "${c(196).poolManagerAddress ?? zero}",
    moodToken:          "${c(196).moodToken          ?? zero}",
    usdcToken:          "${c(196).usdcToken          ?? zero}",
    routerAddress:      "${c(196).routerAddress      ?? zero}",
    demoPoolId:         "${c(196).demoPoolId         ?? zeroId}",
    moodIsToken0:       ${c(196).moodIsToken0 ?? true},
  },
};
`;
  const outPath = path.join(__dirname, "../frontend/src/constants/contracts.js");
  fs.writeFileSync(outPath, content);
  console.log("✅ frontend/src/constants/contracts.js 已自动更新");
}

// ─── CREATE2 Hook 地址挖矿 ────────────────────────────────────────────────────
async function mineHookSalt(deployer, poolManagerAddress) {
  console.log("⛏  挖掘 Hook CREATE2 盐值（目标：BEFORE_SWAP_FLAG = 0x0080）...");

  const HookFactory = await ethers.getContractFactory("VolGuardHook");
  const ctorArgs    = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "address", "uint256", "uint256", "uint256", "uint256", "bool"],
    [poolManagerAddress, deployer.address,
     DEFAULT_MEDIUM_THRESHOLD, DEFAULT_WHALE_THRESHOLD,
     DEFAULT_EWMA_WEIGHT_BPS, DEFAULT_VOL_MULTIPLIER_BPS,
     true]   // 生产网络校验 Hook 地址权限位
  );
  const deployBytecode = HookFactory.bytecode + ctorArgs.slice(2);
  const initCodeHash   = ethers.keccak256(deployBytecode);

  for (let i = 0n; i < 5_000_000n; i++) {
    const salt = ethers.toBeHex(i, 32);
    const addr = ethers.getCreate2Address(CREATE2_FACTORY, salt, initCodeHash);
    // Hook 地址必须满足：uint160(addr) & 0x3FFF == 0x0080（仅 beforeSwap 位）
    if ((BigInt(addr) & ALL_HOOK_MASK) === BEFORE_SWAP_FLAG) {
      console.log(`   找到！迭代 ${i} 次，Hook 地址：${addr}`);
      return { salt, hookAddress: addr, deployBytecode };
    }
  }
  throw new Error("未找到有效盐值（5M 次迭代）—— 请检查工厂地址");
}

// ─── 本地部署 ─────────────────────────────────────────────────────────────────
async function deployLocal(deployer) {
  console.log("── 本地 / 测试环境部署 ──────────────────────────────────");

  console.log("1/6  部署 MockPoolManager...");
  const MockPM = await ethers.getContractFactory("MockPoolManager");
  const mockPm = await MockPM.deploy();
  await mockPm.waitForDeployment();
  const pmAddress = await mockPm.getAddress();
  console.log("     MockPoolManager →", pmAddress);

  console.log("2/6  部署 VolGuardHook...");
  const Hook = await ethers.getContractFactory("VolGuardHook");
  const hook = await Hook.deploy(
    pmAddress, deployer.address,
    DEFAULT_MEDIUM_THRESHOLD, DEFAULT_WHALE_THRESHOLD,
    DEFAULT_EWMA_WEIGHT_BPS, DEFAULT_VOL_MULTIPLIER_BPS,
    false
  );
  await hook.waitForDeployment();
  const hookAddress = await hook.getAddress();
  console.log("     VolGuardHook    →", hookAddress);

  console.log("3/6  部署 MockERC20 代币（MOOD + USDC）...");
  const ERC20 = await ethers.getContractFactory("MockERC20");
  const tokenMood = await ERC20.deploy("Mood Token", "MOOD");
  const tokenUsdc = await ERC20.deploy("Mock USDC",  "USDC");
  await tokenMood.waitForDeployment();
  await tokenUsdc.waitForDeployment();
  const moodAddr = await tokenMood.getAddress();
  const usdcAddr = await tokenUsdc.getAddress();
  console.log("     MOOD →", moodAddr);
  console.log("     USDC →", usdcAddr);

  const moodIsToken0  = moodAddr.toLowerCase() < usdcAddr.toLowerCase();
  const [t0Addr, t1Addr] = moodIsToken0 ? [moodAddr, usdcAddr] : [usdcAddr, moodAddr];
  const [token0, token1] = moodIsToken0 ? [tokenMood, tokenUsdc] : [tokenUsdc, tokenMood];

  console.log("4/6  部署 DemoSwapRouter...");
  const Router = await ethers.getContractFactory("DemoSwapRouter");
  const router = await Router.deploy(pmAddress, hookAddress, t0Addr, t1Addr);
  await router.waitForDeployment();
  const routerAddress = await router.getAddress();
  console.log("     DemoSwapRouter →", routerAddress);

  console.log("5/6  铸币并注入流动性...");
  await tokenMood.mint(deployer.address, LIQUIDITY_AMOUNT + USER_MINT_AMOUNT);
  await tokenUsdc.mint(deployer.address, LIQUIDITY_AMOUNT + USER_MINT_AMOUNT);
  await token0.approve(routerAddress, LIQUIDITY_AMOUNT);
  await token1.approve(routerAddress, LIQUIDITY_AMOUNT);
  await router.addLiquidity(LIQUIDITY_AMOUNT, LIQUIDITY_AMOUNT);
  console.log("     路由器流动性：500,000 MOOD + 500,000 USDC ✅");
  console.log("     部署者余额：  100,000 MOOD + 100,000 USDC ✅");

  const demoPoolId = computePoolId(t0Addr, t1Addr, hookAddress);
  console.log("6/6  PoolId 计算完成：", demoPoolId);

  return {
    hookAddress, pmAddress, moodAddr, usdcAddr,
    routerAddress, demoPoolId, moodIsToken0,
  };
}

// ─── X Layer 主网部署 ─────────────────────────────────────────────────────────
async function deployXLayer(deployer, network) {
  console.log(`── X Layer 部署（${network}，真实 Uniswap v4 PoolManager）────────`);
  const pmAddress = POOL_MANAGER_BY_NETWORK[network];
  if (!pmAddress) throw new Error(`未配置 ${network} 的 PoolManager 地址，请在 .env 中设置 XLAYER_TESTNET_POOL_MANAGER`);
  console.log("PoolManager：", pmAddress);

  // ── 1. 部署测试代币 MOOD + USDC ─────────────────────────────────────────
  console.log("\n1/7  部署 MockERC20 代币（MOOD + USDC）...");
  const ERC20 = await ethers.getContractFactory("MockERC20");
  const tokenMood = await ERC20.deploy("Vibe MOOD", "MOOD");
  const tokenUsdc = await ERC20.deploy("Vibe USDC", "USDC");
  await tokenMood.waitForDeployment();
  await tokenUsdc.waitForDeployment();
  const moodAddr = await tokenMood.getAddress();
  const usdcAddr = await tokenUsdc.getAddress();
  console.log("     MOOD →", moodAddr);
  console.log("     USDC →", usdcAddr);

  const moodIsToken0 = moodAddr.toLowerCase() < usdcAddr.toLowerCase();
  const [t0Addr, t1Addr] = moodIsToken0 ? [moodAddr, usdcAddr] : [usdcAddr, moodAddr];
  const [token0, token1] = moodIsToken0 ? [tokenMood, tokenUsdc] : [tokenUsdc, tokenMood];
  console.log(`     token0 = ${moodIsToken0 ? "MOOD" : "USDC"} (${t0Addr})`);
  console.log(`     token1 = ${moodIsToken0 ? "USDC" : "MOOD"} (${t1Addr})`);

  // ── 2. 挖 CREATE2 盐并部署 VolGuardHook ──────────────────────────────────
  console.log("\n2/7  挖矿 + 部署 VolGuardHook...");

  // 检查 CREATE2 工厂是否存在
  const factoryCode = await ethers.provider.getCode(CREATE2_FACTORY);
  if (factoryCode === "0x") {
    throw new Error(
      `CREATE2 工厂 (${CREATE2_FACTORY}) 未部署到此网络。\n` +
      "请参考 https://github.com/Arachnid/deterministic-deployment-proxy 先部署工厂合约。"
    );
  }

  const { salt, hookAddress, deployBytecode } = await mineHookSalt(deployer, pmAddress);

  // 若已存在（上次部署中途失败可复用），跳过 CREATE2 部署
  const existingCode = await ethers.provider.getCode(hookAddress);
  if (existingCode !== "0x") {
    console.log("     VolGuardHook 已存在，复用 →", hookAddress, "✅");
  } else {
    // 通过 CREATE2 工厂部署（calldata = salt32 + bytecode）
    const deployTx = await deployer.sendTransaction({
      to:   CREATE2_FACTORY,
      data: salt + deployBytecode.slice(2),
    });
    await deployTx.wait();
    const hookCode = await ethers.provider.getCode(hookAddress);
    if (hookCode === "0x") throw new Error("Hook 部署失败：地址处无代码");
    console.log("     VolGuardHook →", hookAddress, "✅");
  }

  // ── 3. 构建 PoolKey ────────────────────────────────────────────────────────
  const DYNAMIC_FEE_FLAG = 0x800000;
  const poolKey = {
    currency0:   t0Addr,
    currency1:   t1Addr,
    fee:         DYNAMIC_FEE_FLAG,
    tickSpacing: 60,
    hooks:       hookAddress,
  };

  // ── 4. 初始化池（1:1 汇率）────────────────────────────────────────────────
  console.log("\n3/7  在 PoolManager 初始化池...");
  const pmContract = new ethers.Contract(
    pmAddress,
    ["function initialize(tuple(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key, uint160 sqrtPriceX96) external returns (int24 tick)"],
    deployer
  );
  const initTx = await pmContract.initialize(poolKey, SQRT_PRICE_1_1);
  await initTx.wait();
  console.log("     池初始化完成 @ sqrtPriceX96 =", SQRT_PRICE_1_1.toString(), "（1:1）✅");

  // ── 5. 部署 VibeLiquidityHelper 并注入流动性 ──────────────────────────────
  console.log("\n4/7  部署 VibeLiquidityHelper...");
  const LiqHelper = await ethers.getContractFactory("VibeLiquidityHelper");
  const liqHelper = await LiqHelper.deploy(pmAddress);
  await liqHelper.waitForDeployment();
  const liqHelperAddr = await liqHelper.getAddress();
  console.log("     VibeLiquidityHelper →", liqHelperAddr);

  console.log("\n5/7  铸币并注入流动性...");
  const mintTotal = LIQUIDITY_AMOUNT + USER_MINT_AMOUNT;
  await (await tokenMood.mint(deployer.address, mintTotal)).wait();
  await (await tokenUsdc.mint(deployer.address, mintTotal)).wait();

  // 授权 VibeLiquidityHelper 消费代币（等待确认后再进行下一步）
  await (await token0.approve(liqHelperAddr, ethers.MaxUint256)).wait();
  await (await token1.approve(liqHelperAddr, ethers.MaxUint256)).wait();

  // 全范围流动性（tickSpacing=60 最大区间）
  const TICK_LOWER = -887220;
  const TICK_UPPER =  887220;
  // 流动性数量约等于单侧代币量（1:1 池全范围近似）
  const LIQUIDITY_DELTA = LIQUIDITY_AMOUNT;

  const liqTx = await liqHelper.addLiquidity(
    poolKey, TICK_LOWER, TICK_UPPER, LIQUIDITY_DELTA
  );
  await liqTx.wait();
  console.log("     流动性注入完成 ✅");
  console.log("     部署者余额：  100,000 MOOD + 100,000 USDC ✅");

  // ── 6. 部署 VibeSwapRouter ────────────────────────────────────────────────
  console.log("\n6/7  部署 VibeSwapRouter...");
  const PoolKeyTuple = [
    t0Addr, t1Addr, DYNAMIC_FEE_FLAG, 60, hookAddress
  ];
  const Router = await ethers.getContractFactory("VibeSwapRouter");
  const router = await Router.deploy(pmAddress, PoolKeyTuple);
  await router.waitForDeployment();
  const routerAddress = await router.getAddress();
  console.log("     VibeSwapRouter →", routerAddress, "✅");

  // ── 7. 计算 PoolId ────────────────────────────────────────────────────────
  const demoPoolId = computePoolId(t0Addr, t1Addr, hookAddress);
  console.log("\n7/7  PoolId：", demoPoolId);

  // ── 8. 验证合约源码（OKLink）─────────────────────────────────────────────
  console.log("\n── 开始合约验证 ─────────────────────────────────────────────");

  await verifyContract(moodAddr, ["Vibe MOOD", "MOOD"], "MockERC20 (MOOD)");
  await verifyContract(usdcAddr, ["Vibe USDC", "USDC"], "MockERC20 (USDC)");
  await verifyContract(hookAddress, [
    pmAddress, deployer.address,
    DEFAULT_MEDIUM_THRESHOLD, DEFAULT_WHALE_THRESHOLD,
    DEFAULT_EWMA_WEIGHT_BPS, DEFAULT_VOL_MULTIPLIER_BPS,
    true,
  ], "VolGuardHook");
  await verifyContract(liqHelperAddr, [pmAddress], "VibeLiquidityHelper");
  await verifyContract(routerAddress, [
    pmAddress,
    [t0Addr, t1Addr, DYNAMIC_FEE_FLAG, 60, hookAddress],
  ], "VibeSwapRouter");

  return {
    hookAddress, pmAddress, moodAddr, usdcAddr,
    routerAddress, liqHelperAddr, demoPoolId, moodIsToken0,
  };
}

// ─── 入口 ─────────────────────────────────────────────────────────────────────
async function main() {
  const [deployer] = await ethers.getSigners();
  const network    = hre.network.name;
  const chainId    = (await ethers.provider.getNetwork()).chainId;

  console.log(`\n正在部署到网络：${network}（chainId ${chainId}）`);
  console.log("部署者：", deployer.address);
  console.log("余额：  ", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  const isLocal = network === "hardhat" || network === "localhost";
  let result;

  if (isLocal) {
    result = await deployLocal(deployer);
  } else if (network === "xlayer_mainnet" || network === "xlayer_testnet") {
    result = await deployXLayer(deployer, network);
  } else {
    throw new Error(`不支持的网络：${network}`);
  }

  // 保存 deployment.json
  const deploymentInfo = {
    network, chainId: Number(chainId),
    hookAddress:        result.hookAddress,
    poolManagerAddress: result.pmAddress,
    moodToken:          result.moodAddr,
    usdcToken:          result.usdcAddr,
    routerAddress:      result.routerAddress,
    demoPoolId:         result.demoPoolId,
    moodIsToken0:       result.moodIsToken0,
    deployer:           deployer.address,
    timestamp:          new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(__dirname, "../deployment.json"),
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log("\n部署信息已保存至 deployment.json");

  // 合并多网络配置并更新前端 contracts.js
  const allConfigs = saveAndMerge(Number(chainId), {
    hookAddress:        result.hookAddress,
    poolManagerAddress: result.pmAddress,
    moodToken:          result.moodAddr,
    usdcToken:          result.usdcAddr,
    routerAddress:      result.routerAddress,
    demoPoolId:         result.demoPoolId,
    moodIsToken0:       result.moodIsToken0,
  });
  writeContractsJs(allConfigs);

  const explorerBase = network === "xlayer_mainnet"
    ? "https://www.oklink.com/xlayer/address"
    : "https://www.oklink.com/xlayer-test/address";

  console.log("\n");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║              Vibe Trading — 合约部署地址汇总                  ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log(`║ 网络          : ${network.padEnd(46)}║`);
  console.log(`║ ChainId       : ${String(Number(chainId)).padEnd(46)}║`);
  console.log(`║ 部署者        : ${deployer.address.padEnd(46)}║`);
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log(`║ PoolManager   : ${result.pmAddress.padEnd(46)}║`);
  console.log(`║ VolGuardHook  : ${result.hookAddress.padEnd(46)}║`);
  console.log(`║ MOOD Token    : ${result.moodAddr.padEnd(46)}║`);
  console.log(`║ USDC Token    : ${result.usdcAddr.padEnd(46)}║`);
  console.log(`║ LiqHelper     : ${(result.liqHelperAddr ?? "N/A").padEnd(46)}║`);
  console.log(`║ SwapRouter    : ${result.routerAddress.padEnd(46)}║`);
  console.log(`║ PoolId        : ${result.demoPoolId.padEnd(46)}║`);
  console.log(`║ MOOD=token0   : ${String(result.moodIsToken0).padEnd(46)}║`);
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log("║ OKLink 浏览器链接：                                            ║");
  console.log(`║   Hook   → ${(explorerBase + "/" + result.hookAddress).slice(0, 54)}║`);
  console.log(`║   Router → ${(explorerBase + "/" + result.routerAddress).slice(0, 54)}║`);
  console.log(`║   MOOD   → ${(explorerBase + "/" + result.moodAddr).slice(0, 54)}║`);
  console.log(`║   USDC   → ${(explorerBase + "/" + result.usdcAddr).slice(0, 54)}║`);
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("\n前端 contracts.js 已自动更新，重新启动 Vite 即可生效。");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
