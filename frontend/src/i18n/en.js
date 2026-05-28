const en = {
  // Language toggle
  languageToggle: "中文",

  // Hero
  "hero.title":    "AMM as a Mood State Machine",
  "hero.subtitle": "Vibe Trading is a Uniswap v4 Hook demo where the pool has emotional states: Bullish, Neutral, Defensive, and Panic. The Hook compares trade value with pool value before each swap and changes fee behavior like a state machine.",
  "hero.demoMode":     "Demo Mode · No Wallet",
  "hero.contractMode": "Contract Mode",
  "hero.wrongNetwork": "Wrong Network",
  "hero.switchLocal":  "⚡ Switch to Local Hardhat",
  "hero.switchXLayer": "Switch to X Layer Testnet",
  "hero.connect":      "Connect Wallet",
  "hero.disconnect":   "Disconnect",

  // Pool moods (hero copy)
  "hero.bull":      "Trade share is tiny — pool lowers fees to welcome healthy flow.",
  "hero.neutral":   "Trade share is normal — pool keeps default rules active.",
  "hero.defensive": "Trade share is meaningful — pool prices impact risk.",
  "hero.panic":     "Trade share is high — pool triggers defensive pricing.",

  // Project card
  "project.title":     "Project Idea",
  "project.pill":      "Hook-native state machine",
  "project.coreTitle": "Core",
  "project.coreCopy":  "The pool has a mood. It can be Bullish, Neutral, Defensive, or Panic, and each mood changes how swaps are treated.",
  "project.v4Title":   "Why v4",
  "project.v4Copy":    "This is hook-native because beforeSwap can read state and change execution rules right at the swap lifecycle.",
  "project.panicTitle":"Panic Mode",
  "project.panicCopy": "If a trade takes a large share of pool value, the pool becomes defensive: fees increase and protection rules activate.",
  "project.bullTitle": "Bull Mode",
  "project.bullCopy":  "If buy flow is healthy and small versus pool value, the pool becomes welcoming: fees decrease and swaps are cheaper.",

  // Pool info
  "pool.title":  "Pool",
  "pool.pair":   "Token Pair",
  "pool.network":"Network",
  "pool.hook":   "Hook",
  "pool.status": "Current State",
  "pool.ewma":   "Volume EWMA",
  "pool.lastFee":"Last Fee",

  // Simulator
  "sim.title":          "Mood Simulator",
  "sim.direction":      "Trade Direction",
  "sim.amount":         "Swap Amount",
  "sim.poolValue":      "Pool Total Value (sim)",
  "sim.pressure":       "Recent Flow",
  "sim.simulate":       "Simulate Mood (read-only)",
  "sim.execute":        "Execute Swap (real tx)",
  "sim.approve":        "Approve",
  "sim.approving":      "Approving...",
  "sim.executing":      "Executing on-chain...",
  "sim.contractReady":  "Ready · Execute Swap will send a real transaction and auto-trigger the Hook",
  "sim.walletNote":     "Demo mode (local calc) · Connect wallet on correct network to call contract",

  // Direction / pressure options
  "direction.buy":  "Buy MOOD",
  "direction.sell": "Sell MOOD",
  "pressure.balanced":"Balanced",
  "pressure.buy":   "Buy pressure",
  "pressure.sell":  "Sell pressure",

  // Quick cases
  "case.neutral":   "Neutral",
  "case.bull":      "Bullish",
  "case.panic":     "Panic",

  // Hook decision
  "decision.title":          "Hook Decision",
  "decision.mood":           "Mood",
  "decision.ratio":          "Trade / Pool",
  "decision.fee":            "Fee Rule",
  "decision.rule":           "Trade Rule",
  "decision.sourceContract": "✅ On-chain Contract",
  "decision.sourceDemo":     "📋 Local Simulation",

  // Mood labels
  "mood.bull":      "Bullish",
  "mood.neutral":   "Neutral",
  "mood.defensive": "Defensive",
  "mood.panic":     "Panic",

  // Fee labels
  "fee.bull":      "0.05%",
  "fee.neutral":   "0.30%",
  "fee.defensive": "1.00%",
  "fee.panic":     "2.00%",

  // Trade rules
  "rule.bull":      "Fee discount",
  "rule.neutral":   "Default",
  "rule.defensive": "Impact pricing",
  "rule.panic":     "Protection",

  // Explain texts
  "explain.bull":      "The Hook sees a small buy relative to pool value. Mood becomes Bullish, fees decrease.",
  "explain.neutral":   "Trade is within normal share of pool value — pool stays neutral and uses default rules.",
  "explain.defensive": "Trade takes a meaningful share of pool value. Mood becomes Defensive, fees increase to compensate LP impact risk.",
  "explain.panic":     "Trade takes a high share of pool value. Mood becomes Panic, fees increase and protection rules activate.",

  // Mood states
  "states.title":         "Mood States",
  "states.bullLabel":     "Bullish",
  "states.bullRule":      "Fee decreases",
  "states.bullCopy":      "Buy pressure makes the pool easier to trade.",
  "states.neutralLabel":  "Neutral",
  "states.neutralRule":   "Default fee",
  "states.neutralCopy":   "Balanced flow keeps normal AMM behavior.",
  "states.defensiveLabel":"Defensive",
  "states.defensiveRule": "Impact fee",
  "states.defensiveCopy": "A larger trade share adds LP risk compensation.",
  "states.panicLabel":    "Panic",
  "states.panicRule":     "Fee increases",
  "states.panicCopy":     "High trade share or sell pressure activates protection rules.",

  // Demo evidence
  "evidence.title":       "Demo Evidence",
  "evidence.function":    "Hook Function",
  "evidence.model":       "Model",
  "evidence.stateMachine":"Pool state machine",
  "evidence.execution":   "Execution",
  "evidence.frontend":    "Frontend + Contract",
  "evidence.deploy":      "Deployment",
  "evidence.xlayer":      "X Layer Testnet",

  // Hook flow
  "flow.title":          "Hook Flow",
  "flow.inputTitle":     "Read flow",
  "flow.inputCopy":      "Direction, trade value, pool value, and recent pressure become Hook inputs.",
  "flow.stateTitle":     "Update mood",
  "flow.stateCopy":      "The pool moves between Bullish, Neutral, Defensive, and Panic.",
  "flow.beforeSwapCopy": "The Hook returns the fee and rule override.",
  "flow.logTitle":       "Activity log",
  "flow.logCopy":        "The demo records mood, fee, rule, and tx hash.",

  // Activity log
  "activity.title":      "Recent Activity",
  "activity.pill":       "amount · fee rate · fee · tx",
  "activity.preview":    "preview only",
  "activity.ratio":      "trade/pool",
  "activity.empty":      "No activity yet — run a simulation.",
  "activity.feeRate":    "Fee rate",
  "activity.feeAmount":  "Fee",

  // Stage pills
  "stage.ready":     "Ready",
  "stage.case":      "Case selected",
  "stage.simulated": "Simulated",
  "stage.executed":  "Executed",

  // Wallet
  "wallet.connected": "Connected",
  "wallet.chainError":"Wrong network — please switch to X Layer",
};

export default en;
