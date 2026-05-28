# Vibe Trading

## Project Overview

**Vibe Trading** is a dynamic-fee AMM demo built with **Uniswap v4 Hooks**. The demo focuses on one core capability: a Hook can adjust the LP fee before every Swap based on how much the current trade impacts the Pool reserves.

The current version does not depend on external prices, oracles, market cap, or circulating supply. The Hook only uses Pool-level data: how large the current Swap is relative to the Pool reserves, and how much price impact it may create for LPs.

Small trades receive lower fees to improve trader experience. Large trades receive higher fees to compensate LPs for the price impact risk caused by large swaps.

## One-Line Pitch

Vibe Trading uses a Uniswap v4 `beforeSwap` Hook to dynamically adjust fees based on the current Swap's impact on Pool reserves.

## Core Mechanism

Before every Swap, the Hook reads:

- Current Swap size
- Current Pool reserves or total Pool value
- Trade size as a percentage of Pool reserves

The Hook then selects the corresponding Vibe state and fee:

| Vibe State | Fee | Meaning |
| --- | ---: | --- |
| Bullish | 0.05% | Small trade with very low Pool impact |
| Neutral | 0.30% | Normal trade with mild Pool impact |
| Defensive | 1.00% | Larger trade with meaningful price impact |
| Panic | 2.00% | Very large trade with high reserve impact |

## Why Uniswap v4

Uniswap v4 Hooks allow developers to inject custom logic into key Pool lifecycle events. Vibe Trading uses `beforeSwap` to decide the fee before the trade is executed.

```text
User starts a Swap
    |
    v
PoolManager calls Hook.beforeSwap()
    |
    |-- Hook reads current trade size and Pool reserves
    |-- Hook calculates trade size / Pool reserves
    |-- Hook selects the matching fee
    |-- Hook returns a dynamic fee override
    v
Pool executes the Swap with the new fee
```

This demonstrates the most direct value of Uniswap v4 Hooks: a Pool can dynamically change its fee before a trade based on its own liquidity state.

## Fee Logic

Vibe Trading currently uses a single Pool impact model. The core metric is:

```text
tradeImpactBps = tradeAmount * 10_000 / poolTotalValue
```

Where:

- `tradeAmount`: current Swap amount or trade value
- `poolTotalValue`: current Pool reserves or total Pool value
- `tradeImpactBps`: trade size as a percentage of Pool reserves, measured in bps
- `bps`: basis points, where `10_000 bps = 100%`

Fee rules:

```text
If tradeImpactBps >= 500  (5.00%)  -> Panic     -> 2.00%
If tradeImpactBps >= 100  (1.00%)  -> Defensive -> 1.00%
If tradeImpactBps >= 10   (0.10%)  -> Neutral   -> 0.30%
Otherwise                         -> Bullish   -> 0.05%
```

Example:

```text
Pool total value: 1,000,000
Swap amount:        5,000

tradeImpactBps = 5,000 * 10,000 / 1,000,000
               = 50 bps
               = 0.50%
```

This trade is `0.50%` of the Pool, so it enters `Neutral` and uses a `0.30%` fee.

## What This Demo Does Not Use

To keep the demo focused on Uniswap v4 Hook dynamic fees, the current version does not rely on:

- External prices
- Oracles
- Market cap
- Circulating supply
- Multi-model weighted scoring
- Complex volatility models

These can be future extensions, but they are not the core of this demo.

## Technical Implementation

The project includes smart contracts, tests, deployment scripts, and a frontend DApp.

### Smart Contracts

- `contracts/VolGuardHook.sol`: Main Hook contract that selects dynamic fees in `beforeSwap`
- `contracts/libraries/VolGuardFeeCalculator.sol`: Fee calculation library
- `contracts/base/VolGuardBaseHook.sol`: Hook access control and base wrapper
- `contracts/DemoSwapRouter.sol`: Demo swap flow
- `contracts/test/MockPoolManager.sol`: Mock PoolManager for tests

### Frontend

- React + Vite
- ethers.js v6
- MetaMask wallet connection
- Chinese and English UI
- Vibe simulator
- Hook decision panel
- Pool state panel
- Activity log

### Development and Deployment

- Solidity 0.8.27
- Hardhat
- Uniswap v4 Core
- EVM Cancun
- Local Hardhat network
- X Layer production configuration

### X Layer Mainnet Deployment

Vibe Trading has been deployed successfully on X Layer mainnet. The current demo uses `MOOD Token` and `USDC Token` as test tokens to demonstrate the Hook-based dynamic fee flow.

| Contract | Address | Notes |
| --- | --- | --- |
| PoolManager | `0x360e68faccca8ca495c1b759fd9eee466db9fb32` | Uniswap v4 PoolManager |
| VolGuardHook | `0xd12Fd82cbBa717618c91952827fadaC13066C080` | Dynamic fee Hook |
| MOOD Token | `0x76bfEF73EcD829F940CE385849F9177c0485B706` | Demo test token |
| USDC Token | `0x7e826C03D6161385bbfa5eF93d59f81248Bff06a` | Demo test token |
| VibeSwapRouter | `0x54a5483726Ae8a0c56EE85870912A6F80743Fc9B` | Demo swap router |
| VibeLiquidityHelper | `0xA4e386aF263B65E1684Bf98CE4d027E17e705511` | Demo liquidity helper contract |

## Demo Experience

Users can enter a Swap amount and Pool total value in the frontend. The app then shows:

- Current Vibe state
- Trade size / Pool value ratio
- Fee selected by the Hook
- Decision source: on-chain contract or local simulation
- Recent activity log
- Hook execution flow

When a wallet is connected and the user switches to a supported network, the frontend can interact with the deployed contract. Without a wallet, local simulation mode still demonstrates the core mechanism.

## Highlights

- Focuses on Uniswap v4 Hook dynamic fee capability
- Does not rely on external prices, oracles, market cap, or circulating supply
- Adjusts fees only from the current Swap's impact on Pool reserves
- Uses low fees for small trades to improve trader experience
- Uses higher fees for large trades to compensate LPs for price impact risk
- Provides a clear frontend demo of Hook decisions
- Modular smart contract design with test coverage

## Future Work

- Differentiate risk states by buy and sell direction
- Support independent risk configurations for multiple Pools
- Add more precise price impact estimation
- Route part of the fee revenue into an LP protection vault
- Complete integration with production Uniswap v4 Pools

## Summary

Vibe Trading shows the core capability of Uniswap v4 Hooks: a Pool can dynamically adjust fees before Swap execution based on the current trade's impact on its own reserves.

The demo is not about complex external data. It clearly proves that Hooks can turn a fixed-fee AMM into a programmable dynamic-fee system.
