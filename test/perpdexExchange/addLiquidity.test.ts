import { expect } from "chai"
import { waffle } from "hardhat"
import { TestPerpdexExchange, TestPerpdexMarket } from "../../typechain"
import { createPerpdexExchangeFixture } from "./fixtures"
import { BigNumber, Wallet } from "ethers"
import { MockContract } from "ethereum-waffle"
import { getTimestamp, setNextTimestamp } from "../helper/time"
import { MarketStatus } from "../helper/types"

describe("PerpdexExchange addLiquidity", () => {
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
                title: "initial",
                base: 100,
                quote: 200,
                minBase: 100,
                minQuote: 100,
                collateralBalance: 10,
                takerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                makerInfo: {
                    liquidity: 0,
                    cumBaseSharePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                },
                outputBase: 100,
                outputQuote: 100,
                afterCollateralBalance: 10,
                afterTakerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                afterMakerInfo: {
                    liquidity: 100,
                    cumBaseSharePerLiquidityX96: Q96, // debt 100
                    cumQuotePerLiquidityX96: Q96, // debt 100
                },
            },
            {
                title: "add",
                base: 100,
                quote: 200,
                minBase: 100,
                minQuote: 100,
                collateralBalance: 81, // rounding error
                takerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                makerInfo: {
                    liquidity: 400,
                    cumBaseSharePerLiquidityX96: Q96.div(4), // debt 100
                    cumQuotePerLiquidityX96: Q96.div(4), // debt 100
                },
                outputBase: 100,
                outputQuote: 100,
                afterCollateralBalance: 81,
                afterTakerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                afterMakerInfo: {
                    liquidity: 500,
                    cumBaseSharePerLiquidityX96: Q96.mul(2).div(5), // debt 200
                    cumQuotePerLiquidityX96: Q96.mul(2).div(5), // debt 200
                },
            },
            {
                title: "deleverage",
                base: 100,
                quote: 200,
                minBase: 0,
                minQuote: 0,
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                makerInfo: {
                    liquidity: 1,
                    cumBaseSharePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                },
                poolInfo: {
                    base: 10000,
                    quote: 10000,
                    totalLiquidity: 10000,
                    cumBasePerLiquidityX96: Q96.mul(2),
                    cumQuotePerLiquidityX96: Q96.mul(3),
                    baseBalancePerShareX96: Q96,
                },
                outputBase: 100,
                outputQuote: 100,
                afterCollateralBalance: 100,
                afterTakerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                afterMakerInfo: {
                    liquidity: 101,
                    cumBaseSharePerLiquidityX96: Q96.mul(2).add(
                        Q96.mul(98).div(101), // debt 98
                    ),
                    cumQuotePerLiquidityX96: Q96.mul(3).add(
                        Q96.mul(97).div(101), // debt 97
                    ),
                },
            },
            {
                title: "deleverage add",
                base: 100,
                quote: 200,
                minBase: 100,
                minQuote: 100,
                collateralBalance: 80,
                takerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                makerInfo: {
                    liquidity: 400,
                    cumBaseSharePerLiquidityX96: Q96.div(4), // 700
                    cumQuotePerLiquidityX96: Q96.div(4), // 1100
                },
                poolInfo: {
                    base: 10000,
                    quote: 10000,
                    totalLiquidity: 10000,
                    cumBasePerLiquidityX96: Q96.mul(2),
                    cumQuotePerLiquidityX96: Q96.mul(3),
                    baseBalancePerShareX96: Q96,
                },
                outputBase: 100,
                outputQuote: 100,
                afterCollateralBalance: 80,
                afterTakerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                afterMakerInfo: {
                    liquidity: 500,
                    cumBaseSharePerLiquidityX96: Q96.mul(2 * 5 - 6).div(5), // 600
                    cumQuotePerLiquidityX96: Q96.mul(3 * 5 - 10)
                        .div(5)
                        .sub(1), // 1000 + rounding error
                },
            },
            {
                title: "deleverage add. funding not affect cumPerLiquidity calc",
                base: 100,
                quote: 200,
                minBase: 100,
                minQuote: 100,
                collateralBalance: 80,
                funding: true,
                takerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                makerInfo: {
                    liquidity: 400,
                    cumBaseSharePerLiquidityX96: Q96.div(4), // 700
                    cumQuotePerLiquidityX96: Q96.div(4), // 1100
                },
                poolInfo: {
                    base: 10000,
                    quote: 10000,
                    totalLiquidity: 10000,
                    cumBasePerLiquidityX96: Q96.mul(2),
                    cumQuotePerLiquidityX96: Q96.mul(3),
                    baseBalancePerShareX96: Q96,
                },
                outputBase: 100,
                outputQuote: 100,
                afterCollateralBalance: 80,
                afterTakerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                afterMakerInfo: {
                    liquidity: 500,
                    cumBaseSharePerLiquidityX96: Q96.mul(2 * 5 - 6).div(5), // 600
                    cumQuotePerLiquidityX96: Q96.mul(3 * 5 - 10)
                        .div(5)
                        .sub(1), // 1000 + rounding error
                },
            },
            {
                title: "minBase condition",
                base: 100,
                quote: 200,
                minBase: 101,
                minQuote: 0,
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                makerInfo: {
                    liquidity: 0,
                    cumBaseSharePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                },
                revertedWith: "ML_AL: too small output base",
            },
            {
                title: "minQuote condition",
                base: 100,
                quote: 200,
                minBase: 0,
                minQuote: 101,
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                makerInfo: {
                    liquidity: 0,
                    cumBaseSharePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                },
                revertedWith: "ML_AL: too small output quote",
            },
            {
                title: "market disallowed",
                base: 100,
                quote: 200,
                minBase: 0,
                minQuote: 0,
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                makerInfo: {
                    liquidity: 0,
                    cumBaseSharePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                },
                marketStatus: MarketStatus.NotAllowed,
                revertedWith: "PE_CMO: market not open",
            },
            {
                title: "market closed",
                base: 100,
                quote: 200,
                minBase: 0,
                minQuote: 0,
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                makerInfo: {
                    liquidity: 0,
                    cumBaseSharePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                },
                marketStatus: MarketStatus.Closed,
                revertedWith: "PE_CMO: market not open",
            },
            {
                title: "not enough im",
                base: 100,
                quote: 100,
                minBase: 0,
                minQuote: 0,
                collateralBalance: 9,
                takerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                makerInfo: {
                    liquidity: 0,
                    cumBaseSharePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                },
                revertedWith: "ML_AL: not enough im",
            },
            {
                title: "event",
                base: 100,
                quote: 400,
                minBase: 0,
                minQuote: 0,
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                makerInfo: {
                    liquidity: 0,
                    cumBaseSharePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                },
                poolInfo: {
                    base: 10000,
                    quote: 40000,
                    totalLiquidity: 20000,
                    cumBasePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                    baseBalancePerShareX96: Q96.mul(2),
                },
                outputBase: 100,
                outputQuote: 400,
                afterCollateralBalance: 100,
                afterTakerInfo: {
                    baseBalanceShare: 0,
                    quoteBalance: 0,
                },
                afterMakerInfo: {
                    liquidity: 200,
                    cumBaseSharePerLiquidityX96: Q96.div(2), // debt 100
                    cumQuotePerLiquidityX96: Q96.mul(2), // debt 400
                },
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

                if (test.marketStatus !== void 0) {
                    await exchange.connect(owner).setMarketStatusForce(market.address, test.marketStatus)
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
                    exchange.connect(alice).addLiquidity({
                        market: market.address,
                        base: test.base,
                        quote: test.quote,
                        minBase: test.minBase,
                        minQuote: test.minQuote,
                        deadline: deadline,
                    }),
                )

                if (test.revertedWith === void 0) {
                    const sharePrice = test.poolInfo ? Q96.mul(test.poolInfo.quote).div(test.poolInfo.base) : Q96

                    await res.to
                        .emit(exchange, "LiquidityAdded")
                        .withArgs(
                            alice.address,
                            market.address,
                            test.outputBase,
                            test.outputQuote,
                            test.afterMakerInfo.liquidity - test.makerInfo.liquidity,
                            test.afterMakerInfo.cumBaseSharePerLiquidityX96,
                            test.afterMakerInfo.cumQuotePerLiquidityX96,
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
