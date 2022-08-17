import { expect } from "chai"
import { waffle } from "hardhat"
import { TestPerpdexMarket, TestPerpdexExchange } from "../../../typechain"
import { createPerpdexExchangeFixture } from "../fixtures"
import { BigNumber, Wallet } from "ethers"
import _ from "lodash"

describe("PerpdexExchange limitOrder", () => {
    let loadFixture = waffle.createFixtureLoader(waffle.provider.getWallets())
    let fixture

    let exchange: TestPerpdexExchange
    let market: TestPerpdexMarket
    let owner: Wallet
    let alice: Wallet

    const Q96 = BigNumber.from(2).pow(96)
    const deadline = Q96

    const trade = async (trader, isLong, amount) => {
        return exchange.connect(trader).trade({
            trader: trader.address,
            market: market.address,
            isBaseToQuote: !isLong,
            isExactInput: !isLong,
            amount: amount,
            oppositeAmountBound: isLong ? BigNumber.from(amount).mul(10) : 0,
            deadline: deadline,
        })
    }

    const assertLimitOrderCount = async expected => {
        expect((await exchange.accountInfos(alice.address)).limitOrderCount).to.eq(expected)
    }

    const assertTotalBase = async expected => {
        const info = await exchange.getLimitOrderInfo(alice.address, market.address)
        expect(info.slice(2, 4)).to.deep.eq(expected)
    }

    const assertMarkets = async expected => {
        expect(await exchange.getAccountMarkets(alice.address)).to.deep.eq(expected)
    }

    beforeEach(async () => {
        fixture = await loadFixture(createPerpdexExchangeFixture({ isMarketAllowed: true, initPool: true }))
        exchange = fixture.perpdexExchange
        market = fixture.perpdexMarket
        owner = fixture.owner
        alice = fixture.alice

        await exchange.connect(owner).setImRatio(10e4)
        await exchange.connect(owner).setMmRatio(5e4)

        await exchange.setAccountInfo(
            owner.address,
            {
                collateralBalance: 100000,
            },
            [],
        )
        await exchange.setAccountInfo(
            alice.address,
            {
                collateralBalance: 100000,
            },
            [],
        )
    })

    describe("trade", () => {
        ;[
            {
                title: "ask bid long",
                orders: [
                    {
                        isBid: false,
                        base: 1,
                        priceX96: Q96,
                    },
                    {
                        isBid: true,
                        base: 1,
                        priceX96: Q96,
                    },
                ],
                isLong: true,
                amount: 1,
                expected: {
                    oppositeAmount: 1,
                    fullLastKey: 1,
                    partialKey: 0,
                    basePartial: 0,
                    quotePartial: 0,
                    baseRemaining: 0,
                    executedAsks: [1],
                    executedBids: [],
                    asks: [1],
                    bids: [1],
                    limitOrderCount: 2,
                    totalBase: [1, 1],
                },
            },
            {
                title: "ask bid short",
                orders: [
                    {
                        isBid: false,
                        base: 1,
                        priceX96: Q96,
                    },
                    {
                        isBid: true,
                        base: 1,
                        priceX96: Q96,
                    },
                ],
                isLong: false,
                amount: 1,
                expected: {
                    oppositeAmount: 1,
                    fullLastKey: 1,
                    partialKey: 0,
                    basePartial: 0,
                    quotePartial: 0,
                    baseRemaining: 0,
                    executedAsks: [],
                    executedBids: [1],
                    asks: [1],
                    bids: [1],
                    limitOrderCount: 2,
                    totalBase: [1, 1],
                },
            },
            {
                title: "ask full and partial long (settled)",
                orders: [
                    {
                        isBid: false,
                        base: 1,
                        priceX96: Q96,
                    },
                    {
                        isBid: false,
                        base: 1,
                        priceX96: Q96,
                    },
                    {
                        isBid: false,
                        base: 3,
                        priceX96: Q96,
                    },
                ],
                isLong: true,
                amount: 3,
                expected: {
                    oppositeAmount: 3,
                    fullLastKey: 2,
                    partialKey: 3,
                    basePartial: 1,
                    quotePartial: 1,
                    baseRemaining: 2,
                    executedAsks: [],
                    executedBids: [],
                    asks: [3],
                    bids: [],
                    limitOrderCount: 1,
                    totalBase: [2, 0],
                },
            },
            {
                title: "bid full and partial short (settled)",
                orders: [
                    {
                        isBid: true,
                        base: 1,
                        priceX96: Q96,
                    },
                    {
                        isBid: true,
                        base: 1,
                        priceX96: Q96,
                    },
                    {
                        isBid: true,
                        base: 3,
                        priceX96: Q96,
                    },
                ],
                isLong: false,
                amount: 3,
                expected: {
                    oppositeAmount: 3,
                    fullLastKey: 2,
                    partialKey: 3,
                    basePartial: 1,
                    quotePartial: 1,
                    baseRemaining: 2,
                    executedAsks: [],
                    executedBids: [],
                    asks: [],
                    bids: [3],
                    limitOrderCount: 1,
                    totalBase: [0, 2],
                },
            },
            {
                title: "ask full and others partial",
                orders: [
                    {
                        isBid: false,
                        base: 1,
                        priceX96: Q96,
                    },
                    {
                        isBid: false,
                        base: 1,
                        priceX96: Q96,
                    },
                    {
                        isBid: false,
                        base: 3,
                        priceX96: Q96,
                        others: true,
                    },
                ],
                isLong: true,
                amount: 3,
                expected: {
                    oppositeAmount: 3,
                    fullLastKey: 2,
                    partialKey: 3,
                    basePartial: 1,
                    quotePartial: 1,
                    baseRemaining: 2,
                    executedAsks: [1, 2],
                    executedBids: [],
                    asks: [1, 2],
                    bids: [],
                    limitOrderCount: 2,
                    totalBase: [2, 0],
                },
            },
            {
                title: "bid full and others partial short",
                orders: [
                    {
                        isBid: true,
                        base: 1,
                        priceX96: Q96,
                    },
                    {
                        isBid: true,
                        base: 1,
                        priceX96: Q96,
                    },
                    {
                        isBid: true,
                        base: 3,
                        priceX96: Q96,
                        others: true,
                    },
                ],
                isLong: false,
                amount: 3,
                expected: {
                    oppositeAmount: 3,
                    fullLastKey: 2,
                    partialKey: 3,
                    basePartial: 1,
                    quotePartial: 1,
                    baseRemaining: 2,
                    executedAsks: [],
                    executedBids: [1, 2],
                    asks: [],
                    bids: [1, 2],
                    limitOrderCount: 2,
                    totalBase: [0, 2],
                },
            },
            {
                title: "ask long with funding",
                orders: [
                    {
                        isBid: false,
                        base: 1,
                        priceX96: Q96.mul(2),
                    },
                ],
                baseBalancePerShareX96: Q96.div(2),
                isLong: true,
                amount: 1,
                expected: {
                    oppositeAmount: 1,
                    fullLastKey: 1,
                    partialKey: 0,
                    basePartial: 0,
                    quotePartial: 0,
                    baseRemaining: 0,
                    executedAsks: [1],
                    executedBids: [],
                    asks: [1],
                    bids: [],
                    limitOrderCount: 1,
                    totalBase: [1, 0],
                },
            },
            {
                title: "bid short with funding",
                orders: [
                    {
                        isBid: true,
                        base: 2,
                        priceX96: Q96.div(2),
                    },
                ],
                baseBalancePerShareX96: Q96.mul(2),
                isLong: false,
                amount: 2,
                expected: {
                    oppositeAmount: 2,
                    fullLastKey: 1,
                    partialKey: 0,
                    basePartial: 0,
                    quotePartial: 0,
                    baseRemaining: 0,
                    executedAsks: [],
                    executedBids: [1],
                    asks: [],
                    bids: [1],
                    limitOrderCount: 1,
                    totalBase: [0, 2],
                },
            },
        ].forEach(test => {
            it(test.title, async () => {
                for (let i = 0; i < test.orders.length; i++) {
                    const order = test.orders[i] as any
                    await exchange.connect(order.others ? owner : alice).createLimitOrder({
                        market: market.address,
                        deadline: deadline,
                        ...order,
                    })
                }

                if (test.baseBalancePerShareX96) {
                    await market.setPoolInfo({
                        base: 10000,
                        quote: 10000,
                        totalLiquidity: 10000,
                        cumBasePerLiquidityX96: 0,
                        cumQuotePerLiquidityX96: 0,
                        baseBalancePerShareX96: test.baseBalancePerShareX96,
                    })
                }

                await expect(trade(owner, test.isLong, test.amount))
                    .to.emit(market, "Swapped")
                    .withArgs(
                        !test.isLong,
                        !test.isLong,
                        test.amount,
                        test.expected.oppositeAmount,
                        test.expected.fullLastKey,
                        test.expected.partialKey,
                        test.expected.basePartial,
                        test.expected.quotePartial,
                    )

                await market.setPoolInfo({
                    base: 10000,
                    quote: 10000,
                    totalLiquidity: 10000,
                    cumBasePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                    baseBalancePerShareX96: Q96,
                })

                const execId = 1
                for (let i = 0; i < test.expected.asks.length; i++) {
                    const res = (await market.getLimitOrderExecution(false, test.expected.asks[i]))[0]
                    if (_.includes(test.expected.executedAsks, test.expected.asks[i])) {
                        expect(res).to.eq(execId)
                    } else {
                        expect(res).to.eq(0)
                    }
                }
                for (let i = 0; i < test.expected.bids.length; i++) {
                    const res = (await market.getLimitOrderExecution(true, test.expected.bids[i]))[0]
                    if (_.includes(test.expected.executedBids, test.expected.bids[i])) {
                        expect(res).to.eq(execId)
                    } else {
                        expect(res).to.eq(0)
                    }
                }

                expect(await exchange.getLimitOrderIds(alice.address, market.address, false)).to.deep.eq(
                    test.expected.asks,
                )
                expect(await exchange.getLimitOrderIds(alice.address, market.address, true)).to.deep.eq(
                    test.expected.bids,
                )

                if (test.expected.partialKey) {
                    const info = await market.getLimitOrderInfo(!test.isLong, test.expected.partialKey)
                    expect(info[0]).to.deep.eq(test.expected.baseRemaining)
                }
            })
        })
    })
})
