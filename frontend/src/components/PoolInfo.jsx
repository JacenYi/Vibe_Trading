import React from "react";
import { useI18n } from "../context/I18nContext.jsx";
import { useWallet } from "../context/WalletContext.jsx";
import { feeToLabel } from "../constants/feeTiers.js";

export default function PoolInfo({ moodKey, poolState }) {
  const { t } = useI18n();
  const { currentChain } = useWallet();

  const networkName = currentChain?.name ?? "X Layer Testnet";
  const ewmaDisplay = poolState?.ewma ? `${Number(poolState.ewma).toLocaleString()} tokens` : "–";
  const feeDisplay  = poolState?.lastFee ? feeToLabel(poolState.lastFee) : "–";

  return (
    <div className="panel">
      <div className="panel-header">
        <h2 className="panel-title">{t("pool.title")}</h2>
      </div>
      <div className="panel-body">
        <div className="pool-grid">
          <div className="info-box">
            <span className="label">{t("pool.pair")}</span>
            <span className="value">MOOD / USDC</span>
          </div>
          <div className="info-box">
            <span className="label">{t("pool.network")}</span>
            <span className="value">{networkName}</span>
          </div>
          <div className="info-box">
            <span className="label">{t("pool.hook")}</span>
            <span className="value">VolGuardHook</span>
          </div>
          <div className="info-box">
            <span className="label">{t("pool.status")}</span>
            <span className="value">{t(`mood.${moodKey}`)}</span>
          </div>
          <div className="info-box">
            <span className="label">{t("pool.ewma")}</span>
            <span className="value" style={{ fontSize: 13 }}>{ewmaDisplay}</span>
          </div>
          <div className="info-box">
            <span className="label">{t("pool.lastFee")}</span>
            <span className="value">{feeDisplay}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
