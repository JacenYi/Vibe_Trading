import { useState, useCallback, useEffect } from "react";
import { ethers } from "ethers";
import { useWallet } from "../context/WalletContext.jsx";
import { CONTRACTS } from "../constants/contracts.js";
import { moodFromPips, feeToLabel } from "../constants/feeTiers.js";
import { classifyMood, getMoodMeta } from "../utils/moodCalculator.js";
import VolGuardHookAbi from "../abi/VolGuardHook.json";

/**
 * useVolGuard — 与已部署的 VolGuardHook 合约交互的自定义 Hook。
 *
 * 当钱包已连接且当前链有已知合约地址时，
 * simulateFee() 调用链上的 simulateFee() 视图函数。
 *
 * 当未连接钱包（演示模式）时，使用 JavaScript 版费率计算器
 * 在本地计算结果（与 Solidity 逻辑对应）。
 */
export function useVolGuard() {
  const { provider, chainId } = useWallet();

  const [contract,   setContract]   = useState(null);
  const [poolState,  setPoolState]  = useState({ ewma: "0", lastFee: 0, moodIndex: 0 });
  const [riskConfig, setRiskConfig] = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [txError,    setTxError]    = useState(null);

  // 当 provider + chainId 就绪时加载合约实例
  useEffect(() => {
    if (!provider || !chainId) {
      setContract(null);
      return;
    }
    const addresses = CONTRACTS[chainId];
    if (!addresses?.hookAddress || addresses.hookAddress === ethers.ZeroAddress) {
      setContract(null);
      return;
    }
    const c = new ethers.Contract(addresses.hookAddress, VolGuardHookAbi, provider);
    setContract(c);
  }, [provider, chainId]);

  // 从合约读取池状态
  const refreshPoolState = useCallback(async () => {
    if (!contract || !chainId) return;
    const demoPoolId = CONTRACTS[chainId]?.demoPoolId
      ?? "0x0000000000000000000000000000000000000000000000000000000000000000";
    try {
      const [ewma, lastFee, moodIndex] = await contract.getPoolState(demoPoolId);
      setPoolState({
        ewma:      ethers.formatEther(ewma),
        lastFee:   Number(lastFee),
        moodIndex: Number(moodIndex),
      });
      const cfg = await contract.riskConfig();
      setRiskConfig({
        mediumTradeThreshold:    ethers.formatEther(cfg.mediumTradeThreshold),
        whaleThreshold:          ethers.formatEther(cfg.whaleThreshold),
        ewmaWeightBps:           Number(cfg.ewmaWeightBps),
        volatilityMultiplierBps: Number(cfg.volatilityMultiplierBps),
      });
    } catch (err) {
      console.warn("无法加载池状态：", err.message);
    }
  }, [contract, chainId]);

  useEffect(() => {
    refreshPoolState();
  }, [refreshPoolState]);

  /**
   * 通过调用合约 simulateFee() 模拟某笔交易的手续费。
   * 若无合约连接则回退至本地计算。
   *
   * @param {number|string} amount         - 交易量（代币单位，非 wei）
   * @param {number|string} poolTotalValue - 池 TVL（传 0 使用绝对阈值模型）
   * @returns {{ fee: number, moodKey: string, feeLabel: string, nextEwma: string, source: string }}
   */
  const simulateFee = useCallback(
    async (amount, poolTotalValue = 0) => {
      setLoading(true);
      setTxError(null);
      try {
        if (contract) {
          const amountWei = ethers.parseEther(String(amount));
          const totalWei  = poolTotalValue > 0
            ? ethers.parseEther(String(poolTotalValue))
            : 0n;

          const demoPoolId = CONTRACTS[chainId]?.demoPoolId
            ?? "0x0000000000000000000000000000000000000000000000000000000000000000";
          const [fee, moodIndex, nextEwmaWei] = await contract.simulateFee(
            demoPoolId,
            amountWei,
            totalWei
          );

          const feeNum = Number(fee);
          return {
            fee:       feeNum,
            moodKey:   moodFromPips(feeNum),
            feeLabel:  feeToLabel(feeNum),
            nextEwma:  ethers.formatEther(nextEwmaWei),
            source:    "contract",
          };
        } else {
          // 演示模式：使用本地计算器（静态导入）
          const moodKey = classifyMood(Number(amount), "buy", Number(poolTotalValue));
          const meta    = getMoodMeta(moodKey);
          return {
            fee:      meta.fee,
            moodKey,
            feeLabel: meta.feeLabel,
            nextEwma: "0",
            source:   "demo",
          };
        }
      } catch (err) {
        setTxError(err.message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [contract, chainId]
  );

  return {
    contract,
    poolState,
    riskConfig,
    loading,
    txError,
    simulateFee,
    refreshPoolState,
    isContractConnected: !!contract,
  };
}
