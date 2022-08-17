import { expect } from "chai"
import { waffle } from "hardhat"
import { TestPerpdexMarket } from "../../typechain"
import { createPerpdexMarketFixture } from "./fixtures"
import { BigNumber, Wallet } from "ethers"
import { getTimestamp, setNextTimestamp } from "../helper/time"

describe("PerpdexMarket fee", () => {
    let loadFixture = waffle.createFixtureLoader(waffle.provider.getWallets())
    let fixture

    let market: TestPerpdexMarket
    let owner: Wallet
    let alice: Wallet
    let exchange: Wallet

    const Q96 = BigNumber.from(2).pow(96)

    beforeEach(async () => {
        fixture = await loadFixture(createPerpdexMarketFixture())
        market = fixture.perpdexMarket
        owner = fixture.owner
        alice = fixture.alice
        exchange = fixture.exchange
    })

    describe("feeRatio", () => {
        ;[
            {
                title: "zero",
                poolFeeInfo: {
                    atrX96: 0,
                    currentHighX96: 0,
                    currentLowX96: 0,
                },
                poolFeeConfig: {
                    fixedFeeRatio: 0,
                    atrFeeRatio: 0,
                    atrEmaBlocks: 0,
                },
                priceLimitNormalOrderRatio: 10e4,
                feeRatio: 0,
            },
            {
                title: "fixed fee",
                poolFeeInfo: {
                    atrX96: 0,
                    currentHighX96: 0,
                    currentLowX96: 0,
                },
                poolFeeConfig: {
                    fixedFeeRatio: 1e4,
                    atrFeeRatio: 0,
                    atrEmaBlocks: 0,
                },
                priceLimitNormalOrderRatio: 10e4,
                feeRatio: 1e4,
            },
            {
                title: "price limit",
                poolFeeInfo: {
                    atrX96: 0,
                    currentHighX96: 0,
                    currentLowX96: 0,
                },
                poolFeeConfig: {
                    fixedFeeRatio: 1e4,
                    atrFeeRatio: 0,
                    atrEmaBlocks: 0,
                },
                priceLimitNormalOrderRatio: 1e4,
                feeRatio: 5e3,
            },
            {
                title: "adaptive no memory",
                poolFeeInfo: {
                    atrX96: 0,
                    currentHighX96: Q96.mul(2).mul(101).div(100),
                    currentLowX96: Q96.mul(2),
                },
                poolFeeConfig: {
                    fixedFeeRatio: 0,
                    atrFeeRatio: 1e6,
                    atrEmaBlocks: 0,
                },
                priceLimitNormalOrderRatio: 10e4,
                feeRatio: 1e4 - 1, // rounding error
            },
            {
                title: "adaptive no memory 2",
                poolFeeInfo: {
                    atrX96: 0,
                    currentHighX96: Q96.mul(2).mul(101).div(100),
                    currentLowX96: Q96.mul(2),
                },
                poolFeeConfig: {
                    fixedFeeRatio: 0,
                    atrFeeRatio: 2e6,
                    atrEmaBlocks: 0,
                },
                priceLimitNormalOrderRatio: 10e4,
                feeRatio: 2e4 - 1, // rounding error
            },
            {
                title: "adaptive ema",
                poolFeeInfo: {
                    atrX96: 0,
                    currentHighX96: Q96.mul(2).mul(101).div(100),
                    currentLowX96: Q96.mul(2),
                },
                poolFeeConfig: {
                    fixedFeeRatio: 0,
                    atrFeeRatio: 1e6,
                    atrEmaBlocks: 1,
                },
                priceLimitNormalOrderRatio: 10e4,
                feeRatio: 5e3 - 1, // rounding error
            },
            {
                title: "adaptive ema 2",
                poolFeeInfo: {
                    atrX96: Q96.mul(1).div(100),
                    currentHighX96: Q96.mul(2).mul(101).div(100),
                    currentLowX96: Q96.mul(2),
                },
                poolFeeConfig: {
                    fixedFeeRatio: 0,
                    atrFeeRatio: 1e6,
                    atrEmaBlocks: 1,
                },
                priceLimitNormalOrderRatio: 10e4,
                feeRatio: 1e4 - 1, // rounding error
            },
            {
                title: "adaptive ema 3",
                poolFeeInfo: {
                    atrX96: 0,
                    currentHighX96: Q96.mul(2).mul(101).div(100),
                    currentLowX96: Q96.mul(2),
                },
                poolFeeConfig: {
                    fixedFeeRatio: 0,
                    atrFeeRatio: 1e6,
                    atrEmaBlocks: 3,
                },
                priceLimitNormalOrderRatio: 10e4,
                feeRatio: 25e2 - 1, // rounding error
            },
            {
                title: "adaptive ema 4",
                poolFeeInfo: {
                    atrX96: Q96.mul(1).div(100),
                    currentHighX96: Q96.mul(2),
                    currentLowX96: Q96.mul(2),
                },
                poolFeeConfig: {
                    fixedFeeRatio: 0,
                    atrFeeRatio: 1e6,
                    atrEmaBlocks: 3,
                },
                priceLimitNormalOrderRatio: 10e4,
                feeRatio: 75e2 - 1, // rounding error
            },
            {
                title: "adaptive ema + fixed fee",
                poolFeeInfo: {
                    atrX96: 0,
                    currentHighX96: Q96.mul(2).mul(101).div(100),
                    currentLowX96: Q96.mul(2),
                },
                poolFeeConfig: {
                    fixedFeeRatio: 1e4,
                    atrFeeRatio: 1e6,
                    atrEmaBlocks: 1,
                },
                priceLimitNormalOrderRatio: 10e4,
                feeRatio: 15e3 - 1, // rounding error
            },
            {
                title: "adaptive no memory too large",
                poolFeeInfo: {
                    atrX96: 0,
                    currentHighX96: Q96,
                    currentLowX96: 1,
                },
                poolFeeConfig: {
                    fixedFeeRatio: 0,
                    atrFeeRatio: 1e6,
                    atrEmaBlocks: 0,
                },
                priceLimitNormalOrderRatio: 10e4,
                feeRatio: 5e4,
            },
        ].forEach(test => {
            describe(test.title, () => {
                ;[-1, 0, 1].forEach(async referenceTimestamp => {
                    const title = {
                        "-1": "past",
                        "0": "current",
                        "1": "future",
                    }[referenceTimestamp]

                    it(title, async () => {
                        const currentTimestamp = await getTimestamp()
                        const nextTimeStamp = currentTimestamp + 1000
                        await market.setPoolFeeInfo({
                            ...test.poolFeeInfo,
                            referenceTimestamp: nextTimeStamp + referenceTimestamp,
                        })
                        await market.setPoolFeeConfig(test.poolFeeConfig)
                        await market.setPriceLimitConfig({
                            normalOrderRatio: test.priceLimitNormalOrderRatio,
                            liquidationRatio: test.priceLimitNormalOrderRatio,
                            emaNormalOrderRatio: test.priceLimitNormalOrderRatio,
                            emaLiquidationRatio: test.priceLimitNormalOrderRatio,
                            emaSec: 0,
                        })
                        await setNextTimestamp(nextTimeStamp, true)

                        expect(await market.feeRatio()).to.eq(test.feeRatio)
                    })
                })
            })
        })
    })

    describe("update after swap", () => {
        it("normal", async () => {
            const currentTimestamp = await getTimestamp()
            const nextTimeStamp = currentTimestamp + 1000
            await market.connect(exchange).addLiquidity(10000, 10000)
            await market.setPoolFeeInfo({
                atrX96: 0,
                referenceTimestamp: nextTimeStamp - 1,
                currentHighX96: 1,
                currentLowX96: 1,
            })
            await market.setPoolFeeConfig({
                fixedFeeRatio: 0,
                atrFeeRatio: 1e6,
                atrEmaBlocks: 1,
            })
            await market.setPriceLimitConfig({
                normalOrderRatio: 1e5,
                liquidationRatio: 1e5,
                emaNormalOrderRatio: 1e5,
                emaLiquidationRatio: 1e5,
                emaSec: 0,
            })
            await setNextTimestamp(nextTimeStamp)
            await market.connect(exchange).swap(false, true, 100, false)

            const info = await market.poolFeeInfo()
            expect(info.atrX96).to.eq(0)
            expect(info.referenceTimestamp).to.eq(nextTimeStamp)
            expect(info.currentHighX96).to.eq(await market.getShareMarkPriceX96())
            expect(info.currentHighX96).to.eq(BigNumber.from("80820567760233290545883637854"))
            expect(info.currentLowX96).to.eq(Q96)
        })
    })
})
