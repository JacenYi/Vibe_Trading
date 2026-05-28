import { useState, useCallback, useEffect } from "react";
import { ethers } from "ethers";
import { useWallet } from "../context/WalletContext.jsx";
import { CONTRACTS } from "../constants/contracts.js";
import MockERC20Abi       from "../abi/MockERC20.json";
import DemoSwapRouterAbi  from "../abi/DemoSwapRouter.json";
import VibeSwapRouterAbi  from "../abi/VibeSwapRouter.json";

const ERC20_BALANCE_ABI = ["function balanceOf(address) external view returns (uint256)"];

/**
 * useDemoSwap — 管理真实 Swap 的链上交互。
 *
 * 本地 Hardhat（chainId 31337）：使用 DemoSwapRouter（swap(amountIn, zeroForOne)）
 * X Layer 主网（chainId 196）：使用 VibeSwapRouter（swap(amountIn, zeroForOne, poolTotalValue)）
 */
export function useDemoSwap() {
  const { provider, signer, account, chainId } = useWallet();

  const [moodBalance,   setMoodBalance]   = useState("0");
  const [usdcBalance,   setUsdcBalance]   = useState("0");
  const [moodAllowance, setMoodAllowance] = useState("0");
  const [usdcAllowance, setUsdcAllowance] = useState("0");
  const [approving,     setApproving]     = useState(false);
  const [swapping,      setSwapping]      = useState(false);
  const [swapError,     setSwapError]     = useState(null);

  const cfg          = chainId ? CONTRACTS[chainId] : null;
  const hasContracts = !!(cfg?.routerAddress && cfg.routerAddress !== ethers.ZeroAddress);

  // X Layer 主网（196）和测试网（195）均使用 VibeSwapRouter
  const isVibeRouter = chainId === 196 || chainId === 195;

  // ─── 合约实例 ──────────────────────────────────────────────────────────────
  const getMoodContract = useCallback((withSigner = false) => {
    if (!cfg?.moodToken || !provider) return null;
    return new ethers.Contract(cfg.moodToken, MockERC20Abi, withSigner ? signer : provider);
  }, [cfg, provider, signer]);

  const getUsdcContract = useCallback((withSigner = false) => {
    if (!cfg?.usdcToken || !provider) return null;
    return new ethers.Contract(cfg.usdcToken, MockERC20Abi, withSigner ? signer : provider);
  }, [cfg, provider, signer]);

  const getRouterContract = useCallback((withSigner = false) => {
    if (!cfg?.routerAddress || !provider) return null;
    const abi = isVibeRouter ? VibeSwapRouterAbi : DemoSwapRouterAbi;
    return new ethers.Contract(cfg.routerAddress, abi, withSigner ? signer : provider);
  }, [cfg, provider, signer, isVibeRouter]);

  // ─── 从链上读取真实池 TVL（仅 VibeSwapRouter 使用）────────────────────────────
  // PoolManager 不直接暴露 getSlot0/getLiquidity（它们在 StateLibrary 里用 extsload 读）。
  // 改为读两个代币在 PoolManager 上的 balanceOf，1:1 Demo 池下两者之和即为 TVL。
  const fetchPoolTotalValue = useCallback(async () => {
    if (!cfg?.poolManagerAddress || !cfg?.moodToken || !cfg?.usdcToken || !provider) return 0n;
    try {
      const mood = new ethers.Contract(cfg.moodToken, ERC20_BALANCE_ABI, provider);
      const usdc = new ethers.Contract(cfg.usdcToken, ERC20_BALANCE_ABI, provider);
      const [moodBal, usdcBal] = await Promise.all([
        mood.balanceOf(cfg.poolManagerAddress),
        usdc.balanceOf(cfg.poolManagerAddress),
      ]);
      return moodBal + usdcBal; // 两种代币均 18 位精度、1:1 汇率，之和 = 池 TVL（wei）
    } catch (err) {
      console.warn("读取池 TVL 失败，Hook 将使用绝对阈值模型：", err.message);
      return 0n;
    }
  }, [cfg, provider]);

  // ─── 刷新余额和授权 ────────────────────────────────────────────────────────
  const refreshBalances = useCallback(async () => {
    if (!account || !hasContracts) return;
    try {
      const mood   = getMoodContract();
      const usdc   = getUsdcContract();
      const router = cfg.routerAddress;
      const [mb, ub, ma, ua] = await Promise.all([
        mood.balanceOf(account),
        usdc.balanceOf(account),
        mood.allowance(account, router),
        usdc.allowance(account, router),
      ]);
      setMoodBalance(ethers.formatEther(mb));
      setUsdcBalance(ethers.formatEther(ub));
      setMoodAllowance(ethers.formatEther(ma));
      setUsdcAllowance(ethers.formatEther(ua));
    } catch (err) {
      console.warn("刷新余额失败：", err.message);
    }
  }, [account, hasContracts, getMoodContract, getUsdcContract, cfg]);

  useEffect(() => { refreshBalances(); }, [refreshBalances]);

  // ─── 授权 ─────────────────────────────────────────────────────────────────
  const approveToken = useCallback(async (isMood, amount) => {
    if (!signer || !hasContracts) return;
    setApproving(true);
    setSwapError(null);
    try {
      const token = isMood ? getMoodContract(true) : getUsdcContract(true);
      await (await token.approve(cfg.routerAddress, ethers.MaxUint256)).wait();
      await refreshBalances();
    } catch (err) {
      setSwapError(err.message);
    } finally {
      setApproving(false);
    }
  }, [signer, hasContracts, getMoodContract, getUsdcContract, cfg, refreshBalances]);

  // ─── 执行真实 Swap ─────────────────────────────────────────────────────────
  /**
   * @param {number|string} amountIn    输入金额（以太单位）
   * @param {boolean}       isBuyMood   true = 买 MOOD；false = 卖 MOOD
   * @param {number|string} poolTotalValue  池总价值（仅 VibeSwapRouter 使用，传给 Hook 做比率判断）
   */
  const executeSwap = useCallback(async (amountIn, isBuyMood, poolTotalValue = 0) => {
    if (!signer || !hasContracts) return null;
    setSwapping(true);
    setSwapError(null);
    try {
      const router     = getRouterContract(true);
      const amtWei     = ethers.parseEther(String(amountIn));
      const moodIsT0   = cfg.moodIsToken0;
      const zeroForOne = isBuyMood ? !moodIsT0 : moodIsT0;

      let tx;
      let onchainTotalValue = 0n;
      if (isVibeRouter) {
        // 从链上读取真实池 TVL，忽略前端手动输入的 poolTotalValue
        onchainTotalValue = await fetchPoolTotalValue();
        tx = await router.swap(amtWei, zeroForOne, onchainTotalValue);
      } else {
        // DemoSwapRouter：swap(amountIn, zeroForOne)
        tx = await router.swap(amtWei, zeroForOne);
      }

      const receipt = await tx.wait();

      // 解析 Swapped 事件（两种路由器事件签名相同）
      const swappedEvent = receipt.logs
        .map((log) => { try { return router.interface.parseLog(log); } catch { return null; } })
        .find((e) => e?.name === "Swapped");

      let amountOut = 0n, fee = 0n, feeCharged = 0n;
      if (swappedEvent) {
        amountOut  = swappedEvent.args.amountOut;
        fee        = swappedEvent.args.fee;
        feeCharged = swappedEvent.args.feeCharged;
      }

      await refreshBalances();

      return {
        amountOut:      ethers.formatEther(amountOut),
        fee:            Number(fee),
        feeCharged:     ethers.formatEther(feeCharged),
        feeLabel:       `${(Number(fee) / 10000).toFixed(2)}%`,
        txHash:         receipt.hash,
        poolTotalValue: ethers.formatEther(onchainTotalValue), // 本次 swap 实际使用的链上 TVL
      };
    } catch (err) {
      setSwapError(err.reason ?? err.message);
      return null;
    } finally {
      setSwapping(false);
    }
  }, [signer, hasContracts, getRouterContract, cfg, isVibeRouter, fetchPoolTotalValue, refreshBalances]);

  return {
    hasContracts,
    moodBalance,
    usdcBalance,
    moodAllowance,
    usdcAllowance,
    approving,
    swapping,
    swapError,
    approveToken,
    executeSwap,
    refreshBalances,
    fetchPoolTotalValue,
    isVibeRouter,
  };
}
