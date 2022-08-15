import { expect } from "chai"
import { waffle } from "hardhat"
import { PerpdexMarket } from "../../typechain"
import { createPerpdexMarketFixture } from "./fixtures"
import { BigNumber, BigNumberish, Wallet } from "ethers"
import { MockContract } from "ethereum-waffle"
import { PANIC_CODES } from "@nomicfoundation/hardhat-chai-matchers/panic"

describe("PerpdexMarket addLiquidity", () => {
    let loadFixture = waffle.createFixtureLoader(waffle.provider.getWallets())
    let fixture

    let market: PerpdexMarket
    let owner: Wallet
    let alice: Wallet
    let exchange: Wallet
    let priceFeed: MockContract

    beforeEach(async () => {
        fixture = await loadFixture(createPerpdexMarketFixture())
        market = fixture.perpdexMarket
        owner = fixture.owner
        alice = fixture.alice
        exchange = fixture.exchange
        priceFeed = fixture.priceFeed

        await priceFeed.mock.getPrice.returns(BigNumber.from(10).pow(18))
        await priceFeed.mock.decimals.returns(18)
    })

    describe("caller is not exchange", () => {
        it("revert", async () => {
            await expect(market.connect(alice).addLiquidity(1, 1)).to.be.revertedWith("PM_OE: caller is not exchange")
        })
    })

    describe("empty pool", () => {
        ;[
            {
                title: "minimum",
                base: 1001,
                quote: 1001,
                outputLiquidity: 1,
                totalLiquidity: 1001,
            },
            {
                title: "normal",
                base: 10000,
                quote: 10000,
                outputLiquidity: 9000,
                totalLiquidity: 10000,
            },
            {
                title: "normal low price",
                base: 10000,
                quote: 9001,
                outputLiquidity: 8487,
                totalLiquidity: 9487,
            },
            {
                title: "normal high price",
                base: 10000,
                quote: 11000,
                outputLiquidity: 9488,
                totalLiquidity: 10488,
            },
            {
                title: "too low price",
                base: 10000,
                quote: 9000,
                revertedWith: "FL_VILP: too far from index",
            },
            {
                title: "too high price",
                base: 10000,
                quote: 11001,
                revertedWith: "FL_VILP: too far from index",
            },
            {
                title: "same as minimum",
                base: 1000,
                quote: 1000,
                revertedWith: "PL_AL: initial liquidity zero",
            },
            {
                title: "too small",
                base: 999,
                quote: 999,
                revertedWith: PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW,
            },
            {
                title: "overflow",
                base: BigNumber.from(2).pow(128),
                quote: BigNumber.from(2).pow(128),
                revertedWith: PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW,
            },
        ].forEach(test => {
            it(test.title, async () => {
                const res = expect(market.connect(exchange).addLiquidity(test.base, test.quote))
                if (test.revertedWith !== void 0) {
                    if (typeof test.revertedWith === "number") {
                        await res.to.revertedWithPanic(test.revertedWith)
                    } else {
                        await res.to.revertedWith(test.revertedWith)
                    }
                } else {
                    await res.to.emit(market, "LiquidityAdded").withArgs(test.base, test.quote, test.outputLiquidity)
                    const poolInfo = await market.poolInfo()
                    expect(poolInfo.base).to.eq(test.base)
                    expect(poolInfo.quote).to.eq(test.quote)
                    expect(poolInfo.totalLiquidity).to.eq(test.totalLiquidity)
                }
            })
        })
    })

    describe("non empty pool", () => {
        beforeEach(async () => {
            await market.connect(exchange).addLiquidity(10000, 10000)
        })
        ;[
            {
                title: "normal",
                base: 10000,
                quote: 10000,
                outputBase: 10000,
                outputQuote: 10000,
                outputLiquidity: 10000,
            },
            {
                title: "base small",
                base: 1,
                quote: 10000,
                outputBase: 1,
                outputQuote: 1,
                outputLiquidity: 1,
            },
            {
                title: "quote small",
                base: 10000,
                quote: 1,
                outputBase: 1,
                outputQuote: 1,
                outputLiquidity: 1,
            },
            {
                title: "base zero",
                base: 0,
                quote: 10000,
                revertedWith: "PL_AL: liquidity zero",
            },
            {
                title: "quote zero",
                base: 10000,
                quote: 0,
                revertedWith: "PL_AL: liquidity zero",
            },
            {
                title: "overflow",
                base: BigNumber.from(2).pow(256).sub(10000),
                quote: BigNumber.from(2).pow(256).sub(10000),
                revertedWith: PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW,
            },
        ].forEach(test => {
            it(test.title, async () => {
                const res = expect(market.connect(exchange).addLiquidity(test.base, test.quote))
                if (test.revertedWith !== void 0) {
                    if (typeof test.revertedWith === "number") {
                        await res.to.revertedWithPanic(test.revertedWith)
                    } else {
                        await res.to.revertedWith(test.revertedWith)
                    }
                } else {
                    await res.to
                        .emit(market, "LiquidityAdded")
                        .withArgs(test.outputBase, test.outputQuote, test.outputLiquidity)
                    const poolInfo = await market.poolInfo()
                    expect(poolInfo.base).to.eq(test.outputBase + 10000)
                    expect(poolInfo.quote).to.eq(test.outputQuote + 10000)
                    expect(poolInfo.totalLiquidity).to.eq(test.outputLiquidity + 10000)
                }
            })
        })
    })

    describe("rounding (benefit to others)", () => {
        ;[
            {
                title: "base and liquidity rounded",
                initialBase: 10000,
                initialQuote: 10001,
                initialLiquidity: 10000,
                base: 10,
                quote: 10,
                outputBase: 9,
                outputQuote: 10,
                outputLiquidity: 9,
            },
            {
                title: "quote and liquidity rounded",
                initialBase: 10001,
                initialQuote: 10000,
                initialLiquidity: 10000,
                base: 10,
                quote: 10,
                outputBase: 10,
                outputQuote: 9,
                outputLiquidity: 9,
            },
        ].forEach(test => {
            it(test.title, async () => {
                const resInitial = expect(market.connect(exchange).addLiquidity(test.initialBase, test.initialQuote))
                await resInitial.to
                    .emit(market, "LiquidityAdded")
                    .withArgs(test.initialBase, test.initialQuote, test.initialLiquidity - 1000)

                const res = expect(market.connect(exchange).addLiquidity(test.base, test.quote))
                await res.to
                    .emit(market, "LiquidityAdded")
                    .withArgs(test.outputBase, test.outputQuote, test.outputLiquidity)
                const poolInfo = await market.poolInfo()
                expect(poolInfo.base).to.eq(test.initialBase + test.outputBase)
                expect(poolInfo.quote).to.eq(test.initialQuote + test.outputQuote)
                expect(poolInfo.totalLiquidity).to.eq(BigNumber.from(test.initialLiquidity).add(test.outputLiquidity))
            })
        })
    })
})
