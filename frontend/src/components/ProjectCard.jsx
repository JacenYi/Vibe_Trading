import React from "react";
import { useI18n } from "../context/I18nContext.jsx";

export default function ProjectCard() {
  const { t } = useI18n();

  return (
    <div className="panel">
      <div className="panel-header">
        <h2 className="panel-title">{t("project.title")}</h2>
        <span className="pill">{t("project.pill")}</span>
      </div>
      <div className="panel-body">
        <div className="story-grid">
          <div className="story-card">
            <span className="label">{t("project.coreTitle")}</span>
            <p className="copy">{t("project.coreCopy")}</p>
          </div>
          <div className="story-card">
            <span className="label">{t("project.v4Title")}</span>
            <p className="copy">{t("project.v4Copy")}</p>
          </div>
          <div className="story-card">
            <span className="label">{t("project.panicTitle")}</span>
            <p className="copy">{t("project.panicCopy")}</p>
          </div>
          <div className="story-card">
            <span className="label">{t("project.bullTitle")}</span>
            <p className="copy">{t("project.bullCopy")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
