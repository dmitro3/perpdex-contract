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
            await expect(market.connect(exchange).createLimitOrder(true, 1, Q96, false))
                .to.emit(market, "LimitOrderCreated")
                .withArgs(true, 1, Q96, 1)
            await expect(market.connect(exchange).createLimitOrder(false, 1, Q96, false))
                .to.emit(market, "LimitOrderCreated")
                .withArgs(false, 1, Q96, 1)
        })

        it("multiple", async () => {
            await expect(market.connect(exchange).createLimitOrder(true, 1, Q96, false))
                .to.emit(market, "LimitOrderCreated")
                .withArgs(true, 1, Q96, 1)
            await expect(market.connect(exchange).createLimitOrder(true, 1, Q96, false))
                .to.emit(market, "LimitOrderCreated")
                .withArgs(true, 1, Q96, 2)
            await expect(market.connect(exchange).createLimitOrder(false, 1, Q96, false))
                .to.emit(market, "LimitOrderCreated")
                .withArgs(false, 1, Q96, 1)
            await expect(market.connect(exchange).createLimitOrder(false, 1, Q96, false))
                .to.emit(market, "LimitOrderCreated")
                .withArgs(false, 1, Q96, 2)
        })

        it("caller is not exchange error", async () => {
            await expect(market.connect(alice).createLimitOrder(true, 1, Q96, false)).to.be.revertedWith(
                "PM_OE: caller is not exchange",
            )
        })
    })

    describe("createLimitOrder post only", () => {
        describe("pool spread is larger than order book spread", () => {
            beforeEach(async () => {
                await market.connect(owner).setPoolFeeConfig({
                    fixedFeeRatio: 1e4,
                    atrFeeRatio: 0,
                    atrEmaBlocks: 1,
                })
                await market.connect(exchange).createLimitOrder(true, 1, Q96.sub(1), false)
                await market.connect(exchange).createLimitOrder(false, 1, Q96.add(1), false)
            })

            it("ok bid", async () => {
                await expect(market.connect(exchange).createLimitOrder(true, 1, Q96.add(1), false))
                    .to.emit(market, "LimitOrderCreated")
                    .withArgs(true, 1, Q96.add(1), 2)
            })

            it("ok ask", async () => {
                await expect(market.connect(exchange).createLimitOrder(false, 1, Q96.sub(1), false))
                    .to.emit(market, "LimitOrderCreated")
                    .withArgs(false, 1, Q96.sub(1), 2)
            })

            it("error bid", async () => {
                await expect(market.connect(exchange).createLimitOrder(true, 1, Q96.add(2), false)).to.be.revertedWith(
                    "PM_CLO: post only bid",
                )
            })

            it("error ask", async () => {
                await expect(market.connect(exchange).createLimitOrder(false, 1, Q96.sub(2), false)).to.be.revertedWith(
                    "PM_CLO: post only ask",
                )
            })
        })
    })

    describe("cancelLimitOrder", () => {
        it("normal", async () => {
            await expect(market.connect(exchange).createLimitOrder(true, 1, Q96, false))
                .to.emit(market, "LimitOrderCreated")
                .withArgs(true, 1, Q96, 1)
            await expect(market.connect(exchange).cancelLimitOrder(true, 1))
                .to.emit(market, "LimitOrderCanceled")
                .withArgs(true, 1)

            await expect(market.connect(exchange).createLimitOrder(false, 1, Q96, false))
                .to.emit(market, "LimitOrderCreated")
                .withArgs(false, 1, Q96, 1)
            await expect(market.connect(exchange).cancelLimitOrder(false, 1))
                .to.emit(market, "LimitOrderCanceled")
                .withArgs(false, 1)
        })

        it("empty", async () => {
            await expect(market.connect(exchange).cancelLimitOrder(true, 1)).to.revertedWith("RBTL_R: key not exist")
        })

        it("different side ask", async () => {
            await expect(market.connect(exchange).createLimitOrder(true, 1, Q96, false))
                .to.emit(market, "LimitOrderCreated")
                .withArgs(true, 1, Q96, 1)
            await expect(market.connect(exchange).cancelLimitOrder(false, 1)).to.revertedWith("RBTL_R: key not exist")
        })

        it("different side bid", async () => {
            await expect(market.connect(exchange).createLimitOrder(false, 1, Q96, false))
                .to.emit(market, "LimitOrderCreated")
                .withArgs(false, 1, Q96, 1)
            await expect(market.connect(exchange).cancelLimitOrder(true, 1)).to.revertedWith("RBTL_R: key not exist")
        })

        it("caller is not exchange error", async () => {
            await expect(market.connect(alice).cancelLimitOrder(true, 1)).to.be.revertedWith(
                "PM_OE: caller is not exchange",
            )
        })
    })
})
