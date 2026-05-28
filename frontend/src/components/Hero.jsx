import React from "react";
import { useI18n } from "../context/I18nContext.jsx";
import { useWallet } from "../context/WalletContext.jsx";
import { HARDHAT_LOCAL, XLAYER_TESTNET } from "../constants/chains.js";

export default function Hero({ moodKey }) {
  const { t, toggleLocale } = useI18n();
  const {
    account, chainId, currentChain, hasContract, error,
    connect, disconnect, switchToLocalNode, switchToXLayer,
  } = useWallet();

  const moodLabel  = t(`mood.${moodKey}`);
  const shortAddr  = account ? `${account.slice(0, 6)}...${account.slice(-4)}` : null;

  // 判断网络状态
  const isLocalChain   = chainId === HARDHAT_LOCAL.chainId;
  const isXLayerChain  = chainId === XLAYER_TESTNET.chainId || chainId === 196;
  const isWrongNetwork = account && !hasContract;

  return (
    <section className="hero">
      <div>
        <div className="eyebrow">Vibe Trading</div>
        <h1>{t("hero.title")}</h1>
        <p className="subtitle">{t("hero.subtitle")}</p>
      </div>

      <div className="status-card">
        <div className="status-top">
          {/* 网络状态标签 */}
          {account ? (
            hasContract ? (
              <span className="pill" style={{ background: "var(--green)", color: "#000" }}>
                ✓ {currentChain?.name ?? "已连接"} · {t("hero.contractMode")}
              </span>
            ) : (
              <span className="pill" style={{ background: "var(--red)", color: "#fff" }}>
                ⚠ {currentChain?.name ?? `Chain ${chainId}`} · {t("hero.wrongNetwork")}
              </span>
            )
          ) : (
            <span className="pill">{t("hero.demoMode")}</span>
          )}

          <button className="language-toggle" type="button" onClick={toggleLocale}>
            {t("languageToggle")}
          </button>
        </div>

        <strong id="heroMood">{moodLabel} Pool</strong>
        <p className="copy">{t(`hero.${moodKey}`)}</p>

        {/* 钱包连接 / 断开按钮 */}
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          {account ? (
            <button className="btn-wallet" onClick={disconnect}>
              {shortAddr} · {t("hero.disconnect")}
            </button>
          ) : (
            <button className="btn-wallet" onClick={connect}>
              {t("hero.connect")}
            </button>
          )}

          {/* 网络错误时显示切换按钮 */}
          {isWrongNetwork && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                className="btn-wallet"
                style={{ background: "var(--green)", color: "#000", fontWeight: 700 }}
                onClick={switchToLocalNode}
              >
                {t("hero.switchLocal")}
              </button>
              <button
                className="btn-wallet"
                style={{ background: "var(--blue)", color: "#fff" }}
                onClick={() => switchToXLayer(true)}
              >
                {t("hero.switchXLayer")}
              </button>
            </div>
          )}

          {error && (
            <p style={{ color: "var(--red)", fontSize: 12, margin: 0 }}>{error}</p>
          )}
        </div>
      </div>
    </section>
  );
}
