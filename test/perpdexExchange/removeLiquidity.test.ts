import { expect } from "chai"
import { waffle } from "hardhat"
import { TestPerpdexExchange, TestPerpdexMarket } from "../../typechain"
import { createPerpdexExchangeFixture } from "./fixtures"
import { BigNumber, Wallet } from "ethers"
import { getTimestamp, setNextTimestamp } from "../helper/time"
import { MockContract } from "ethereum-waffle"

describe("PerpdexExchange removeLiquidity", () => {
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
                    liquidity: 100,
                    cumBaseSharePerLiquidityX96: Q96.div(2), // debt 50
                    cumQuotePerLiquidityX96: Q96.div(2), // debt 50
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
                    liquidity: 50,
                    cumBaseSharePerLiquidityX96: Q96.div(2), // debt 25
                    cumQuotePerLiquidityX96: Q96.div(2), // debt 25
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
                    liquidity: 1,
                    cumBaseSharePerLiquidityX96: 0, // debt -10
                    cumQuotePerLiquidityX96: 0, // debt -20
                },
            },
            {
                title: "deleverage. funding not affect cumPerLiquidity calc",
                liquidity: 1,
                minBase: 0,
                minQuote: 0,
                collateralBalance: 100,
                funding: true,
                takerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                makerInfo: {
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
                    liquidity: 1,
                    cumBaseSharePerLiquidityX96: 0, // debt -10
                    cumQuotePerLiquidityX96: 0, // debt -20
                },
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
                    liquidity: 100,
                    cumBaseSharePerLiquidityX96: Q96, // debt 100
                    cumQuotePerLiquidityX96: Q96, // debt 100
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
                    liquidity: 100,
                    cumBaseSharePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: Q96.mul(2), // debt 200
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
                    liquidity: 50,
                    cumBaseSharePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: Q96.mul(2), // debt 100
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
                    liquidity: 100,
                    cumBaseSharePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: Q96.mul(2), // debt 200
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
                    liquidity: 50,
                    cumBaseSharePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: Q96.mul(2), // debt 100
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
                    liquidity: 100,
                    cumBaseSharePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: Q96.mul(2), // debt 200
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
                            test.outputTakerBase,
                            test.outputTakerQuote,
                            test.afterCollateralBalance - test.collateralBalance,
                        )

                    expect(await market.baseBalancePerShareX96()).to.eq(test.poolInfo?.baseBalancePerShareX96 || Q96)
                    expect(await market.getShareMarkPriceX96()).to.eq(sharePrice)

                    const accountInfo = await exchange.accountInfos(alice.address)
                    expect(accountInfo.vaultInfo.collateralBalance).to.eq(test.afterCollateralBalance)

                    const takerInfo = await exchange.getTakerInfo(alice.address, market.address)
                    expect(takerInfo.baseBalanceShare).to.eq(test.afterTakerInfo.baseBalanceShare)
                    expect(takerInfo.quoteBalance).to.eq(test.afterTakerInfo.quoteBalance)

                    const makerInfo = await exchange.getMakerInfo(alice.address, market.address)
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
