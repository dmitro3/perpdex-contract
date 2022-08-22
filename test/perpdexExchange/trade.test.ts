import { expect } from "chai"
import { waffle } from "hardhat"
import { TestPerpdexExchange, TestPerpdexMarket } from "../../typechain"
import { createPerpdexExchangeFixture } from "./fixtures"
import { BigNumber, Wallet } from "ethers"
import { getTimestamp, setNextTimestamp } from "../helper/time"
import { MockContract } from "ethereum-waffle"
import { LimitOrderType, MarketStatus } from "../helper/types"

describe("PerpdexExchange trade", () => {
    let loadFixture = waffle.createFixtureLoader(waffle.provider.getWallets())
    let fixture

    let exchange: TestPerpdexExchange
    let market: TestPerpdexMarket
    let owner: Wallet
    let alice: Wallet
    let bob: Wallet
    let priceFeed: MockContract

    const Q96 = BigNumber.from(2).pow(96)
    const deadline = Q96

    beforeEach(async () => {
        fixture = await loadFixture(createPerpdexExchangeFixture({ isMarketAllowed: true, initPool: true }))
        exchange = fixture.perpdexExchange
        market = fixture.perpdexMarket
        owner = fixture.owner
        alice = fixture.alice
        bob = fixture.bob
        priceFeed = fixture.priceFeed

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
                amount: 100,
                oppositeAmountBound: 0,
                protocolFeeRatio: 0,
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                outputBase: 99,
                outputQuote: -100,
                afterCollateralBalance: 100,
                afterTakerInfo: {
                    baseBalanceShare: 99,
                    quoteBalance: -100,
                },
                protocolFee: 0,
                insuranceFund: 0,
            },
            {
                title: "short",
                isBaseToQuote: true,
                isExactInput: true,
                amount: 100,
                oppositeAmountBound: 0,
                protocolFeeRatio: 0,
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                outputBase: -100,
                outputQuote: 99,
                afterCollateralBalance: 100,
                afterTakerInfo: {
                    baseBalanceShare: -100,
                    quoteBalance: 99,
                },
                protocolFee: 0,
                insuranceFund: 0,
            },
            {
                title: "long exact output",
                isBaseToQuote: false,
                isExactInput: false,
                amount: 100,
                oppositeAmountBound: 102,
                protocolFeeRatio: 0,
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                outputBase: 100,
                outputQuote: -102,
                afterCollateralBalance: 100,
                afterTakerInfo: {
                    baseBalanceShare: 100,
                    quoteBalance: -102,
                },
                protocolFee: 0,
                insuranceFund: 0,
            },
            {
                title: "short exact output",
                isBaseToQuote: true,
                isExactInput: false,
                amount: 100,
                oppositeAmountBound: 102,
                protocolFeeRatio: 0,
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                outputBase: -102,
                outputQuote: 100,
                afterCollateralBalance: 100,
                afterTakerInfo: {
                    baseBalanceShare: -102,
                    quoteBalance: 100,
                },
                protocolFee: 0,
                insuranceFund: 0,
            },
            {
                title: "protocol fee long",
                isBaseToQuote: false,
                isExactInput: true,
                amount: 100,
                oppositeAmountBound: 0,
                protocolFeeRatio: 1e4,
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                outputBase: 98,
                outputQuote: -100,
                afterCollateralBalance: 100,
                afterTakerInfo: {
                    baseBalanceShare: 98,
                    quoteBalance: -100,
                },
                protocolFee: 1,
                insuranceFund: 0,
            },
            {
                title: "protocol fee short",
                isBaseToQuote: true,
                isExactInput: true,
                amount: 200,
                oppositeAmountBound: 0,
                protocolFeeRatio: 1e4,
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                outputBase: -200,
                outputQuote: 195,
                afterCollateralBalance: 100,
                afterTakerInfo: {
                    baseBalanceShare: -200,
                    quoteBalance: 195,
                },
                protocolFee: 1,
                insuranceFund: 0,
            },
            {
                title: "close long all",
                isBaseToQuote: true,
                isExactInput: true,
                amount: 100,
                oppositeAmountBound: 0,
                protocolFeeRatio: 0,
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: 100,
                    quoteBalance: -50,
                },
                outputBase: -100,
                outputQuote: 99,
                afterCollateralBalance: 149,
                afterTakerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                protocolFee: 0,
                insuranceFund: 0,
            },
            {
                title: "close long partial",
                isBaseToQuote: true,
                isExactInput: true,
                amount: 40,
                oppositeAmountBound: 0,
                protocolFeeRatio: 0,
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: 100,
                    quoteBalance: -50,
                },
                outputBase: -40,
                outputQuote: 39,
                afterCollateralBalance: 119,
                afterTakerInfo: {
                    baseBalanceShare: 60,
                    quoteBalance: -30,
                },
                protocolFee: 0,
                insuranceFund: 0,
            },
            {
                title: "flip long",
                isBaseToQuote: true,
                isExactInput: true,
                amount: 200,
                oppositeAmountBound: 0,
                protocolFeeRatio: 0,
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: 100,
                    quoteBalance: -50,
                },
                outputBase: -200,
                outputQuote: 196,
                afterCollateralBalance: 148,
                afterTakerInfo: {
                    baseBalanceShare: -100,
                    quoteBalance: 98,
                },
                protocolFee: 0,
                insuranceFund: 0,
            },
            {
                title: "long with maker position",
                isBaseToQuote: false,
                isExactInput: true,
                amount: 100,
                oppositeAmountBound: 0,
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
                outputBase: 99,
                outputQuote: -100,
                afterCollateralBalance: 100,
                afterTakerInfo: {
                    baseBalanceShare: 99,
                    quoteBalance: -100,
                },
                protocolFee: 0,
                insuranceFund: 0,
            },
            {
                title: "not liquidatable because enough mm",
                notSelf: true,
                isBaseToQuote: false,
                isExactInput: true,
                amount: 100,
                oppositeAmountBound: 0,
                protocolFeeRatio: 0,
                collateralBalance: 5,
                takerInfo: {
                    baseBalanceShare: 100,
                    quoteBalance: -100,
                },
                revertedWith: "TL_VT: enough mm",
                revertedWithDry: "TL_VT: enough mm",
            },
            {
                title: "not liquidatable because maker position exist",
                notSelf: true,
                isBaseToQuote: true,
                isExactInput: true,
                amount: 100,
                oppositeAmountBound: 0,
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
                revertedWith: "TL_VT: no maker when liquidation",
                afterCollateralBalance: 3,
                afterTakerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
            },
            {
                title: "not liquidatable because ask limit order exist",
                notSelf: true,
                isBaseToQuote: true,
                isExactInput: true,
                amount: 100,
                oppositeAmountBound: 0,
                protocolFeeRatio: 0,
                collateralBalance: 4,
                takerInfo: {
                    baseBalanceShare: 100,
                    quoteBalance: -100,
                },
                orders: [
                    {
                        isBid: false,
                        base: 1,
                        priceX96: Q96,
                    },
                ],
                revertedWith: "TL_VT: no ask when liquidation",
                afterCollateralBalance: 3,
                afterTakerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
            },
            {
                title: "not liquidatable because bid limit order exist",
                notSelf: true,
                isBaseToQuote: true,
                isExactInput: true,
                amount: 100,
                oppositeAmountBound: 0,
                protocolFeeRatio: 0,
                collateralBalance: 4,
                takerInfo: {
                    baseBalanceShare: 100,
                    quoteBalance: -100,
                },
                orders: [
                    {
                        isBid: true,
                        base: 1,
                        priceX96: Q96,
                    },
                ],
                revertedWith: "TL_VT: no bid when liquidation",
                afterCollateralBalance: 3,
                afterTakerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
            },
            {
                title: "open is not allowed when liquidation",
                notSelf: true,
                isBaseToQuote: false,
                isExactInput: true,
                amount: 100,
                oppositeAmountBound: 0,
                protocolFeeRatio: 0,
                collateralBalance: 4,
                takerInfo: {
                    baseBalanceShare: 100,
                    quoteBalance: -100,
                },
                revertedWith: "TL_OP: no open when liquidation",
                afterCollateralBalance: 4,
                afterTakerInfo: {
                    baseBalanceShare: 199,
                    quoteBalance: -200,
                },
            },
            {
                title: "open is not allowed when market disallowed",
                marketStatus: MarketStatus.NotAllowed,
                isBaseToQuote: false,
                isExactInput: true,
                amount: 100,
                oppositeAmountBound: 0,
                protocolFeeRatio: 0,
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                revertedWith: "PE_CMO: market not open",
                revertedWithDry: "PE_CMO: market not open",
            },
            {
                title: "open is not allowed when market closed",
                marketStatus: MarketStatus.Closed,
                isBaseToQuote: false,
                isExactInput: true,
                amount: 100,
                oppositeAmountBound: 0,
                protocolFeeRatio: 0,
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                revertedWith: "PE_CMO: market not open",
                revertedWithDry: "PE_CMO: market not open",
            },
            {
                title: "flip is not allowed when market closed",
                marketStatus: MarketStatus.Closed,
                isBaseToQuote: true,
                isExactInput: true,
                amount: 200,
                oppositeAmountBound: 0,
                protocolFeeRatio: 0,
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: 100,
                    quoteBalance: -50,
                },
                revertedWith: "PE_CMO: market not open",
                revertedWithDry: "PE_CMO: market not open",
            },
            {
                title: "close all is not allowed when market closed",
                marketStatus: MarketStatus.Closed,
                isBaseToQuote: true,
                isExactInput: true,
                amount: 100,
                oppositeAmountBound: 0,
                protocolFeeRatio: 0,
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: 100,
                    quoteBalance: -50,
                },
                revertedWith: "PE_CMO: market not open",
                revertedWithDry: "PE_CMO: market not open",
            },
            {
                title: "close partial is not allowed when market closed",
                marketStatus: MarketStatus.Closed,
                isBaseToQuote: true,
                isExactInput: true,
                amount: 40,
                oppositeAmountBound: 0,
                protocolFeeRatio: 0,
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: 100,
                    quoteBalance: -50,
                },
                revertedWith: "PE_CMO: market not open",
                revertedWithDry: "PE_CMO: market not open",
            },
            {
                title: "not enough im",
                isBaseToQuote: false,
                isExactInput: true,
                amount: 100,
                oppositeAmountBound: 0,
                protocolFeeRatio: 0,
                collateralBalance: 5,
                takerInfo: {
                    baseBalanceShare: 100,
                    quoteBalance: -100,
                },
                revertedWith: "TL_OP: not enough im",
                afterCollateralBalance: 5,
                afterTakerInfo: {
                    baseBalanceShare: 199,
                    quoteBalance: -200,
                },
            },
            {
                title: "price limit normal order",
                isBaseToQuote: false,
                isExactInput: true,
                amount: 250,
                oppositeAmountBound: 0,
                protocolFeeRatio: 0,
                collateralBalance: 5,
                takerInfo: {
                    baseBalanceShare: 100,
                    quoteBalance: -100,
                },
                revertedWith: "PM_S: too large amount",
                revertedWithDry: "PM_PS: too large amount",
            },
            {
                title: "price limit liquidation",
                notSelf: true,
                isBaseToQuote: false,
                isExactInput: true,
                amount: 500,
                oppositeAmountBound: 0,
                protocolFeeRatio: 0,
                collateralBalance: 40,
                takerInfo: {
                    baseBalanceShare: -1000,
                    quoteBalance: 1000,
                },
                revertedWith: "PM_S: too large amount",
                revertedWithDry: "PM_PS: too large amount",
            },
            {
                title: "liquidation",
                notSelf: true,
                isBaseToQuote: true,
                isExactInput: true,
                amount: 100,
                oppositeAmountBound: 0,
                protocolFeeRatio: 0,
                collateralBalance: -49,
                takerInfo: {
                    baseBalanceShare: 100,
                    quoteBalance: -50,
                },
                outputBase: -100,
                outputQuote: 99,
                liquidation: true,
                liquidationReward: 1,
                afterCollateralBalance: 0 - 4,
                afterTakerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                protocolFee: 0,
                insuranceFund: 3,
            },
            {
                title: "liquidation self",
                notSelf: false,
                isBaseToQuote: true,
                isExactInput: true,
                amount: 100,
                oppositeAmountBound: 0,
                protocolFeeRatio: 0,
                collateralBalance: -49,
                takerInfo: {
                    baseBalanceShare: 100,
                    quoteBalance: -50,
                },
                outputBase: -100,
                outputQuote: 99,
                liquidation: true,
                liquidationReward: 1,
                afterCollateralBalance: 0 - 4 + 1,
                afterTakerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                protocolFee: 0,
                insuranceFund: 3,
            },
            {
                title: "long opposite amount condition",
                isBaseToQuote: false,
                isExactInput: true,
                amount: 100,
                oppositeAmountBound: 100,
                protocolFeeRatio: 0,
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                revertedWith: "TL_VS: too small opposite amount",
                revertedWithDry: "TL_VS: too small opposite amount",
            },
            {
                title: "long exact output opposite amount condition",
                isBaseToQuote: false,
                isExactInput: false,
                amount: 100,
                oppositeAmountBound: 101,
                protocolFeeRatio: 0,
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                revertedWith: "TL_VS: too large opposite amount",
                revertedWithDry: "TL_VS: too large opposite amount",
            },
            {
                title: "long. funding not affect calc",
                isBaseToQuote: false,
                isExactInput: true,
                amount: 100,
                oppositeAmountBound: 0,
                protocolFeeRatio: 0,
                collateralBalance: 100,
                funding: true,
                takerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                outputBase: 99,
                outputQuote: -100,
                afterCollateralBalance: 100,
                afterTakerInfo: {
                    baseBalanceShare: 99,
                    quoteBalance: -100,
                },
                protocolFee: 0,
                insuranceFund: 0,
                baseBalancePerShareX96: BigNumber.from("71305346262837903834189555303"),
                sharePrice: BigNumber.from("72746513020621865777487935815"),
            },
        ].forEach(test => {
            describe(test.title, () => {
                beforeEach(async () => {
                    await exchange.connect(owner).setProtocolFeeRatio(test.protocolFeeRatio)

                    // avoid not enough im temporarily
                    if ((test.orders || []).length > 0) {
                        await exchange.setAccountInfo(
                            alice.address,
                            {
                                collateralBalance: 100000,
                            },
                            [market.address],
                        )
                        for (let i = 0; i < test.orders.length; i++) {
                            await exchange.connect(alice).createLimitOrder({
                                market: market.address,
                                deadline: deadline,
                                limitOrderType: LimitOrderType.PostOnly,
                                ...test.orders[i],
                            })
                        }
                    }

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

                it("mutable", async () => {
                    if (test.funding) {
                        await market.connect(owner).setFundingMaxPremiumRatio(1e5)
                        await market.connect(owner).setFundingRolloverSec(3600)
                        await priceFeed.mock.decimals.returns(18)

                        await priceFeed.mock.getPrice.returns(1)
                        const currentTimestamp = await getTimestamp()
                        await market.setFundingInfo({
                            prevIndexPriceBase: BigNumber.from(10).pow(18),
                            prevIndexPriceQuote: 1,
                            prevIndexPriceTimestamp: currentTimestamp + 1000,
                        })
                        await setNextTimestamp(currentTimestamp + 1000 + 3600)
                    }

                    const res = expect(
                        exchange.connect(test.notSelf ? bob : alice).trade({
                            trader: alice.address,
                            market: market.address,
                            isBaseToQuote: test.isBaseToQuote,
                            isExactInput: test.isExactInput,
                            amount: test.amount,
                            oppositeAmountBound: test.oppositeAmountBound,
                            deadline: deadline,
                        }),
                    )

                    if (test.revertedWith === void 0) {
                        const sharePrice = Q96.mul(10000 - test.outputQuote - test.protocolFee).div(
                            10000 - test.outputBase,
                        )

                        if (test.liquidation) {
                            await res.to
                                .emit(exchange, "PositionLiquidated")
                                .withArgs(
                                    alice.address,
                                    market.address,
                                    (test.notSelf ? bob : alice).address,
                                    test.outputBase,
                                    test.outputQuote,
                                    test.afterCollateralBalance -
                                        test.collateralBalance +
                                        test.insuranceFund +
                                        (test.notSelf ? test.liquidationReward : 0),
                                    test.protocolFee,
                                    Q96,
                                    sharePrice,
                                    test.liquidationReward + test.insuranceFund,
                                    test.liquidationReward,
                                    test.insuranceFund,
                                )
                        } else {
                            await res.to
                                .emit(exchange, "PositionChanged")
                                .withArgs(
                                    alice.address,
                                    market.address,
                                    test.outputBase,
                                    test.outputQuote,
                                    test.afterCollateralBalance - test.collateralBalance,
                                    test.protocolFee,
                                    test.baseBalancePerShareX96 || Q96,
                                    test.sharePrice || sharePrice,
                                )
                        }

                        const accountInfo = await exchange.accountInfos(alice.address)
                        expect(accountInfo.vaultInfo.collateralBalance).to.eq(test.afterCollateralBalance)

                        if (test.notSelf) {
                            const accountInfoBob = await exchange.accountInfos(bob.address)
                            expect(accountInfoBob.vaultInfo.collateralBalance).to.eq(test.liquidationReward)
                        }

                        const takerInfo = await exchange.getTakerInfo(alice.address, market.address)
                        expect(takerInfo.baseBalanceShare).to.eq(test.afterTakerInfo.baseBalanceShare)
                        expect(takerInfo.quoteBalance).to.eq(test.afterTakerInfo.quoteBalance)

                        const fundInfo = await exchange.insuranceFundInfo()
                        expect(fundInfo[0]).to.eq(test.insuranceFund + 10000)
                        expect(fundInfo[1]).to.eq(0)
                        expect(await exchange.protocolInfo()).to.eq(test.protocolFee + 10000)
                    } else {
                        await res.to.revertedWith(test.revertedWith)
                    }
                })

                if (!test.liquidation) {
                    it("dry", async () => {
                        const call = exchange.previewTrade({
                            trader: alice.address,
                            market: market.address,
                            caller: (test.notSelf ? bob : alice).address,
                            isBaseToQuote: test.isBaseToQuote,
                            isExactInput: test.isExactInput,
                            amount: test.amount,
                            oppositeAmountBound: test.oppositeAmountBound,
                        })

                        if (test.revertedWithDry === void 0) {
                            const oppositeAmount = await call
                            let base, quote
                            if (test.isExactInput) {
                                if (test.isBaseToQuote) {
                                    base = -test.amount
                                    quote = oppositeAmount
                                } else {
                                    base = oppositeAmount
                                    quote = -test.amount
                                }
                            } else {
                                if (test.isBaseToQuote) {
                                    base = oppositeAmount.mul(-1)
                                    quote = test.amount
                                } else {
                                    base = test.amount
                                    quote = oppositeAmount.mul(-1)
                                }
                            }
                            expect(base).to.eq(test.afterTakerInfo.baseBalanceShare - test.takerInfo.baseBalanceShare)
                            expect(quote).to.eq(
                                test.afterTakerInfo.quoteBalance -
                                    test.takerInfo.quoteBalance +
                                    test.afterCollateralBalance -
                                    test.collateralBalance,
                            )
                        } else {
                            await expect(call).to.revertedWith(test.revertedWithDry)
                        }
                    })
                }
            })
        })
    })
})
