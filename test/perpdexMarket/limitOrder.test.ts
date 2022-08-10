import { expect } from "chai"
import { waffle } from "hardhat"
import { TestPerpdexMarket } from "../../typechain"
import { createPerpdexMarketFixture } from "./fixtures"
import { BigNumber, BigNumberish, Wallet } from "ethers"
import { MockContract } from "ethereum-waffle"

describe("PerpdexMarket limitOrder", () => {
    let loadFixture = waffle.createFixtureLoader(waffle.provider.getWallets())
    let fixture

    let market: TestPerpdexMarket
    let owner: Wallet
    let alice: Wallet
    let exchange: Wallet
    let priceFeed: MockContract

    const Q96 = BigNumber.from(2).pow(96)

    beforeEach(async () => {
        fixture = await loadFixture(createPerpdexMarketFixture())
        market = fixture.perpdexMarket
        owner = fixture.owner
        alice = fixture.alice
        exchange = fixture.exchange
        priceFeed = fixture.priceFeed

        await market.connect(owner).setPoolFeeRatio(0)
        await market.connect(owner).setFundingMaxPremiumRatio(0)
        await market.connect(owner).setPriceLimitConfig({
            normalOrderRatio: 1e5,
            liquidationRatio: 2e5,
            emaNormalOrderRatio: 5e5,
            emaLiquidationRatio: 5e5,
            emaSec: 0,
        })
        await market.setPoolInfo({
            base: 10000,
            quote: 10000,
            totalLiquidity: 10000,
            cumBasePerLiquidityX96: 0,
            cumQuotePerLiquidityX96: 0,
            baseBalancePerShareX96: Q96,
        })
    })

    describe("createLimitOrder", () => {
        it("normal", async () => {
            await expect(market.connect(exchange).createLimitOrder(true, 1, Q96))
                .to.emit(market, "LimitOrderCreated")
                .withArgs(true, 1, Q96, 1)
            await expect(market.connect(exchange).createLimitOrder(false, 1, Q96))
                .to.emit(market, "LimitOrderCreated")
                .withArgs(false, 1, Q96, 1)
        })

        it("multiple", async () => {
            await expect(market.connect(exchange).createLimitOrder(true, 1, Q96))
                .to.emit(market, "LimitOrderCreated")
                .withArgs(true, 1, Q96, 1)
            await expect(market.connect(exchange).createLimitOrder(true, 1, Q96))
                .to.emit(market, "LimitOrderCreated")
                .withArgs(true, 1, Q96, 2)
            await expect(market.connect(exchange).createLimitOrder(false, 1, Q96))
                .to.emit(market, "LimitOrderCreated")
                .withArgs(false, 1, Q96, 1)
            await expect(market.connect(exchange).createLimitOrder(false, 1, Q96))
                .to.emit(market, "LimitOrderCreated")
                .withArgs(false, 1, Q96, 2)
        })

        it("post only error ask", async () => {
            await expect(market.connect(exchange).createLimitOrder(false, 1, Q96.sub(1))).to.be.revertedWith(
                "PM_CLO: post only ask",
            )
        })

        it("post only error bid", async () => {
            await expect(market.connect(exchange).createLimitOrder(true, 1, Q96.add(1))).to.be.revertedWith(
                "PM_CLO: post only bid",
            )
        })

        it("caller is not exchange error", async () => {
            await expect(market.connect(alice).createLimitOrder(true, 1, Q96)).to.be.revertedWith(
                "PM_OE: caller is not exchange",
            )
        })
    })

    describe("cancelLimitOrder", () => {
        it("normal", async () => {
            await expect(market.connect(exchange).createLimitOrder(true, 1, Q96))
                .to.emit(market, "LimitOrderCreated")
                .withArgs(true, 1, Q96, 1)
            await expect(market.connect(exchange).cancelLimitOrder(true, 1))
                .to.emit(market, "LimitOrderCanceled")
                .withArgs(true, 1)

            await expect(market.connect(exchange).createLimitOrder(false, 1, Q96))
                .to.emit(market, "LimitOrderCreated")
                .withArgs(false, 1, Q96, 1)
            await expect(market.connect(exchange).cancelLimitOrder(false, 1))
                .to.emit(market, "LimitOrderCanceled")
                .withArgs(false, 1)
        })

        it("empty", async () => {
            await expect(market.connect(exchange).cancelLimitOrder(true, 1)).to.revertedWith("OBL_IE: not exist")
        })

        it("different side ask", async () => {
            await expect(market.connect(exchange).createLimitOrder(true, 1, Q96))
                .to.emit(market, "LimitOrderCreated")
                .withArgs(true, 1, Q96, 1)
            await expect(market.connect(exchange).cancelLimitOrder(false, 1)).to.revertedWith("OBL_IE: not exist")
        })

        it("different side bid", async () => {
            await expect(market.connect(exchange).createLimitOrder(false, 1, Q96))
                .to.emit(market, "LimitOrderCreated")
                .withArgs(false, 1, Q96, 1)
            await expect(market.connect(exchange).cancelLimitOrder(true, 1)).to.revertedWith("OBL_IE: not exist")
        })

        it("caller is not exchange error", async () => {
            await expect(market.connect(alice).cancelLimitOrder(true, 1)).to.be.revertedWith(
                "PM_OE: caller is not exchange",
            )
        })
    })
})
