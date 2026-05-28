import React from "react";
import { useI18n } from "../context/I18nContext.jsx";

const STATES = ["bull", "neutral", "defensive", "panic"];

export default function MoodStates({ activeMood }) {
  const { t } = useI18n();

  return (
    <div className="panel">
      <div className="panel-header">
        <h2 className="panel-title">{t("states.title")}</h2>
      </div>
      <div className="panel-body">
        <div className="state-grid">
          {STATES.map((key) => {
            const isActive = key === activeMood;
            return (
              <div
                key={key}
                className={`state-card state-${key}${isActive ? " active" : ""}`}
              >
                <span className="label">{t(`states.${key}Label`)}</span>
                <strong>{t(`states.${key}Rule`)}</strong>
                <p className="copy">{t(`states.${key}Copy`)}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
