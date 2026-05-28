# Vibe Trading

## 项目简介

**Vibe Trading** 是一个基于 **Uniswap v4 Hook** 的动态手续费 AMM Demo。这个 Demo 聚焦一个核心能力：Hook 可以在每次 Swap 执行前，根据当前交易对 Pool 储备的冲击程度，动态调整手续费。

当前版本暂时不依赖外部价格、Oracle、市值或流通量。Hook 只关注当前 Pool 内部的数据：这笔 Swap 相对 Pool 储备有多大、会给 LP 带来多明显的价格冲击。

小额交易使用低费率，降低用户交易成本；大额交易使用高费率，为 LP 提供更高补偿，从而保护 LP 免受大额交易带来的价格冲击。

## 一句话介绍

Vibe Trading 使用 Uniswap v4 `beforeSwap` Hook，根据当前 Swap 对 Pool 储备的冲击程度动态调整手续费。

## 核心机制

每次 Swap 前，Hook 会读取：

- 当前 Swap 的交易量
- 当前 Pool 的总储备或总价值
- 交易量占 Pool 储备的比例

然后 Hook 根据交易冲击程度选择手续费：

| Vibe 状态 | 手续费 | 含义 |
| --- | ---: | --- |
| Bullish | 0.05% | 小额交易，对 Pool 冲击很低 |
| Neutral | 0.30% | 正常交易，对 Pool 有轻微冲击 |
| Defensive | 1.00% | 较大交易，可能带来明显价格冲击 |
| Panic | 2.00% | 超大交易，对 Pool 储备冲击很高 |

## 为什么选择 Uniswap v4

Uniswap v4 的 Hook 允许开发者在 Pool 操作的关键生命周期节点插入自定义逻辑。Vibe Trading 使用 `beforeSwap`，在交易执行前完成手续费判断。

```text
用户发起 Swap
    |
    v
PoolManager 调用 Hook.beforeSwap()
    |
    |-- Hook 读取当前交易量和 Pool 储备
    |-- Hook 计算交易量 / Pool 储备比例
    |-- Hook 选择对应手续费
    |-- Hook 返回动态手续费覆盖
    v
Pool 使用新的手续费执行 Swap
```

这展示了 Uniswap v4 Hook 最直接的价值：让 Pool 可以在交易发生前根据自身流动性状态动态改变手续费。

## 手续费计算逻辑

Vibe Trading 当前使用单一的 Pool 冲击模型。核心指标是：

```text
tradeImpactBps = tradeAmount * 10_000 / poolTotalValue
```

其中：

- `tradeAmount`：当前 Swap 的交易量或交易价值
- `poolTotalValue`：当前 Pool 的总储备或总价值
- `tradeImpactBps`：交易量占 Pool 储备的比例，单位是 bps
- `bps`：基点，`10_000 bps = 100%`

手续费规则：

```text
若 tradeImpactBps >= 500  (5.00%)  -> Panic     -> 2.00%
若 tradeImpactBps >= 100  (1.00%)  -> Defensive -> 1.00%
若 tradeImpactBps >= 10   (0.10%)  -> Neutral   -> 0.30%
否则                              -> Bullish   -> 0.05%
```

示例：

```text
Pool 总价值：1,000,000
Swap 金额：  5,000

tradeImpactBps = 5,000 * 10,000 / 1,000,000
               = 50 bps
               = 0.50%
```

这笔交易占 Pool 的 `0.50%`，进入 `Neutral`，手续费为 `0.30%`。

## 当前不做什么

为了让 Demo 聚焦 Uniswap v4 Hook 的动态手续费能力，当前版本暂时不依赖：

- 外部价格
- Oracle
- 市值
- 流通量
- 多模型加权评分
- 复杂波动率模型

这些能力可以作为后续扩展，但不是当前 Demo 的核心。

## 技术实现

项目包含合约、测试、部署脚本和前端 DApp。

### 智能合约

- `contracts/VolGuardHook.sol`：主 Hook 合约，在 `beforeSwap` 中选择动态手续费
- `contracts/libraries/VolGuardFeeCalculator.sol`：手续费计算库
- `contracts/base/VolGuardBaseHook.sol`：Hook 权限控制和基础封装
- `contracts/DemoSwapRouter.sol`：演示 Swap 流程
- `contracts/test/MockPoolManager.sol`：测试环境下的 PoolManager 模拟合约

### 前端

- React + Vite
- ethers.js v6
- MetaMask 钱包连接
- 中英文界面
- Vibe 模拟器
- Hook 决策结果展示
- Pool 状态展示
- 活动日志

### 开发与部署

- Solidity 0.8.27
- Hardhat
- Uniswap v4 Core
- EVM Cancun
- 本地 Hardhat 网络
- X Layer 生产环境配置

### X Layer 主网部署

Vibe Trading 已完成 X Layer 主网部署。当前 Demo 使用 `MOOD Token` 和 `USDC Token` 作为测试用代币，用于展示 Hook 动态手续费流程。

| 合约 | 地址 | 说明 |
| --- | --- | --- |
| PoolManager | `0x360e68faccca8ca495c1b759fd9eee466db9fb32` | Uniswap v4 PoolManager |
| VolGuardHook | `0xd12Fd82cbBa717618c91952827fadaC13066C080` | 动态手续费 Hook |
| MOOD Token | `0x76bfEF73EcD829F940CE385849F9177c0485B706` | Demo 测试用代币 |
| USDC Token | `0x7e826C03D6161385bbfa5eF93d59f81248Bff06a` | Demo 测试用代币 |
| VibeSwapRouter | `0x54a5483726Ae8a0c56EE85870912A6F80743Fc9B` | Demo Swap 路由 |
| VibeLiquidityHelper | `0xA4e386aF263B65E1684Bf98CE4d027E17e705511` | Demo 流动性辅助合约 |

## Demo 体验

用户可以在前端输入 Swap 金额和 Pool 总价值，系统会实时展示：

- 当前 Vibe 状态
- 交易量 / Pool 总价值比例
- Hook 选择的手续费
- Hook 决策来源：链上合约或本地模拟
- 最近活动记录
- Hook 执行流程

连接钱包并切换到支持网络后，前端可以调用链上合约进行真实交互；未连接钱包时，也可以使用本地模拟模式体验核心机制。

## 项目亮点

- 聚焦 Uniswap v4 Hook 的动态手续费能力
- 不依赖外部价格、Oracle、市值或流通量
- 只根据当前 Swap 对 Pool 储备的冲击程度调费
- 小额交易低费率，提升用户体验
- 大额交易高费率，补偿 LP 承担的价格冲击风险
- 前端清晰展示 Hook 决策过程，适合黑客松现场 Demo
- 合约逻辑模块化，测试覆盖完整

## 未来方向

- 根据买卖方向区分不同风险状态
- 支持多 Pool 独立参数配置
- 引入更精细的价格冲击估算
- 将部分手续费收入分配给 LP 保护金库
- 与真实 Uniswap v4 Pool 完整集成部署

## 总结

Vibe Trading 展示了 Uniswap v4 Hook 的核心能力：Pool 可以在 Swap 执行前根据当前交易对自身储备的冲击程度动态调整手续费。

这个 Demo 的重点不是复杂外部数据，而是清晰证明 Hook 能让 AMM 从固定手续费变成可编程的动态手续费系统。
