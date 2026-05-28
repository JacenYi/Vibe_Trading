import React from "react";
import { useI18n } from "../context/I18nContext.jsx";

const STEPS = ["input", "simulate", "beforeSwap", "log"];

export default function HookFlow({ activeStep }) {
  const { t } = useI18n();

  const stepTitles = {
    input:      t("flow.inputTitle"),
    simulate:   t("flow.stateTitle"),
    beforeSwap: "beforeSwap",
    log:        t("flow.logTitle"),
  };

  const stepCopies = {
    input:      t("flow.inputCopy"),
    simulate:   t("flow.stateCopy"),
    beforeSwap: t("flow.beforeSwapCopy"),
    log:        t("flow.logCopy"),
  };

  return (
    <div className="panel wide">
      <div className="panel-header">
        <h2 className="panel-title">{t("flow.title")}</h2>
      </div>
      <div className="panel-body">
        <div className="flow-grid">
          {STEPS.map((step, i) => (
            <div key={step} className={`step${activeStep === step ? " active" : ""}`}>
              <span className="step-number">{i + 1}</span>
              <strong>{stepTitles[step]}</strong>
              <span>{stepCopies[step]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
