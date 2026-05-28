import React, { useState, useCallback } from "react";
import { useVolGuard } from "./hooks/useVolGuard.js";
import {
  classifyMood,
  fakeTxHash,
  parsePositiveNumber,
} from "./utils/moodCalculator.js";

import Hero          from "./components/Hero.jsx";
import ProjectCard   from "./components/ProjectCard.jsx";
import PoolInfo      from "./components/PoolInfo.jsx";
import MoodSimulator from "./components/MoodSimulator.jsx";
import HookDecision  from "./components/HookDecision.jsx";
import MoodStates    from "./components/MoodStates.jsx";
import DemoEvidence  from "./components/DemoEvidence.jsx";
import HookFlow      from "./components/HookFlow.jsx";
import ActivityLog   from "./components/ActivityLog.jsx";

// 预填充活动日志的演示数据（与原 index.html 保持一致）
const INITIAL_ACTIVITIES = [
  { amount: 80000, poolValue: 1000000,  direction: "sell", pressure: "sell",     moodKey: "panic",   hash: fakeTxHash() },
  { amount: 5000,  poolValue: 10000000, direction: "buy",  pressure: "buy",      moodKey: "bull",    hash: fakeTxHash() },
  { amount: 50000, poolValue: 10000000, direction: "buy",  pressure: "balanced", moodKey: "neutral", hash: fakeTxHash() },
];

export default function App() {
  const { poolState, isContractConnected } = useVolGuard();

  const [result,     setResult]     = useState(null);
  const [stage,      setStage]      = useState("ready");
  const [activeStep, setActiveStep] = useState("input");
  const [activities, setActivities] = useState(INITIAL_ACTIVITIES);

  const moodKey = result?.moodKey ?? "neutral";

  const handleResult = useCallback((res) => {
    setResult(res);
    setStage(res.stage);
    setActiveStep(res.stage === "simulated" ? "simulate" : "input");
    // 加入活动列表（仅模拟，无交易哈希）
    setActivities((prev) => [{ ...res }, ...prev].slice(0, 20));
  }, []);

  const handleExecute = useCallback((res) => {
    // 真实合约执行已携带 tx hash，演示模式才生成假 hash
    const withHash = { ...res, hash: res.hash ?? fakeTxHash() };
    setResult(withHash);
    setStage("executed");
    setActiveStep("log");
    setActivities((prev) => [withHash, ...prev].slice(0, 20));
  }, []);

  return (
    <main>
      <Hero moodKey={moodKey} />

      <section className="layout">
        <ProjectCard />

        <PoolInfo moodKey={moodKey} poolState={poolState} />

        <MoodSimulator onResult={handleResult} onExecute={handleExecute} />

        <HookDecision result={result} stage={stage} />

        <MoodStates activeMood={moodKey} />

        <DemoEvidence />

        <HookFlow activeStep={activeStep} />

        <ActivityLog activities={activities} />
      </section>
    </main>
  );
}
