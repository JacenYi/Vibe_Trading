import React from "react";
import { useI18n } from "../context/I18nContext.jsx";
import { formatAmount, shortHash } from "../utils/moodCalculator.js";

const MOOD_COLOR = {
  bull:      "var(--green)",
  neutral:   "var(--blue)",
  defensive: "var(--yellow)",
  panic:     "var(--red)",
};

const FEE_LABEL = { bull: "0.05%", neutral: "0.30%", defensive: "1.00%", panic: "2.00%" };
const FEE_PIPS  = { bull: 500,     neutral: 3000,     defensive: 10000,   panic: 20000   };

export default function ActivityLog({ activities }) {
  const { t } = useI18n();

  return (
    <div className="panel wide">
      <div className="panel-header">
        <h2 className="panel-title">{t("activity.title")}</h2>
        <span className="pill">{t("activity.pill")}</span>
      </div>
      <div className="panel-body">
        {activities.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 14 }}>{t("activity.empty")}</p>
        ) : (
          <div className="activity">
            {activities.map((item, i) => {
              const tokenIn  = item.direction === "buy" ? "USDC" : "MOOD";
              const tokenOut = item.direction === "buy" ? "MOOD" : "USDC";

              const feeLabel = item.feeLabel ?? FEE_LABEL[item.moodKey] ?? "–";
              const feePips  = item.fee      ?? FEE_PIPS[item.moodKey]  ?? 0;

              // amountOut / feeCharged：优先用链上事件值，否则按 pip 计算
              const amountOut  = item.amountOut != null
                ? Number(item.amountOut)
                : feePips > 0 ? item.amount * (1 - feePips / 1_000_000) : null;
              const feeCharged = item.feeCharged != null
                ? Number(item.feeCharged)
                : feePips > 0 ? item.amount * feePips / 1_000_000 : null;

              const moodColor = MOOD_COLOR[item.moodKey] ?? "var(--muted)";

              return (
                <div key={i} className="activity-item">
                  {/* 标题行：方向 + 情绪 + 来源 */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <strong style={{ fontSize: 14 }}>{t(`direction.${item.direction}`)}</strong>
                    <span style={{
                      fontSize: 11, borderRadius: 4, padding: "1px 8px", fontWeight: 700,
                      background: moodColor, color: "#000",
                    }}>
                      {t(`mood.${item.moodKey}`)}
                    </span>
                    {item.source === "contract" ? (
                      <span style={{ fontSize: 11, background: "var(--green)", color: "#000", borderRadius: 4, padding: "1px 6px", fontWeight: 600 }}>
                        {t("decision.sourceContract")}
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, background: "var(--surface)", color: "var(--muted)", borderRadius: 4, padding: "1px 6px" }}>
                        {t("decision.sourceDemo")}
                      </span>
                    )}
                  </div>

                  {/* 兑换金额行 */}
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
                    <span>{formatAmount(item.amount)} {tokenIn}</span>
                    <span style={{ color: "var(--muted)", margin: "0 8px" }}>→</span>
                    <span style={{ color: moodColor }}>
                      {amountOut != null ? formatAmount(amountOut) : "–"} {tokenOut}
                    </span>
                  </div>

                  {/* 费用明细行 */}
                  <div style={{ fontSize: 12, color: "var(--muted)", display: "flex", gap: 16, flexWrap: "wrap" }}>
                    <span>
                      {t("activity.feeRate")}
                      <strong style={{ color: "var(--text)", marginLeft: 4 }}>{feeLabel}</strong>
                    </span>
                    <span>
                      {t("activity.feeAmount")}
                      <strong style={{ color: "var(--text)", marginLeft: 4 }}>
                        {feeCharged != null ? formatAmount(feeCharged) : "–"} {tokenIn}
                      </strong>
                    </span>
                    {item.hash && (
                      <span>tx <span style={{ fontFamily: "monospace" }}>{shortHash(item.hash)}</span></span>
                    )}
                  </div>

                  {/* 完整 tx hash */}
                  {item.hash && (
                    <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4, wordBreak: "break-all", fontFamily: "monospace" }}>
                      {item.hash}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
