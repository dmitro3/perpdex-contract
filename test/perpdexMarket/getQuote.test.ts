import { expect } from "chai"
import { waffle } from "hardhat"
import { TestPerpdexMarket } from "../../typechain"
import { createPerpdexMarketFixture } from "./fixtures"
import { BigNumber, Wallet } from "ethers"

describe("PerpdexMarket getQuote", () => {
    let loadFixture = waffle.createFixtureLoader(waffle.provider.getWallets())
    let fixture

    let market: TestPerpdexMarket
    let exchange: Wallet

    const Q96 = BigNumber.from(2).pow(96)

    beforeEach(async () => {
        fixture = await loadFixture(createPerpdexMarketFixture())
        market = fixture.perpdexMarket
        exchange = fixture.exchange
    })

    describe("various cases", () => {
        ;[
            {
                title: "empty",
                base: 0,
                quote: 0,
                fixedFeeRatio: 0,
                askPriceX96: 0,
                bidPriceX96: 0,
            },
            {
                title: "pool only without fee",
                base: 10000,
                quote: 10000,
                fixedFeeRatio: 0,
                askPriceX96: Q96,
                bidPriceX96: Q96,
            },
            {
                title: "pool only with fee",
                base: 10000,
                quote: 10000,
                fixedFeeRatio: 1e4,
                askPriceX96: Q96.mul(100).div(99),
                bidPriceX96: Q96.mul(99).div(100).add(1),
            },
            {
                title: "pool only with fee and funding",
                base: 10000,
                quote: 10000,
                fixedFeeRatio: 1e4,
                baseBalancePerShareX96: Q96.mul(2),
                askPriceX96: Q96.div(2).mul(100).div(99),
                bidPriceX96: Q96.div(2).mul(99).div(100).add(1),
            },
            {
                title: "pool spread is larger than order book",
                base: 10000,
                quote: 10000,
                fixedFeeRatio: 1e4,
                orderBookAsk: Q96.add(1),
                orderBookBid: Q96.sub(1),
                askPriceX96: Q96.add(1),
                bidPriceX96: Q96.sub(1),
            },
            {
                title: "pool spread is larger than order book. funding not affect",
                base: 10000,
                quote: 10000,
                fixedFeeRatio: 1e4,
                baseBalancePerShareX96: Q96.mul(2),
                orderBookAsk: Q96.div(2).add(1),
                orderBookBid: Q96.div(2).sub(1),
                askPriceX96: Q96.div(2).add(1),
                bidPriceX96: Q96.div(2).sub(1),
            },
            {
                title: "pool spread is smaller than order book",
                base: 10000,
                quote: 10000,
                fixedFeeRatio: 1e4,
                orderBookAsk: Q96.mul(2),
                orderBookBid: Q96.div(2),
                askPriceX96: Q96.mul(100).div(99),
                bidPriceX96: Q96.mul(99).div(100).add(1),
            },
        ].forEach(test => {
            describe(test.title, async () => {
                beforeEach(async () => {
                    await market.setPoolInfo({
                        base: test.base,
                        quote: test.quote,
                        totalLiquidity: (test.base * test.quote) ** 0.5,
                        cumBasePerLiquidityX96: 0,
                        cumQuotePerLiquidityX96: 0,
                        baseBalancePerShareX96: test.baseBalancePerShareX96 || Q96,
                    })
                    await market.setPoolFeeConfig({
                        fixedFeeRatio: test.fixedFeeRatio,
                        atrFeeRatio: 0,
                        atrEmaBlocks: 1,
                    })
                    if (test.orderBookAsk) {
                        await market.connect(exchange).createLimitOrder(false, 1, test.orderBookAsk)
                    }
                    if (test.orderBookBid) {
                        await market.connect(exchange).createLimitOrder(true, 1, test.orderBookBid)
                    }
                })

                it("askPriceX96", async () => {
                    expect(await market.getAskPriceX96()).to.eq(test.askPriceX96)
                })

                it("bidPriceX96", async () => {
                    expect(await market.getBidPriceX96()).to.eq(test.bidPriceX96)
                })
            })
        })
    })

    describe("consistency with maxSwapByPrice", () => {
        beforeEach(async () => {
            await market.setPoolInfo({
                base: Q96.shl(16),
                quote: Q96.shl(16),
                totalLiquidity: Q96.shl(16),
                cumBasePerLiquidityX96: 0,
                cumQuotePerLiquidityX96: 0,
                baseBalancePerShareX96: Q96,
            })
            await market.setPoolFeeConfig({
                fixedFeeRatio: 1e4,
                atrFeeRatio: 0,
                atrEmaBlocks: 1,
            })
        })

        it("askPriceX96", async () => {
            const ask = await market.getAskPriceX96()
            expect(await market.maxSwapByPrice(false, true, ask)).to.eq(0)
            expect(await market.maxSwapByPrice(false, true, ask.add(1))).to.gt(0)
        })

        it("bidPriceX96", async () => {
            const bid = await market.getBidPriceX96()
            expect(await market.maxSwapByPrice(true, true, bid)).to.eq(0)
            expect(await market.maxSwapByPrice(true, true, bid.sub(1))).to.gt(0)
        })
    })
})
