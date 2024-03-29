import { expect } from "chai"
import { waffle } from "hardhat"
import { TestPerpdexExchange, TestPerpdexMarket } from "../../typechain"
import { createPerpdexExchangeFixture } from "./fixtures"
import { BigNumber, Wallet } from "ethers"
import { MarketStatus } from "../helper/types"

describe("PerpdexExchange maxTrade", () => {
    let loadFixture = waffle.createFixtureLoader(waffle.provider.getWallets())
    let fixture

    let exchange: TestPerpdexExchange
    let market: TestPerpdexMarket
    let owner: Wallet
    let alice: Wallet
    let bob: Wallet

    const Q96 = BigNumber.from(2).pow(96)
    const deadline = Q96

    beforeEach(async () => {
        fixture = await loadFixture(createPerpdexExchangeFixture({ isMarketAllowed: true, initPool: true }))
        exchange = fixture.perpdexExchange
        market = fixture.perpdexMarket
        owner = fixture.owner
        alice = fixture.alice
        bob = fixture.bob

        await exchange.connect(owner).setImRatio(10e4)
        await exchange.connect(owner).setMmRatio(5e4)
        await exchange.connect(owner).setLiquidationRewardConfig({
            rewardRatio: 25e4,
            smoothEmaTime: 1,
        })

        await market.connect(owner).setPriceLimitConfig({
            normalOrderRatio: 5e4,
            liquidationRatio: 10e4,
            emaNormalOrderRatio: 5e4,
            emaLiquidationRatio: 10e4,
            emaSec: 300,
        })

        await exchange.setInsuranceFundInfo({ balance: 10000, liquidationRewardBalance: 0 })
        await exchange.setProtocolInfo({ protocolFee: 10000 })

        await exchange.setAccountInfo(
            owner.address,
            {
                collateralBalance: 100000,
            },
            [],
        )
    })

    describe("various cases", () => {
        ;[
            {
                title: "long",
                isBaseToQuote: false,
                isExactInput: true,
                protocolFeeRatio: 0,
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                maxAmount: 246,
            },
            {
                title: "short",
                isBaseToQuote: true,
                isExactInput: true,
                protocolFeeRatio: 0,
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                maxAmount: 259,
            },
            {
                title: "long exact output",
                isBaseToQuote: false,
                isExactInput: false,
                protocolFeeRatio: 0,
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                maxAmount: 240,
            },
            {
                title: "short exact output",
                isBaseToQuote: true,
                isExactInput: false,
                protocolFeeRatio: 0,
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                maxAmount: 252,
            },
            {
                title: "long with maker position",
                isBaseToQuote: false,
                isExactInput: true,
                protocolFeeRatio: 0,
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                makerInfo: {
                    liquidity: 1,
                    cumBaseSharePerLiquidityX96: Q96,
                    cumQuotePerLiquidityX96: Q96,
                },
                maxAmount: 246,
            },
            {
                title: "not liquidatable because enough mm",
                notSelf: true,
                isBaseToQuote: false,
                isExactInput: true,
                protocolFeeRatio: 0,
                collateralBalance: 5,
                takerInfo: {
                    baseBalanceShare: 100,
                    quoteBalance: -100,
                },
                maxAmount: 0,
            },
            {
                title: "ignore condition not liquidatable because maker position exist",
                notSelf: true,
                isBaseToQuote: false,
                isExactInput: true,
                protocolFeeRatio: 0,
                collateralBalance: 4,
                takerInfo: {
                    baseBalanceShare: 100,
                    quoteBalance: -100,
                },
                makerInfo: {
                    liquidity: 1,
                    cumBaseSharePerLiquidityX96: Q96,
                    cumQuotePerLiquidityX96: Q96,
                },
                maxAmount: 488,
            },
            {
                title: "ignore condition that open is not allowed when liquidation",
                notSelf: true,
                isBaseToQuote: false,
                isExactInput: true,
                protocolFeeRatio: 0,
                collateralBalance: 4,
                takerInfo: {
                    baseBalanceShare: 100,
                    quoteBalance: -100,
                },
                maxAmount: 488,
            },
            {
                title: "open is not allowed when market disallowed",
                marketStatus: MarketStatus.NotAllowed,
                isBaseToQuote: false,
                isExactInput: true,
                protocolFeeRatio: 0,
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                maxAmount: 0,
            },
            {
                title: "open is not allowed when market closed",
                marketStatus: MarketStatus.Closed,
                isBaseToQuote: false,
                isExactInput: true,
                protocolFeeRatio: 0,
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                maxAmount: 0,
            },
            {
                title: "ignore condition that not enough im",
                isBaseToQuote: false,
                isExactInput: true,
                protocolFeeRatio: 0,
                collateralBalance: 5,
                takerInfo: {
                    baseBalanceShare: 100,
                    quoteBalance: -100,
                },
                maxAmount: 246,
            },
            {
                title: "liquidation",
                notSelf: true,
                isBaseToQuote: true,
                isExactInput: true,
                protocolFeeRatio: 0,
                collateralBalance: -49,
                takerInfo: {
                    baseBalanceShare: 100,
                    quoteBalance: -50,
                },
                maxAmount: 540,
            },
            {
                title: "liquidation self",
                notSelf: false,
                isBaseToQuote: true,
                isExactInput: true,
                protocolFeeRatio: 0,
                collateralBalance: -49,
                takerInfo: {
                    baseBalanceShare: 100,
                    quoteBalance: -50,
                },
                maxAmount: 540,
            },
        ].forEach(test => {
            describe(test.title, () => {
                beforeEach(async () => {
                    await exchange.connect(owner).setProtocolFeeRatio(test.protocolFeeRatio)

                    await exchange.setAccountInfo(
                        alice.address,
                        {
                            collateralBalance: test.collateralBalance,
                        },
                        [market.address],
                    )

                    await exchange.setTakerInfo(alice.address, market.address, test.takerInfo)
                    if (test.makerInfo) {
                        await exchange.setMakerInfo(alice.address, market.address, test.makerInfo)
                    }

                    if (test.marketStatus !== void 0) {
                        await exchange.connect(owner).setMarketStatusForce(market.address, test.marketStatus)
                    }
                })

                it("dry", async () => {
                    const call = exchange.maxTrade({
                        trader: alice.address,
                        market: market.address,
                        caller: (test.notSelf ? bob : alice).address,
                        isBaseToQuote: test.isBaseToQuote,
                        isExactInput: test.isExactInput,
                    })

                    expect(await call).to.eq(test.maxAmount)
                })
            })
        })
    })
})
