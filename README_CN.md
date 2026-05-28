# Vibe Trading

> 基于 Uniswap v4 Hook 的动态手续费 AMM Demo，根据每笔交易对池子储备的冲击程度实时调整 LP 手续费。

[English](./README.md)

---

[项目介绍](./VIBE_TRADING_CN.md)

---

## 项目简介

**Vibe Trading** 是一个基于 **Uniswap v4 Hook** 的动态手续费 AMM Demo。核心思路：每次 Swap 执行前，Hook 计算本次交易量占池子总价值的比率，并据此选择对应的手续费档位。

- 小额交易 → 低手续费（0.05%）——降低普通用户交易成本
- 大额交易 → 高手续费（2.00%）——补偿 LP 承担的价格冲击风险

不依赖外部预言机、价格源或市值数据，Hook 只读取链上池子状态。

---

## 手续费逻辑

```
tradeImpactBps = 交易量 × 10,000 / 池子总价值
```

| 冲击比率 | Vibe 状态 | 手续费 |
|---------|----------|--------|
| ≥ 5%    | Panic    | 2.00%  |
| ≥ 1%    | Defensive | 1.00% |
| ≥ 0.1%  | Neutral  | 0.30%  |
| < 0.1%  | Bullish  | 0.05%  |

**示例：**

```
池子总价值：1,000,000
Swap 金额：    5,000

tradeImpactBps = 5,000 × 10,000 / 1,000,000 = 50 bps = 0.50%

→ 进入 Neutral 状态，手续费 0.30%
```

---

## 项目架构

```
UniSwapV4Demo/
├── contracts/
│   ├── VolGuardHook.sol              # 核心 Hook —— 在 beforeSwap 中选择手续费
│   ├── VibeSwapRouter.sol            # 主网路由器（X Layer）—— 实现 IUnlockCallback
│   ├── DemoSwapRouter.sol            # 本地演示路由器（Hardhat）
│   ├── VibeLiquidityHelper.sol       # 部署时一次性注入流动性的辅助合约
│   ├── base/
│   │   └── VolGuardBaseHook.sol      # Hook 权限位校验 + 基础封装
│   ├── libraries/
│   │   └── VolGuardFeeCalculator.sol # 纯手续费计算逻辑（比率模型 + EWMA）
│   └── test/
│       ├── MockPoolManager.sol       # 本地测试用 PoolManager 模拟合约
│       └── MockERC20.sol             # 可铸币 ERC20（测试代币）
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── MoodSimulator.jsx     # Swap 输入 + 模拟/执行按钮
│   │   │   ├── ActivityLog.jsx       # 近期交易记录（含手续费明细）
│   │   │   └── ...
│   │   ├── hooks/
│   │   │   ├── useDemoSwap.js        # 链上 Swap、余额、授权管理
│   │   │   └── useVolGuard.js        # Hook 合约读取 + 手续费模拟
│   │   ├── constants/
│   │   │   └── contracts.js          # 各链合约地址（由 deploy.js 自动生成）
│   │   └── abi/
│   │       ├── VolGuardHook.json
│   │       ├── VibeSwapRouter.json
│   │       └── DemoSwapRouter.json
├── scripts/
│   ├── deploy.js                     # 完整部署脚本（本地 + X Layer 主网）
│   ├── mineHookAddress.js            # 独立 CREATE2 盐值挖矿工具
│   └── args_router.js                # VibeSwapRouter 合约验证构造参数文件
└── test/
    ├── VolGuardHook.test.js
    ├── VolGuardFeeCalculator.test.js
    └── helpers/poolHelpers.js
```

---

## 合约详解

### VolGuardHook

实现 `beforeSwap` 的核心 Hook，所注册的池子必须以 `DYNAMIC_FEE_FLAG (0x800000)` 初始化。

**执行流程：**
1. PoolManager 在每次 Swap 前调用 `beforeSwap`
2. Hook 解码 `hookData`——长度 ≥ 32 字节时包含 `poolTotalValue`，启用比率模型；否则退回绝对阈值模型
3. 选定手续费后携带 `OVERRIDE_FEE_FLAG` 返回，覆盖池子默认手续费
4. 更新链上 EWMA（交易量指数加权移动平均），供后续 Swap 参考

```solidity
// 只读模拟（无 Gas，前端模拟模式调用）
function simulateFee(bytes32 poolId, uint256 amount, uint256 poolTotalValue)
    external view returns (uint24 fee, uint8 moodIndex, uint256 nextEwma)

// 读取当前池子 EWMA 和最近一次手续费
function getPoolState(bytes32 poolId)
    external view returns (uint256 ewma, uint24 lastFee, uint8 moodIndex)
```

**Hook 地址约束（Uniswap v4 要求）：**

Hook 合约地址必须满足：
```
uint160(hookAddress) & 0x3FFF == 0x0080   // 仅 BEFORE_SWAP_FLAG 位为 1
```
因此必须通过 CREATE2 部署，部署脚本会自动完成盐值挖矿。

