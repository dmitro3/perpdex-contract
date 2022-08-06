import { expect } from "chai"
import { waffle } from "hardhat"
import { PerpdexMarket } from "../../typechain"
import { createPerpdexMarketFixture } from "./fixtures"
import { BigNumber, BigNumberish, Wallet } from "ethers"
import { MockContract } from "ethereum-waffle"

describe("PerpdexMarket limitOrder", () => {
    let loadFixture = waffle.createFixtureLoader(waffle.provider.getWallets())
    let fixture

    let market: PerpdexMarket
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
    })

    describe("cancelLimitOrder", () => {
        it("normal", async () => {
            await expect(market.connect(exchange).createLimitOrder(true, 1, Q96))
                .to.emit(market, "LimitOrderCreated")
                .withArgs(true, 1, Q96, 1)
            await expect(market.connect(exchange).cancelLimitOrder(true, 1))
                .to.emit(market, "LimitOrderCanceled")
                .withArgs(true, 1)
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
    })
})
