import { expect } from "chai"
import { waffle } from "hardhat"
import { TestPerpdexExchange, TestPerpdexMarket } from "../../typechain"
import { createPerpdexExchangeFixture } from "./fixtures"
import { BigNumber, Wallet } from "ethers"

describe("PerpdexExchange removeLiquidity", () => {
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
        fixture = await loadFixture(createPerpdexExchangeFixture())
        exchange = fixture.perpdexExchange
        market = fixture.perpdexMarket
        owner = fixture.owner
        alice = fixture.alice
        bob = fixture.bob

        await exchange.connect(owner).setImRatio(10e4)
        await exchange.connect(owner).setMmRatio(5e4)

        await market.connect(owner).setPoolFeeRatio(0)
        await market.connect(owner).setFundingMaxPremiumRatio(0)
        await exchange.connect(owner).setIsMarketAllowed(market.address, true)

        await exchange.setAccountInfo(
            owner.address,
            {
                collateralBalance: 100000,
            },
            [],
        )

        await exchange.connect(owner).addLiquidity({
            market: market.address,
            base: 10000,
            quote: 10000,
            minBase: 0,
            minQuote: 0,
            deadline: deadline,
        })
    })

    describe("various cases", () => {
        ;[
            {
                title: "remove",
                liquidity: 50,
                minBase: 50,
                minQuote: 50,
                collateralBalance: 10,
                takerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                makerInfo: {
                    baseDebtShare: 50,
                    quoteDebt: 50,
                    liquidity: 100,
                    cumBaseSharePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                },
                outputBase: 50,
                outputQuote: 50,
                outputTakerBase: 25,
                outputTakerQuote: 25,
                afterCollateralBalance: 60,
                afterTakerInfo: {
                    baseBalanceShare: 25,
                    quoteBalance: -25,
                },
                afterMakerInfo: {
                    baseDebtShare: 25,
                    quoteDebt: 25,
                    liquidity: 50,
                    cumBaseSharePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                },
            },
            {
                title: "deleverage",
                liquidity: 1,
                minBase: 0,
                minQuote: 0,
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                makerInfo: {
                    baseDebtShare: 0,
                    quoteDebt: 0,
                    liquidity: 2,
                    cumBaseSharePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                },
                poolInfo: {
                    base: 10000,
                    quote: 10000,
                    totalLiquidity: 10000,
                    cumBasePerLiquidityX96: Q96.mul(10),
                    cumQuotePerLiquidityX96: Q96.mul(20),
                    baseBalancePerShareX96: Q96,
                },
                outputBase: 1,
                outputQuote: 1,
                outputTakerBase: 11,
                outputTakerQuote: 21,
                afterCollateralBalance: 132,
                afterTakerInfo: {
                    baseBalanceShare: 11,
                    quoteBalance: -11,
                },
                afterMakerInfo: {
                    baseDebtShare: -10,
                    quoteDebt: -20,
                    liquidity: 1,
                    cumBaseSharePerLiquidityX96: Q96.mul(10),
                    cumQuotePerLiquidityX96: Q96.mul(20),
                },
                cumBaseSharePerLiquidityX96: Q96.mul(10),
                cumQuotePerLiquidityX96: Q96.mul(20),
            },
            {
                title: "minBase condition",
                liquidity: 100,
                minBase: 101,
                minQuote: 0,
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                makerInfo: {
                    baseDebtShare: 0,
                    quoteDebt: 0,
                    liquidity: 100,
                    cumBaseSharePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                },
                revertedWith: "ML_RL: too small output base",
            },
            {
                title: "minQuote condition",
                liquidity: 100,
                minBase: 0,
                minQuote: 101,
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                makerInfo: {
                    baseDebtShare: 0,
                    quoteDebt: 0,
                    liquidity: 100,
                    cumBaseSharePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                },
                revertedWith: "ML_RL: too small output base",
            },
            {
                title: "market disallowed",
                liquidity: 100,
                minBase: 0,
                minQuote: 0,
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                makerInfo: {
                    baseDebtShare: 100,
                    quoteDebt: 100,
                    liquidity: 100,
                    cumBaseSharePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                },
                isMarketAllowed: false,
                revertedWith: "PE_CMA: market not allowed",
            },
            {
                title: "liquidation",
                notSelf: true,
                liquidity: 50,
                minBase: 50,
                minQuote: 50,
                collateralBalance: 4,
                takerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                makerInfo: {
                    baseDebtShare: 0,
                    quoteDebt: 200,
                    liquidity: 100,
                    cumBaseSharePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                },
                outputBase: 50,
                outputQuote: 50,
                outputTakerBase: 50,
                outputTakerQuote: -50,
                isLiquidation: true,
                afterCollateralBalance: 4,
                afterTakerInfo: {
                    baseBalanceShare: 50,
                    quoteBalance: -50,
                },
                afterMakerInfo: {
                    baseDebtShare: 0,
                    quoteDebt: 100,
                    liquidity: 50,
                    cumBaseSharePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                },
            },
            {
                title: "liquidation self",
                notSelf: false,
                liquidity: 50,
                minBase: 50,
                minQuote: 50,
                collateralBalance: 4,
                takerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                makerInfo: {
                    baseDebtShare: 0,
                    quoteDebt: 200,
                    liquidity: 100,
                    cumBaseSharePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                },
                outputBase: 50,
                outputQuote: 50,
                outputTakerBase: 50,
                outputTakerQuote: -50,
                isLiquidation: true,
                afterCollateralBalance: 4,
                afterTakerInfo: {
                    baseBalanceShare: 50,
                    quoteBalance: -50,
                },
                afterMakerInfo: {
                    baseDebtShare: 0,
                    quoteDebt: 100,
                    liquidity: 50,
                    cumBaseSharePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                },
            },
            {
                title: "not liquidatable when enough mm",
                notSelf: true,
                liquidity: 50,
                minBase: 50,
                minQuote: 50,
                collateralBalance: 5,
                takerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                makerInfo: {
                    baseDebtShare: 0,
                    quoteDebt: 200,
                    liquidity: 100,
                    cumBaseSharePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                },
                revertedWith: "ML_RL: enough mm",
            },
        ].forEach(test => {
            it(test.title, async () => {
                await exchange.setAccountInfo(
                    alice.address,
                    {
                        collateralBalance: test.collateralBalance,
                    },
                    [market.address],
                )
                await exchange.setTakerInfo(alice.address, market.address, test.takerInfo)
                await exchange.setMakerInfo(alice.address, market.address, test.makerInfo)

                if (test.isMarketAllowed !== void 0) {
                    await exchange.connect(owner).setIsMarketAllowed(market.address, test.isMarketAllowed)
                }

                if (test.poolInfo) {
                    await market.setPoolInfo(test.poolInfo)
                }

                const res = expect(
                    exchange.connect(test.notSelf ? bob : alice).removeLiquidity({
                        trader: alice.address,
                        market: market.address,
                        liquidity: test.liquidity,
                        minBase: test.minBase,
                        minQuote: test.minQuote,
                        deadline: deadline,
                    }),
                )

                if (test.revertedWith === void 0) {
                    const sharePrice = test.poolInfo ? Q96.mul(test.poolInfo.quote).div(test.poolInfo.base) : Q96

                    await res.to
                        .emit(exchange, "LiquidityRemoved")
                        .withArgs(
                            alice.address,
                            market.address,
                            test.isLiquidation
                                ? (test.notSelf ? bob : alice).address
                                : hre.ethers.constants.AddressZero,
                            test.outputBase,
                            test.outputQuote,
                            test.liquidity,
                            test.cumBaseSharePerLiquidityX96 || 0,
                            test.cumQuotePerLiquidityX96 || 0,
                            test.outputTakerBase,
                            test.outputTakerQuote,
                            test.afterCollateralBalance - test.collateralBalance,
                            test.poolInfo ? test.poolInfo.baseBalancePerShareX96 : Q96,
                            sharePrice,
                        )

                    const accountInfo = await exchange.accountInfos(alice.address)
                    expect(accountInfo.collateralBalance).to.eq(test.afterCollateralBalance)

                    const takerInfo = await exchange.getTakerInfo(alice.address, market.address)
                    expect(takerInfo.baseBalanceShare).to.eq(test.afterTakerInfo.baseBalanceShare)
                    expect(takerInfo.quoteBalance).to.eq(test.afterTakerInfo.quoteBalance)

                    const makerInfo = await exchange.getMakerInfo(alice.address, market.address)
                    expect(makerInfo.baseDebtShare).to.eq(test.afterMakerInfo.baseDebtShare)
                    expect(makerInfo.quoteDebt).to.eq(test.afterMakerInfo.quoteDebt)
                    expect(makerInfo.liquidity).to.eq(test.afterMakerInfo.liquidity)
                    expect(makerInfo.cumBaseSharePerLiquidityX96).to.eq(test.afterMakerInfo.cumBaseSharePerLiquidityX96)
                    expect(makerInfo.cumQuotePerLiquidityX96).to.eq(test.afterMakerInfo.cumQuotePerLiquidityX96)
                } else {
                    await res.to.revertedWith(test.revertedWith)
                }
            })
        })
    })
})
