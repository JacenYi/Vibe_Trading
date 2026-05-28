const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  buildPoolKey,
  computePoolId,
  encodePoolTotalValue,
  extractBaseFee,
  hasOverrideFlag,
  buildSwapParams,
  OVERRIDE_FEE_FLAG,
  DYNAMIC_FEE_FLAG,
} = require("./helpers/poolHelpers");

describe("VolGuardHook", function () {
  let hook;
  let mockPm;
  let owner;
  let user;

  const MEDIUM_THRESHOLD = ethers.parseEther("5000");
  const WHALE_THRESHOLD  = ethers.parseEther("50000");
  const EWMA_WEIGHT_BPS  = 2000n;
  const VOL_MULTIPLIER   = 30000n; // 3 倍 EWMA 触发极端费率

  const LOW_FEE     = 500n;
  const MEDIUM_FEE  = 3000n;
  const HIGH_FEE    = 10000n;
  const EXTREME_FEE = 20000n;

  // 占位代币地址（非真实 ERC20，仅用于构造 PoolKey）
  const TOKEN_A = "0x0000000000000000000000000000000000000001";
  const TOKEN_B = "0x0000000000000000000000000000000000000002";

  let poolKey;
  let poolId;

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();

    const MockPM = await ethers.getContractFactory("MockPoolManager");
    mockPm = await MockPM.deploy();

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

    poolKey = buildPoolKey(TOKEN_A, TOKEN_B, await hook.getAddress());
    poolId  = computePoolId(poolKey);
  });

  // ─── 访问控制 ─────────────────────────────────────────────────────────────

  describe("访问控制", function () {
    it("非 PoolManager 调用 beforeSwap 时回滚", async function () {
      const swapParams = buildSwapParams(ethers.parseEther("1000"));
      await expect(
        hook.connect(user).beforeSwap(user.address, poolKey, swapParams, "0x")
      ).to.be.revertedWithCustomError(hook, "NotPoolManager");
    });

    it("非管理员调用 setRiskConfig 时回滚", async function () {
      await expect(
        hook.connect(user).setRiskConfig(
          MEDIUM_THRESHOLD,
          WHALE_THRESHOLD,
          EWMA_WEIGHT_BPS,
          VOL_MULTIPLIER
        )
      ).to.be.revertedWithCustomError(hook, "Unauthorized");
    });

    it("管理员可转移所有权", async function () {
      await hook.connect(owner).setOwner(user.address);
      expect(await hook.owner()).to.equal(user.address);
    });
  });

  // ─── beforeSwap 费率选择（绝对阈值模型）──────────────────────────────────

  describe("beforeSwap — 绝对阈值模型", function () {
    async function callBeforeSwap(amount, hookData = "0x") {
      const swapParams = buildSwapParams(amount);
      const tx = await mockPm.callBeforeSwap(
        await hook.getAddress(),
        user.address,
        poolKey,
        swapParams,
        hookData
      );
      const receipt = await tx.wait();
      const result  = await mockPm.callBeforeSwap.staticCall(
        await hook.getAddress(),
        user.address,
        poolKey,
        swapParams,
        hookData
      );
      return result;
    }

    it("小额交易返回 LOW_FEE（含 OVERRIDE_FLAG）", async function () {
      const amount = ethers.parseEther("1000");
      const [, , feeOverride] = await mockPm.callBeforeSwap.staticCall(
        await hook.getAddress(), user.address, poolKey, buildSwapParams(amount), "0x"
      );
      expect(hasOverrideFlag(feeOverride)).to.be.true;
      expect(extractBaseFee(feeOverride)).to.equal(LOW_FEE);
    });

    it("中等交易返回 MEDIUM_FEE", async function () {
      const amount = ethers.parseEther("10000");
      const [, , feeOverride] = await mockPm.callBeforeSwap.staticCall(
        await hook.getAddress(), user.address, poolKey, buildSwapParams(amount), "0x"
      );
      expect(extractBaseFee(feeOverride)).to.equal(MEDIUM_FEE);
    });

    it("鲸鱼交易返回 HIGH_FEE", async function () {
      const amount = ethers.parseEther("60000");
      const [, , feeOverride] = await mockPm.callBeforeSwap.staticCall(
        await hook.getAddress(), user.address, poolKey, buildSwapParams(amount), "0x"
      );
      expect(extractBaseFee(feeOverride)).to.equal(HIGH_FEE);
    });

    it("触发 FeeSelected 事件", async function () {
      const amount     = ethers.parseEther("1000");
      const swapParams = buildSwapParams(amount);
      await expect(
        mockPm.callBeforeSwap(await hook.getAddress(), user.address, poolKey, swapParams, "0x")
      ).to.emit(hook, "FeeSelected");
    });
  });

  // ─── beforeSwap 费率选择（比率模型）──────────────────────────────────────

  describe("beforeSwap — 比率模型", function () {
    it("交易/池比率 >= 5% 时返回 EXTREME_FEE", async function () {
      const poolTotal = ethers.parseEther("1000000"); // 100 万
      const amount    = ethers.parseEther("60000");   // 占 100 万的 6%
      const hookData  = encodePoolTotalValue(poolTotal);
      const [, , feeOverride] = await mockPm.callBeforeSwap.staticCall(
        await hook.getAddress(), user.address, poolKey, buildSwapParams(amount), hookData
      );
      expect(extractBaseFee(feeOverride)).to.equal(EXTREME_FEE);
    });

    it("交易/池比率 < 0.10% 时返回 LOW_FEE", async function () {
      const poolTotal = ethers.parseEther("10000000"); // 1000 万
      const amount    = ethers.parseEther("5000");     // 占 1000 万的 0.05%
      const hookData  = encodePoolTotalValue(poolTotal);
      const [, , feeOverride] = await mockPm.callBeforeSwap.staticCall(
        await hook.getAddress(), user.address, poolKey, buildSwapParams(amount), hookData
      );
      expect(extractBaseFee(feeOverride)).to.equal(LOW_FEE);
    });
  });

  // ─── EWMA 状态更新 ────────────────────────────────────────────────────────

  describe("EWMA 状态更新", function () {
    it("首次 Swap 后 EWMA 等于交易量", async function () {
      const amount     = ethers.parseEther("10000");
      const swapParams = buildSwapParams(amount);
      await mockPm.callBeforeSwap(await hook.getAddress(), user.address, poolKey, swapParams, "0x");

      const { ewma } = await hook.getPoolState(poolId);
      expect(ewma).to.equal(amount);
    });

    it("第二次 Swap 后按公式更新 EWMA", async function () {
      const amount1 = ethers.parseEther("10000");
      const amount2 = ethers.parseEther("20000");

      await mockPm.callBeforeSwap(await hook.getAddress(), user.address, poolKey, buildSwapParams(amount1), "0x");
      await mockPm.callBeforeSwap(await hook.getAddress(), user.address, poolKey, buildSwapParams(amount2), "0x");

      // ewma = 10000 * 0.8 + 20000 * 0.2 = 8000 + 4000 = 12000
      const expectedEwma = ethers.parseEther("12000");
      const { ewma } = await hook.getPoolState(poolId);
      expect(ewma).to.equal(expectedEwma);
    });

    it("不同池各自维护独立的 EWMA", async function () {
      const TOKEN_C  = "0x0000000000000000000000000000000000000003";
      const poolKey2 = buildPoolKey(TOKEN_A, TOKEN_C, await hook.getAddress());
      const poolId2  = computePoolId(poolKey2);

      const amount1 = ethers.parseEther("10000");
      const amount2 = ethers.parseEther("5000");

      await mockPm.callBeforeSwap(await hook.getAddress(), user.address, poolKey,  buildSwapParams(amount1), "0x");
      await mockPm.callBeforeSwap(await hook.getAddress(), user.address, poolKey2, buildSwapParams(amount2), "0x");

      const { ewma: ewma1 } = await hook.getPoolState(poolId);
      const { ewma: ewma2 } = await hook.getPoolState(poolId2);

      expect(ewma1).to.equal(amount1);
      expect(ewma2).to.equal(amount2);
    });
  });

  // ─── EWMA 突刺触发极端费率 ────────────────────────────────────────────────

  describe("EWMA 突刺触发极端费率", function () {
    it("交易量超过 3 倍 EWMA 时触发 EXTREME_FEE", async function () {
      // 先建立 EWMA 基准
      const seedAmount = ethers.parseEther("5000");
      await mockPm.callBeforeSwap(await hook.getAddress(), user.address, poolKey, buildSwapParams(seedAmount), "0x");

      // 3 倍 EWMA = 5000 * 3 = 15000，恰好触发极端费率
      const extremeAmount = ethers.parseEther("15000");
      const [, , feeOverride] = await mockPm.callBeforeSwap.staticCall(
        await hook.getAddress(), user.address, poolKey, buildSwapParams(extremeAmount), "0x"
      );
      expect(extractBaseFee(feeOverride)).to.equal(EXTREME_FEE);
    });
  });

  // ─── RiskConfig 参数校验 ──────────────────────────────────────────────────

  describe("RiskConfig 参数校验", function () {
    it("mediumThreshold > whaleThreshold 时回滚", async function () {
      await expect(
        hook.setRiskConfig(WHALE_THRESHOLD + 1n, WHALE_THRESHOLD, EWMA_WEIGHT_BPS, VOL_MULTIPLIER)
      ).to.be.revertedWithCustomError(hook, "InvalidRiskConfig");
    });

    it("ewmaWeightBps 为 0 时回滚", async function () {
      await expect(
        hook.setRiskConfig(MEDIUM_THRESHOLD, WHALE_THRESHOLD, 0, VOL_MULTIPLIER)
      ).to.be.revertedWithCustomError(hook, "InvalidRiskConfig");
    });

    it("volMultiplierBps < 10000（小于 1 倍）时回滚", async function () {
      await expect(
        hook.setRiskConfig(MEDIUM_THRESHOLD, WHALE_THRESHOLD, EWMA_WEIGHT_BPS, 9999n)
      ).to.be.revertedWithCustomError(hook, "InvalidRiskConfig");
    });

    it("合法配置可正常更新", async function () {
      const newMedium = ethers.parseEther("8000");
      const newWhale  = ethers.parseEther("80000");
      await hook.setRiskConfig(newMedium, newWhale, 1000n, 20000n);
      const cfg = await hook.riskConfig();
      expect(cfg.mediumTradeThreshold).to.equal(newMedium);
      expect(cfg.whaleThreshold).to.equal(newWhale);
    });
  });

  // ─── simulateFee 视图函数 ─────────────────────────────────────────────────

  describe("simulateFee 视图函数", function () {
    it("调用后不修改链上状态", async function () {
      const ewmaBefore = (await hook.getPoolState(poolId)).ewma;
      await hook.simulateFee(poolId, ethers.parseEther("50000"), 0);
      const ewmaAfter = (await hook.getPoolState(poolId)).ewma;
      expect(ewmaBefore).to.equal(ewmaAfter);
    });
  });
});
