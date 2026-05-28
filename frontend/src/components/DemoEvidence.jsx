import React from "react";
import { useI18n } from "../context/I18nContext.jsx";
import { useWallet } from "../context/WalletContext.jsx";
import { CONTRACTS } from "../constants/contracts.js";

export default function DemoEvidence() {
  const { t } = useI18n();
  const { chainId, currentChain } = useWallet();

  const contractAddress = chainId && CONTRACTS[chainId]?.hookAddress;
  const networkName     = currentChain?.name ?? t("evidence.xlayer");

  return (
    <div className="panel">
      <div className="panel-header">
        <h2 className="panel-title">{t("evidence.title")}</h2>
      </div>
      <div className="panel-body">
        <div className="pool-grid">
          <div className="info-box">
            <span className="label">{t("evidence.function")}</span>
            <span className="value">beforeSwap()</span>
          </div>
          <div className="info-box">
            <span className="label">{t("evidence.model")}</span>
            <span className="value">{t("evidence.stateMachine")}</span>
          </div>
          <div className="info-box">
            <span className="label">{t("evidence.execution")}</span>
            <span className="value">{t("evidence.frontend")}</span>
          </div>
          <div className="info-box">
            <span className="label">{t("evidence.deploy")}</span>
            <span className="value" style={{ fontSize: 13 }}>{networkName}</span>
          </div>
        </div>

        {contractAddress && contractAddress !== "0x0000000000000000000000000000000000000000" && (
          <div className="info-box" style={{ marginTop: 12 }}>
            <span className="label">Hook Address</span>
            <span className="tx" style={{ fontSize: 12 }}>{contractAddress}</span>
          </div>
        )}
      </div>
    </div>
  );
}
