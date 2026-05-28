# Vibe Trading

> A Uniswap v4 Hook demo that dynamically adjusts LP fees based on each trade's impact on pool reserves.

[中文文档](./README_CN.md)

---

[Project Introduction](./VIBE_TRADING_EN.md)

---

## Overview

**Vibe Trading** is a dynamic-fee AMM demo built on **Uniswap v4 Hooks**. The core idea: before every Swap, the Hook measures how large the trade is relative to the pool's total reserves and selects a fee tier accordingly.

- Small trades → low fee (0.05%) — better UX for retail
- Large trades → high fee (2.00%) — compensates LPs for price impact

No external oracles, no price feeds, no market-cap data. The Hook only reads on-chain pool state.

---

## Fee Logic

```
tradeImpactBps = tradeAmount × 10,000 / poolTotalValue
```

| Impact | Vibe State | Fee    |
|--------|-----------|--------|
| ≥ 5%   | Panic     | 2.00%  |
| ≥ 1%   | Defensive | 1.00%  |
| ≥ 0.1% | Neutral   | 0.30%  |
| < 0.1% | Bullish   | 0.05%  |

---

## Architecture

```
UniSwapV4Demo/
├── contracts/
│   ├── VolGuardHook.sol              # Main Hook — selects fee in beforeSwap
│   ├── VibeSwapRouter.sol            # Production router (X Layer) — IUnlockCallback
│   ├── DemoSwapRouter.sol            # Local demo router (Hardhat)
│   ├── VibeLiquidityHelper.sol       # One-time liquidity seeder for deploy
│   ├── base/
│   │   └── VolGuardBaseHook.sol      # Hook permission bits + base wrapper
│   ├── libraries/
│   │   └── VolGuardFeeCalculator.sol # Pure fee calculation logic (ratio + EWMA)
│   └── test/
│       ├── MockPoolManager.sol       # Minimal PoolManager mock for local tests
│       └── MockERC20.sol             # Mintable ERC20 for test tokens
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── MoodSimulator.jsx     # Swap input + simulate/execute buttons
│   │   │   ├── ActivityLog.jsx       # Recent swap history with fee details
│   │   │   └── ...
│   │   ├── hooks/
│   │   │   ├── useDemoSwap.js        # On-chain swap, balance, approval management
│   │   │   └── useVolGuard.js        # Hook contract reads + fee simulation
│   │   ├── constants/
│   │   │   └── contracts.js          # Auto-generated contract addresses per chain
│   │   └── abi/
│   │       ├── VolGuardHook.json
│   │       ├── VibeSwapRouter.json
│   │       └── DemoSwapRouter.json
├── scripts/
│   ├── deploy.js                     # Full deploy script (local + X Layer mainnet)
│   ├── mineHookAddress.js            # Standalone CREATE2 salt miner
│   └── args_router.js                # Constructor args file for VibeSwapRouter verify
└── test/
    ├── VolGuardHook.test.js
    ├── VolGuardFeeCalculator.test.js
    └── helpers/poolHelpers.js
```

---

## Contract Design

### VolGuardHook

The core Hook implementing `beforeSwap`. The pool must be initialized with `DYNAMIC_FEE_FLAG (0x800000)`.

**Key flow:**
1. PoolManager calls `beforeSwap` before every swap
2. Hook decodes `hookData` — if ≥ 32 bytes, it contains `poolTotalValue` and activates the ratio model; otherwise falls back to absolute thresholds
3. Fee is selected and returned with `OVERRIDE_FEE_FLAG` to override the pool's default fee
4. EWMA of trade volume is updated in storage for future swaps

```solidity
// Read-only fee simulation (no gas, used by frontend)
function simulateFee(bytes32 poolId, uint256 amount, uint256 poolTotalValue)
    external view returns (uint24 fee, uint8 moodIndex, uint256 nextEwma)

// Read current pool EWMA and last applied fee
function getPoolState(bytes32 poolId)
    external view returns (uint256 ewma, uint24 lastFee, uint8 moodIndex)
```

**Hook address constraint (Uniswap v4 requirement):**

The hook contract address must satisfy:
```
uint160(hookAddress) & 0x3FFF == 0x0080   // only BEFORE_SWAP_FLAG set
```
This requires CREATE2 deployment with a mined salt — the deploy script handles this automatically.