---

### VibeSwapRouter（X Layer 主网）

实现 `IUnlockCallback`，对接真实 Uniswap v4 PoolManager。

```
用户调用：router.swap(amountIn, zeroForOne, poolTotalValue)
  │
  ├─ 将 poolTotalValue 编码进 hookData
  └─ poolManager.unlock(callbackData)
       │
       └─ unlockCallback()  ← PoolManager 回调
            ├─ poolManager.swap()        ← 触发 Hook.beforeSwap()
            ├─ _settle(tokenIn)          ← sync → transferFrom → settle
            └─ poolManager.take(tokenOut, 用户)
```

传给 Hook 的 `poolTotalValue` 在发起 Swap 时从链上读取 PoolManager 的实际代币余额——前端不依赖用户手动输入。

---

### DemoSwapRouter（本地 Hardhat）

基于 `MockPoolManager` 的简化路由器，仅用于本地开发，不实现 `IUnlockCallback`。

---

### VibeLiquidityHelper

部署时一次性调用的辅助合约，在 `unlockCallback` 内通过 `poolManager.modifyLiquidity()` 注入初始流动性，部署完成后不再使用。

---

## X Layer 主网合约地址

| 合约 | 地址 | 验证链接 |
|---|---|---|
| PoolManager（官方） | `0x360e68faccca8ca495c1b759fd9eee466db9fb32` | — |
| VolGuardHook | `0xd12Fd82cbBa717618c91952827fadaC13066C080` | [OKLink](https://www.oklink.com/xlayer/address/0xd12Fd82cbBa717618c91952827fadaC13066C080#code) · [Sourcify](https://repo.sourcify.dev/contracts/full_match/196/0xd12Fd82cbBa717618c91952827fadaC13066C080/) |
| MOOD Token | `0x76bfEF73EcD829F940CE385849F9177c0485B706` | [OKLink](https://www.oklink.com/xlayer/address/0x76bfEF73EcD829F940CE385849F9177c0485B706#code) |
| USDC Token | `0x7e826C03D6161385bbfa5eF93d59f81248Bff06a` | [OKLink](https://www.oklink.com/xlayer/address/0x7e826C03D6161385bbfa5eF93d59f81248Bff06a#code) |
| VibeSwapRouter | `0x54a5483726Ae8a0c56EE85870912A6F80743Fc9B` | [OKLink](https://www.oklink.com/xlayer/address/0x54a5483726Ae8a0c56EE85870912A6F80743Fc9B#code) · [Sourcify](https://repo.sourcify.dev/contracts/full_match/196/0x54a5483726Ae8a0c56EE85870912A6F80743Fc9B/) |
| VibeLiquidityHelper | `0xA4e386aF263B65E1684Bf98CE4d027E17e705511` | [OKLink](https://www.oklink.com/xlayer/address/0xA4e386aF263B65E1684Bf98CE4d027E17e705511#code) |

所有合约均已在 OKLink 和 Sourcify 双重验证。

---

## 本地开发

### 环境要求

- Node.js ≥ 18
- OKX 浏览器插件

### 安装依赖

```bash
git clone <repo-url>
cd UniSwapV4Demo
npm install
cd frontend && npm install && cd ..
```

### 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`：

```env
PRIVATE_KEY=你的部署者私钥

XLAYER_MAINNET_RPC=https://rpc.xlayer.tech
XLAYER_TESTNET_RPC=https://testrpc.xlayer.tech

# 仅合约验证时需要
XLAYER_API_KEY=你的OKLink API Key

# 仅部署到 X Layer 测试网时需要
XLAYER_TESTNET_POOL_MANAGER=
```

### 本地运行

```bash
# 终端 1 —— 启动 Hardhat 本地节点（局域网可访问 0.0.0.0:8545）
npm run node

# 终端 2 —— 部署合约到本地节点
npm run deploy:local

# 终端 3 —— 启动前端
cd frontend && npm run dev
```

打开 `http://localhost:5173`，MetaMask 连接 `localhost:8545`（chainId 31337）。

部署脚本会自动将合约地址写入 `frontend/src/constants/contracts.js`。

### 运行测试

```bash
npm test
```

---

## 部署到 X Layer 主网

### 1. 编译合约

```bash
npm run compile
```

### 2. 执行部署

```bash
npm run deploy:mainnet
```

脚本自动完成以下步骤：

1. 部署 MOOD 和 USDC 测试代币（`MockERC20`）
2. 挖掘满足 `addr & 0x3FFF == 0x0080` 的 CREATE2 盐值
3. 通过 Arachnid CREATE2 工厂（`0x4e59b44847b379578588920cA78FbF26c0B4956C`）部署 `VolGuardHook`
4. 调用 `PoolManager.initialize(poolKey, sqrtPriceX96)` 以 1:1 价格初始化池子
5. 部署 `VibeLiquidityHelper`，注入 500,000 MOOD + 500,000 USDC 初始流动性
6. 部署 `VibeSwapRouter`
7. 更新 `frontend/src/constants/contracts.js` 并保存 `deployments.json`

### 3. 验证合约源码

大陆网络需要开启 VPN。

```bash
# MOOD Token
npx hardhat verify --network xlayer_mainnet \
  0x76bfEF73EcD829F940CE385849F9177c0485B706 "Vibe MOOD" "MOOD"

# USDC Token
npx hardhat verify --network xlayer_mainnet \
  0x7e826C03D6161385bbfa5eF93d59f81248Bff06a "Vibe USDC" "USDC"

# VolGuardHook
npx hardhat verify --network xlayer_mainnet \
  <hookAddress> \
  <poolManagerAddress> <ownerAddress> \
  5000000000000000000000 50000000000000000000000 2000 30000 true

# VibeLiquidityHelper
npx hardhat verify --network xlayer_mainnet \
  <liqHelperAddress> <poolManagerAddress>

# VibeSwapRouter（构造参数含 tuple，使用参数文件）
npx hardhat verify --network xlayer_mainnet \
  --constructor-args scripts/args_router.js <routerAddress>
```

---

## Hook 地址挖矿原理

Uniswap v4 将 Hook 的回调权限编码在 Hook 地址的**低 14 位**中。只实现了 `beforeSwap` 的 Hook 地址必须满足：

```
uint160(hookAddress) & 0x3FFF == 0x0080   // 第 7 位 = BEFORE_SWAP_FLAG
```

`deploy.js` 在部署前自动完成挖矿（通常 < 15,000 次迭代，耗时数秒）。也可单独运行：

```bash
POOL_MANAGER_ADDRESS=0x360e... \
DEPLOYER_ADDRESS=0x你的地址 \
node scripts/mineHookAddress.js
```

---

## 前端架构

### 模拟 vs 真实执行

| 按钮 | 处理函数 | 执行路径 |
|---|---|---|
| Simulate（只读） | `handleSimulate` | `VolGuardHook.simulateFee()` — view 调用，零 Gas，使用**用户输入**的池子总价值 |
| Execute Swap（真实交易） | `handleExecute` | `VibeSwapRouter.swap()` — MetaMask 签名上链，使用**链上读取**的真实 TVL |

### 核心 Hook 说明

| Hook / 函数 | 职责 |
|---|---|
| `useVolGuard.js` | 调用 Hook 合约的 `simulateFee()` 和 `getPoolState()` |
| `useDemoSwap.js` | 管理余额、授权、链上 Swap 执行、池子 TVL 读取 |
| `fetchPoolTotalValue()` | 读取 `MOOD.balanceOf(pm) + USDC.balanceOf(pm)` 作为真实 TVL |

### 链路由规则

| Chain ID | 使用路由器 | 池子 TVL 来源 |
|---|---|---|
| 31337（Hardhat） | DemoSwapRouter | 绝对阈值模型（不传 hookData） |
| 195（X Layer 测试网） | VibeSwapRouter | `balanceOf(poolManager)` 链上读取 |
| 196（X Layer 主网） | VibeSwapRouter | `balanceOf(poolManager)` 链上读取 |

---

## npm 命令速查

| 命令 | 说明 |
|---|---|
| `npm run compile` | 编译全部 Solidity 合约 |
| `npm test` | 运行 Hardhat 测试套件 |
| `npm run node` | 启动 Hardhat 本地节点（监听 `0.0.0.0:8545`） |
| `npm run deploy:local` | 部署到本地 Hardhat |
| `npm run deploy:testnet` | 部署到 X Layer 测试网（chainId 195） |
| `npm run deploy:mainnet` | 部署到 X Layer 主网（chainId 196） |
| `npm run mine` | 独立运行 Hook 地址盐值挖矿工具 |
| `npm run clean` | 清除 Hardhat 缓存和编译产物 |

---

## 技术栈

| 层级 | 技术 |
|---|---|
| 智能合约 | Solidity 0.8.27，Uniswap v4 Core（`@uniswap/v4-core ^1.0.0`），EVM Cancun |
| 开发工具 | Hardhat `^2.22`，`@nomicfoundation/hardhat-toolbox ^5` |
| 前端 | React 18，Vite，ethers.js v6 |
| 钱包 | MetaMask（EIP-1193） |
| 网络 | X Layer 主网（196），X Layer 测试网（195），Hardhat 本地（31337） |
| 合约验证 | OKLink Etherscan，Sourcify |

---

## 未来计划

- 根据买卖方向区分不同风险状态和手续费策略
- 支持多个 Pool 独立配置风险参数（`setRiskConfig()`）
- 引入更精确的价格冲击估算（基于 Tick 数学）
- 将部分手续费收入路由至 LP 保护金库
- 支持集中流动性仓位
