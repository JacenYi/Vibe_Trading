import React, { useState, useCallback } from "react";
import { useI18n } from "../context/I18nContext.jsx";
import { useVolGuard } from "../hooks/useVolGuard.js";
import { useDemoSwap } from "../hooks/useDemoSwap.js";
import { parsePositiveNumber, formatAmount } from "../utils/moodCalculator.js";
import { moodFromPips } from "../constants/feeTiers.js";

const QUICK_CASES = [
  { key: "neutral",   direction: "buy",  amount: "50000",  poolValue: "10000000", pressure: "balanced" },
  { key: "bull",      direction: "buy",  amount: "5000",   poolValue: "10000000", pressure: "buy" },
  { key: "panic",     direction: "sell", amount: "80000",  poolValue: "1000000",  pressure: "sell" },
];

export default function MoodSimulator({ onResult, onExecute }) {
  const { t } = useI18n();
  const { simulateFee, loading, isContractConnected } = useVolGuard();
  const {
    hasContracts,
    moodBalance, usdcBalance,
    moodAllowance, usdcAllowance,
    approving, swapping, swapError,
    approveToken, executeSwap,
  } = useDemoSwap();

  const [direction,  setDirection]  = useState("buy");
  const [amount,     setAmount]     = useState("50000");
  const [poolValue,  setPoolValue]  = useState("10000000");
  const [pressure,   setPressure]   = useState("balanced");
  const [activeCase, setActiveCase] = useState("neutral");

  const isBuyMood = direction === "buy";
  const amt       = parsePositiveNumber(amount);

  // 判断用户当前方向需要哪个代币，以及其余额和授权
  const tokenInName     = isBuyMood ? "USDC" : "MOOD";
  const tokenInBalance  = isBuyMood ? usdcBalance  : moodBalance;
  const tokenInAllow    = isBuyMood ? usdcAllowance : moodAllowance;
  const needApprove     = hasContracts && amt > 0 && Number(tokenInAllow) < amt;
  const insufficientBal = hasContracts && amt > 0 && Number(tokenInBalance) < amt;

  const applyCase = useCallback((c) => {
    setDirection(c.direction);
    setAmount(c.amount);
    setPoolValue(c.poolValue);
    setPressure(c.pressure);
    setActiveCase(c.key);
  }, []);

  // ─── 模拟（只读，不产生交易）─────────────────────────────────────────────
  const handleSimulate = useCallback(async () => {
    const pv     = parsePositiveNumber(poolValue);
    const result = await simulateFee(amt, pv);
    if (result) {
      const feeCharged = amt * result.fee / 1_000_000;
      const amountOut  = amt - feeCharged;
      onResult({ ...result, direction, pressure, amount: amt, poolValue: pv,
                 hash: null, stage: "simulated", amountOut, feeCharged });
    }
  }, [amt, poolValue, direction, pressure, simulateFee, onResult]);

  // ─── 授权 ────────────────────────────────────────────────────────────────
  const handleApprove = useCallback(async () => {
    await approveToken(!isBuyMood, amount); // !isBuyMood → MOOD=true，isBuyMood→USDC=false
    // 注意：isBuyMood=true 时需授权 USDC(isMood=false)，反之授权 MOOD(isMood=true)
  }, [isBuyMood, amount, approveToken]);

  // ─── 执行真实 Swap ────────────────────────────────────────────────────────
  const handleExecute = useCallback(async () => {
    if (!hasContracts) {
      // 无合约时退化为模拟模式（演示用）
      const pv     = parsePositiveNumber(poolValue);
      const result = await simulateFee(amt, pv);
      if (result) {
        const feeCharged = amt * result.fee / 1_000_000;
        const amountOut  = amt - feeCharged;
        onExecute({ ...result, direction, pressure, amount: amt, poolValue: pv,
                    stage: "executed", amountOut, feeCharged });
      }
      return;
    }
    // 真实链上 Swap（VibeSwapRouter 需要 poolTotalValue 第三参数）
    const swapResult = await executeSwap(amt, isBuyMood, parsePositiveNumber(poolValue));
    if (swapResult) {
      onExecute({
        moodKey:   moodFromPips(swapResult.fee),
        fee:       swapResult.fee,
        feeLabel:  swapResult.feeLabel,
        nextEwma:  "0",
        source:    "contract",
        direction,
        pressure,
        amount:    amt,
        poolValue: parsePositiveNumber(poolValue),
        hash:      swapResult.txHash,
        amountOut: swapResult.amountOut,
        feeCharged:swapResult.feeCharged,
        stage:     "executed",
      });
    }
  }, [hasContracts, amt, poolValue, direction, pressure, isBuyMood,
      simulateFee, executeSwap, onExecute]);

  const busy = loading || swapping || approving;

  return (
    <div className="panel">
      <div className="panel-header">
        <h2 className="panel-title">{t("sim.title")}</h2>
      </div>
      <div className="panel-body simulator">

        {/* 代币余额（连接合约时显示） */}
        {hasContracts && (
          <div style={{ display: "flex", gap: 16, marginBottom: 8 }}>
            <span className="label">
              MOOD 余额：<strong style={{ color: "var(--green)" }}>{formatAmount(Number(moodBalance))}</strong>
            </span>
            <span className="label">
              USDC 余额：<strong style={{ color: "var(--blue)" }}>{formatAmount(Number(usdcBalance))}</strong>
            </span>
          </div>
        )}

        <label>
          <span className="label">{t("sim.direction")}</span>
          <select value={direction} onChange={(e) => { setDirection(e.target.value); setActiveCase(""); }}>
            <option value="buy">{t("direction.buy")}</option>
            <option value="sell">{t("direction.sell")}</option>
          </select>
        </label>

        <label>
          <span className="label">{t("sim.amount")}</span>
          <div className="amount-row">
            <input
              type="text" inputMode="decimal" value={amount}
              onChange={(e) => { setAmount(e.target.value); setActiveCase(""); }}
            />
            <div className="token-box">{tokenInName}</div>
          </div>
          {/* 余额不足提示 */}
          {hasContracts && insufficientBal && (
            <span style={{ color: "var(--red)", fontSize: 12 }}>
              ⚠ {tokenInName} 余额不足（当前：{formatAmount(Number(tokenInBalance))}）
            </span>
          )}
        </label>

        <label>
          <span className="label">{t("sim.poolValue")}</span>
          <div className="amount-row">
            <input
              type="text" inputMode="decimal" value={poolValue}
              onChange={(e) => { setPoolValue(e.target.value); setActiveCase(""); }}
            />
            <div className="token-box">USDC</div>
          </div>
        </label>

        <label>
          <span className="label">{t("sim.pressure")}</span>
          <select value={pressure} onChange={(e) => { setPressure(e.target.value); setActiveCase(""); }}>
            <option value="balanced">{t("pressure.balanced")}</option>
            <option value="buy">{t("pressure.buy")}</option>
            <option value="sell">{t("pressure.sell")}</option>
          </select>
        </label>

        <div className="case-row">
          {QUICK_CASES.map((c) => (
            <button key={c.key}
              className={`case-button${activeCase === c.key ? " active" : ""}`}
              onClick={() => applyCase(c)}
            >{t(`case.${c.key}`)}</button>
          ))}
        </div>

        <div className="actions">
          {/* 模拟：只读，不消耗代币 */}
          <button className="btn-primary" onClick={handleSimulate} disabled={busy}>
            {loading ? "..." : t("sim.simulate")}
          </button>

          {/* 执行区域 */}
          {hasContracts ? (
            needApprove ? (
              // 需要先授权
              <button
                className="btn-secondary"
                onClick={handleApprove}
                disabled={busy || insufficientBal}
                style={{ background: "var(--yellow)", color: "#000" }}
              >
                {approving ? t("sim.approving") : `${t("sim.approve")} ${tokenInName}`}
              </button>
            ) : (
              // 已授权，可执行真实 Swap
              <button
                className="btn-secondary"
                onClick={handleExecute}
                disabled={busy || insufficientBal}
                style={!insufficientBal ? { background: "var(--green)", color: "#000", fontWeight: 700 } : {}}
              >
                {swapping ? t("sim.executing") : t("sim.execute")}
              </button>
            )
          ) : (
            // 无合约：退化为演示执行
            <button className="btn-secondary" onClick={handleExecute} disabled={busy}>
              {loading ? "..." : t("sim.execute")}
            </button>
          )}
        </div>

        {/* 状态提示 */}
        {hasContracts && !needApprove && !insufficientBal && (
          <p className="wallet-note" style={{ color: "var(--green)" }}>
            ✅ {t("sim.contractReady")}
          </p>
        )}
        {!isContractConnected && (
          <p className="wallet-note">{t("sim.walletNote")}</p>
        )}
        {swapError && (
          <p className="wallet-note" style={{ color: "var(--red)" }}>
            ⚠ {swapError}
          </p>
        )}
      </div>
    </div>
  );
}
