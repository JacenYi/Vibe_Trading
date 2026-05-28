// VibeSwapRouter 构造参数文件（用于 hardhat verify --constructor-args）
// npx hardhat verify --network xlayer_mainnet --constructor-args scripts/args_router.js 0x54a5483726Ae8a0c56EE85870912A6F80743Fc9B
module.exports = [
  "0x360e68faccca8ca495c1b759fd9eee466db9fb32", // poolManager
  [
    "0x76bfEF73EcD829F940CE385849F9177c0485B706", // currency0 (MOOD)
    "0x7e826C03D6161385bbfa5eF93d59f81248Bff06a", // currency1 (USDC)
    8388608,                                       // fee (DYNAMIC_FEE_FLAG = 0x800000)
    60,                                            // tickSpacing
    "0xd12Fd82cbBa717618c91952827fadaC13066C080", // hooks (VolGuardHook)
  ],
];
