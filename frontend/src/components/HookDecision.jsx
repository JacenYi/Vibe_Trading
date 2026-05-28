import React from "react";
import { useI18n } from "../context/I18nContext.jsx";
import { getMoodMeta, formatRatio, tradeRatioPercent } from "../utils/moodCalculator.js";

export default function HookDecision({ result, stage }) {
  const { t } = useI18n();

  const moodKey   = result?.moodKey  ?? "neutral";
  const amount    = result?.amount   ?? 0;
  const poolVal   = result?.poolValue ?? 0;
  const source    = result?.source;   // "contract" | "demo" | undefined
  const meta      = getMoodMeta(moodKey);
  const ratio     = tradeRatioPercent(amount, poolVal);
  const stagePill = t(`stage.${stage ?? "ready"}`);

  // 数据来源标签样式
  const sourceStyle = source === "contract"
    ? { background: "var(--green)", color: "#000", fontWeight: 700 }
    : source === "demo"
    ? { background: "var(--panel-3)", color: "var(--muted)" }
    : {};

  return (
    <div className="panel">
      <div className="panel-header">
        <h2 className="panel-title">{t("decision.title")}</h2>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {source && (
            <span className="pill" style={sourceStyle}>
              {source === "contract" ? t("decision.sourceContract") : t("decision.sourceDemo")}
            </span>
          )}
          <span className="pill">{stagePill}</span>
        </div>
      </div>
      <div className="panel-body">
        <div className="result">
          <div className={`metric mood-${moodKey}`}>
            <span className="label">{t("decision.mood")}</span>
            <strong>{t(`mood.${moodKey}`)}</strong>
          </div>
          <div className="metric">
            <span className="label">{t("decision.ratio")}</span>
            <strong>{poolVal > 0 ? formatRatio(ratio) : "–"}</strong>
          </div>
          <div className="metric">
            <span className="label">{t("decision.fee")}</span>
            <strong>{t(`fee.${moodKey}`)}</strong>
          </div>
          <div className="metric">
            <span className="label">{t("decision.rule")}</span>
            <strong>{t(`rule.${moodKey}`)}</strong>
          </div>
        </div>

        <p className="decision-text">{t(`explain.${moodKey}`)}</p>

        <div className="mood-meter" aria-label="Mood intensity">
          <div
            className="mood-fill"
            style={{ width: `${meta.meter}%`, background: meta.color }}
          />
        </div>
      </div>
    </div>
  );
}