---

### VibeSwapRouter (X Layer mainnet)

Implements `IUnlockCallback` to interact with the real Uniswap v4 PoolManager.

```
user calls: router.swap(amountIn, zeroForOne, poolTotalValue)
  │
  ├─ encode poolTotalValue into hookData
  └─ poolManager.unlock(callbackData)
       │
       └─ unlockCallback()  ← called by PoolManager
            ├─ poolManager.swap()       ← triggers Hook.beforeSwap()
            ├─ _settle(tokenIn)         ← sync → transferFrom → settle
            └─ poolManager.take(tokenOut, user)
```

`poolTotalValue` passed to the Hook is read from actual ERC20 balances of the PoolManager at swap time — not from user input.

---

### DemoSwapRouter (Hardhat local)

Simplified router backed by `MockPoolManager`. Used only in local development. Does not implement `IUnlockCallback`.

---

### VibeLiquidityHelper

One-time deploy-time contract that seeds initial liquidity via `poolManager.modifyLiquidity()` inside an `unlockCallback`. Not needed after deployment.

---

## X Layer Mainnet Deployment

| Contract | Address | Verified |
|---|---|---|
| PoolManager (official) | `0x360e68faccca8ca495c1b759fd9eee466db9fb32` | — |
| VolGuardHook | `0xd12Fd82cbBa717618c91952827fadaC13066C080` | [OKLink](https://www.oklink.com/xlayer/address/0xd12Fd82cbBa717618c91952827fadaC13066C080#code) · [Sourcify](https://repo.sourcify.dev/contracts/full_match/196/0xd12Fd82cbBa717618c91952827fadaC13066C080/) |
| MOOD Token | `0x76bfEF73EcD829F940CE385849F9177c0485B706` | [OKLink](https://www.oklink.com/xlayer/address/0x76bfEF73EcD829F940CE385849F9177c0485B706#code) |
| USDC Token | `0x7e826C03D6161385bbfa5eF93d59f81248Bff06a` | [OKLink](https://www.oklink.com/xlayer/address/0x7e826C03D6161385bbfa5eF93d59f81248Bff06a#code) |
| VibeSwapRouter | `0x54a5483726Ae8a0c56EE85870912A6F80743Fc9B` | [OKLink](https://www.oklink.com/xlayer/address/0x54a5483726Ae8a0c56EE85870912A6F80743Fc9B#code) · [Sourcify](https://repo.sourcify.dev/contracts/full_match/196/0x54a5483726Ae8a0c56EE85870912A6F80743Fc9B/) |
| VibeLiquidityHelper | `0xA4e386aF263B65E1684Bf98CE4d027E17e705511` | [OKLink](https://www.oklink.com/xlayer/address/0xA4e386aF263B65E1684Bf98CE4d027E17e705511#code) |

---

## Local Development

### Prerequisites

- Node.js ≥ 18
- OKX browser extension

### Install

```bash
git clone <repo-url>
cd UniSwapV4Demo
npm install
cd frontend && npm install && cd ..
```

### Environment setup

```bash
cp .env.example .env
```

Edit `.env`:

```env
PRIVATE_KEY=your_deployer_private_key

XLAYER_MAINNET_RPC=https://rpc.xlayer.tech
XLAYER_TESTNET_RPC=https://testrpc.xlayer.tech

# Required only for contract verification
XLAYER_API_KEY=your_oklink_api_key

# Required only if deploying to X Layer testnet
XLAYER_TESTNET_POOL_MANAGER=
```

### Run locally

```bash
# Terminal 1 — Hardhat node (accessible on LAN at 0.0.0.0:8545)
npm run node

# Terminal 2 — deploy to local node
npm run deploy:local

# Terminal 3 — frontend dev server
cd frontend && npm run dev
```

Open `http://localhost:5173`. Connect MetaMask to `localhost:8545` (chainId 31337).

The deploy script writes contract addresses to `frontend/src/constants/contracts.js` automatically.

### Run tests

```bash
npm test
```

---

## Deploy to X Layer Mainnet

### 1. Compile contracts

```bash
npm run compile
```

### 2. Deploy

```bash
npm run deploy:mainnet
```

The script runs these steps automatically:

1. Deploy `MockERC20` for MOOD and USDC test tokens
2. Mine CREATE2 salt satisfying `addr & 0x3FFF == 0x0080`
3. Deploy `VolGuardHook` via Arachnid CREATE2 factory (`0x4e59b44847b379578588920cA78FbF26c0B4956C`)
4. Call `PoolManager.initialize(poolKey, sqrtPriceX96)` at 1:1 price
5. Deploy `VibeLiquidityHelper`, seed 500,000 MOOD + 500,000 USDC as liquidity
6. Deploy `VibeSwapRouter` with the pool key
7. Update `frontend/src/constants/contracts.js` and save `deployments.json`

### 3. Verify contracts

Requires VPN if connecting from mainland China.

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

# VibeSwapRouter (tuple constructor arg — uses args file)
npx hardhat verify --network xlayer_mainnet \
  --constructor-args scripts/args_router.js <routerAddress>
```

---

## How the Hook Address Is Mined

Uniswap v4 encodes hook permissions in the **lower 14 bits** of the hook address. A hook implementing only `beforeSwap` must satisfy:

```
uint160(hookAddress) & 0x3FFF == 0x0080   (bit 7 = BEFORE_SWAP_FLAG)
```

`deploy.js` mines this inline before deployment. To run standalone:

```bash
POOL_MANAGER_ADDRESS=0x360e... \
DEPLOYER_ADDRESS=0xYour... \
node scripts/mineHookAddress.js
```

Typical iteration count: < 15,000. Takes a few seconds on a modern CPU.

---

## Frontend Architecture

### Simulate vs Execute

| Button | Handler | Path |
|---|---|---|
| Simulate (read-only) | `handleSimulate` | `VolGuardHook.simulateFee()` — view call, zero gas — uses **user-input** pool value |
| Execute Swap (real tx) | `handleExecute` | `VibeSwapRouter.swap()` — MetaMask tx — uses **on-chain** pool TVL from `token.balanceOf(poolManager)` |

### Key hooks

| Hook | Responsibility |
|---|---|
| `useVolGuard.js` | Calls `simulateFee()` and `getPoolState()` on the Hook contract |
| `useDemoSwap.js` | Balances, approvals, swap execution, pool TVL fetch |
| `fetchPoolTotalValue()` | Reads `MOOD.balanceOf(pm) + USDC.balanceOf(pm)` for real TVL |

### Chain routing

| Chain ID | Router Used | Pool TVL Source |
|---|---|---|
| 31337 (Hardhat) | DemoSwapRouter | absolute threshold model (no hookData) |
| 195 (X Layer testnet) | VibeSwapRouter | `balanceOf(poolManager)` |
| 196 (X Layer mainnet) | VibeSwapRouter | `balanceOf(poolManager)` |

---

## npm Scripts Reference

| Command | Description |
|---|---|
| `npm run compile` | Compile all Solidity contracts |
| `npm test` | Run Hardhat test suite |
| `npm run node` | Start Hardhat node on `0.0.0.0:8545` |
| `npm run deploy:local` | Deploy to local Hardhat |
| `npm run deploy:testnet` | Deploy to X Layer testnet (chainId 195) |
| `npm run deploy:mainnet` | Deploy to X Layer mainnet (chainId 196) |
| `npm run mine` | Run standalone Hook address salt miner |
| `npm run clean` | Clear Hardhat cache and artifacts |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart contracts | Solidity 0.8.27, Uniswap v4 Core (`@uniswap/v4-core ^1.0.0`), EVM Cancun |
| Development | Hardhat `^2.22`, `@nomicfoundation/hardhat-toolbox ^5` |
| Frontend | React 18, Vite, ethers.js v6 |
| Wallet | MetaMask (EIP-1193) |
| Networks | X Layer mainnet (196), X Layer testnet (195), Hardhat local (31337) |
| Verification | OKLink Etherscan, Sourcify |

---

## Future Work

- Differentiate fee by trade direction (buy vs sell pressure)
- Per-pool independent risk config via `setRiskConfig()`
- More precise price impact estimation using tick math
- Route part of fee revenue to an LP protection vault
- Concentrated liquidity position support
