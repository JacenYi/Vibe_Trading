const { expect } = require("chai");
const { ethers } = require("hardhat");

// VolGuardFeeCalculator 是纯库——通过薄封装层（VolGuardHook）间接测试。
// 部署 VolGuardHook 并调用 simulateFee() 验证库的计算逻辑。
describe("VolGuardFeeCalculator", function () {
  let hook;
  let owner;

  // 与规格文档一致的默认风险配置
  const MEDIUM_THRESHOLD = ethers.parseEther("5000");   // 中等阈值：5,000 代币
  const WHALE_THRESHOLD  = ethers.parseEther("50000");  // 鲸鱼阈值：50,000 代币
  const EWMA_WEIGHT_BPS  = 2000n;                       // EWMA 权重：20%
  const VOL_MULTIPLIER   = 30000n;                      // 3 倍 EWMA 触发极端费率

  // 费率档位常量（单位：pip）
  const LOW_FEE     = 500n;
  const MEDIUM_FEE  = 3000n;
  const HIGH_FEE    = 10000n;
  const EXTREME_FEE = 20000n;

  // 无 EWMA 历史的全新池 ID
  const ZERO_POOL_ID = ethers.ZeroHash;

  beforeEach(async function () {
    [owner] = await ethers.getSigners();

    const MockPM   = await ethers.getContractFactory("MockPoolManager");
    const mockPm   = await MockPM.deploy();

    const Hook = await ethers.getContractFactory("VolGuardHook");
    hook = await Hook.deploy(
      await mockPm.getAddress(),
      owner.address,
      MEDIUM_THRESHOLD,
      WHALE_THRESHOLD,
      EWMA_WEIGHT_BPS,
      VOL_MULTIPLIER,
      false // 测试中跳过地址校验
    );
  });

  // ─── 绝对阈值模型（不传入池总价值）────────────────────────────────────────

  describe("绝对阈值模型", function () {
    it("小额交易返回 LOW_FEE", async function () {
      const amount = ethers.parseEther("1000"); // < mediumThreshold
      const [fee, mood] = await hook.simulateFee(ZERO_POOL_ID, amount, 0);
      expect(fee).to.equal(LOW_FEE);
      expect(mood).to.equal(0); // 看涨
    });

    it("恰好等于中等阈值时返回 MEDIUM_FEE", async function () {
      const [fee, mood] = await hook.simulateFee(ZERO_POOL_ID, MEDIUM_THRESHOLD, 0);
      expect(fee).to.equal(MEDIUM_FEE);
      expect(mood).to.equal(1); // 中性
    });

    it("介于中等阈值与鲸鱼阈值之间返回 MEDIUM_FEE", async function () {
      const amount = ethers.parseEther("20000");
      const [fee] = await hook.simulateFee(ZERO_POOL_ID, amount, 0);
      expect(fee).to.equal(MEDIUM_FEE);
    });

    it("恰好等于鲸鱼阈值时返回 HIGH_FEE", async function () {
      const [fee, mood] = await hook.simulateFee(ZERO_POOL_ID, WHALE_THRESHOLD, 0);
      expect(fee).to.equal(HIGH_FEE);
      expect(mood).to.equal(2); // 防御
    });

    it("超过鲸鱼阈值（无 EWMA 历史）返回 HIGH_FEE", async function () {
      const amount = ethers.parseEther("80000");
      const [fee] = await hook.simulateFee(ZERO_POOL_ID, amount, 0);
      expect(fee).to.equal(HIGH_FEE);
    });
  });

  // ─── 比率模型 ─────────────────────────────────────────────────────────────

  describe("比率模型", function () {
    const POOL_TOTAL = ethers.parseEther("10000000"); // 池总价值：1000 万代币

    it("交易比率 < 0.10% 返回 LOW_FEE", async function () {
      const amount = ethers.parseEther("500"); // 占 1000 万的 0.005%
      const [fee, mood] = await hook.simulateFee(ZERO_POOL_ID, amount, POOL_TOTAL);
      expect(fee).to.equal(LOW_FEE);
      expect(mood).to.equal(0);
    });

    it("交易比率恰好为 0.10% 时返回 MEDIUM_FEE（边界值）", async function () {
      // 0.10% × 1000 万 = 10,000
      const amount = ethers.parseEther("10000");
      const [fee, mood] = await hook.simulateFee(ZERO_POOL_ID, amount, POOL_TOTAL);
      expect(fee).to.equal(MEDIUM_FEE);
      expect(mood).to.equal(1);
    });

    it("交易比率恰好为 1.00% 时返回 HIGH_FEE", async function () {
      // 1.00% × 1000 万 = 100,000
      const amount = ethers.parseEther("100000");
      const [fee, mood] = await hook.simulateFee(ZERO_POOL_ID, amount, POOL_TOTAL);
      expect(fee).to.equal(HIGH_FEE);
      expect(mood).to.equal(2);
    });

    it("交易比率恰好为 5.00% 时返回 EXTREME_FEE", async function () {
      // 5.00% × 1000 万 = 500,000
      const amount = ethers.parseEther("500000");
      const [fee, mood] = await hook.simulateFee(ZERO_POOL_ID, amount, POOL_TOTAL);
      expect(fee).to.equal(EXTREME_FEE);
      expect(mood).to.equal(3); // 恐慌
    });

    it("小池子——10 万池中交易 1 万（10%）返回 EXTREME_FEE", async function () {
      const smallPool = ethers.parseEther("100000");
      const amount    = ethers.parseEther("10000"); // 占 10 万的 10%
      const [fee] = await hook.simulateFee(ZERO_POOL_ID, amount, smallPool);
      expect(fee).to.equal(EXTREME_FEE);
    });
  });

  // ─── EWMA 计算 ────────────────────────────────────────────────────────────

  describe("EWMA 计算", function () {
    it("prevEwma 为零时（首笔交易），nextEwma 等于交易量", async function () {
      const amount = ethers.parseEther("1000");
      const [, , nextEwma] = await hook.simulateFee(ZERO_POOL_ID, amount, 0);
      expect(nextEwma).to.equal(amount);
    });

    it("20% 权重下 EWMA 衰减公式正确", async function () {
      // 首笔交易 10,000 代币后 EWMA = 10,000（prevEwma = 0 的特殊情况）
      // 第二笔交易 20,000 代币，20% 权重：
      //   nextEwma = 10000 * 0.8 + 20000 * 0.2 = 8000 + 4000 = 12000
      const amount1 = ethers.parseEther("10000");
      const amount2 = ethers.parseEther("20000");

      // 预期值：10000 * 8000/10000 + 20000 * 2000/10000 = 8000 + 4000 = 12000
      const expectedEwma = ethers.parseEther("12000");

      // simulateFee 是 view，用它验证库的数学公式
      // （链上 EWMA 只在 beforeSwap 中更新，详见 VolGuardHook.test.js）
      const prevEwma = amount1;
      const weight   = 2000n; // 20%
      const computed = (prevEwma * (10000n - weight) + amount2 * weight) / 10000n;
      expect(computed).to.equal(expectedEwma);
    });
  });
});
