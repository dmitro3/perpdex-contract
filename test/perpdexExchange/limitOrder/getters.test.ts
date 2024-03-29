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

    beforeEach(async () => {
        fixture = await loadFixture(createPerpdexExchangeFixture({ isMarketAllowed: true, initPool: true }))
        exchange = fixture.perpdexExchange
        market = fixture.perpdexMarket
        owner = fixture.owner
        alice = fixture.alice

        await exchange.connect(owner).setImRatio(10e4)
        await exchange.connect(owner).setMmRatio(5e4)

        await exchange.setAccountInfo(
            alice.address,
            {
                collateralBalance: 100000,
            },
            [],
        )
    })

    describe("getters", () => {
        ;[
            {
                title: "ask same price",
                orders: _.map(_.range(4), () => {
                    return {
                        isBid: false,
                        base: 1,
                        priceX96: Q96,
                        executionId: 0,
                        baseBalancePerShareX96: Q96,
                    }
                }),
                expected: {
                    askOrderIds: [1, 2, 3, 4],
                    bidOrderIds: [],
                },
            },
            {
                title: "ask different price",
                orders: _.map(_.range(4), i => {
                    return {
                        isBid: false,
                        base: 1,
                        priceX96: Q96.add(4 - i),
                        executionId: 0,
                        baseBalancePerShareX96: Q96,
                    }
                }),
                expected: {
                    askOrderIds: [4, 3, 2, 1],
                    bidOrderIds: [],
                },
            },
            {
                title: "bid same price",
                orders: _.map(_.range(4), () => {
                    return {
                        isBid: true,
                        base: 1,
                        priceX96: Q96,
                        executionId: 0,
                        baseBalancePerShareX96: Q96,
                    }
                }),
                expected: {
                    askOrderIds: [],
                    bidOrderIds: [1, 2, 3, 4],
                },
            },
            {
                title: "bid different price",
                orders: _.map(_.range(4), i => {
                    return {
                        isBid: true,
                        base: 1,
                        priceX96: Q96.sub(4 - i),
                        executionId: 0,
                        baseBalancePerShareX96: Q96,
                    }
                }),
                expected: {
                    askOrderIds: [],
                    bidOrderIds: [4, 3, 2, 1],
                },
            },
            {
                title: "ask fully executed",
                orders: _.map(_.range(4), i => {
                    return {
                        isBid: false,
                        base: 1,
                        priceX96: Q96,
                        executionId: i % 2 == 0 ? 1 : 0,
                        baseBalancePerShareX96: Q96,
                    }
                }),
                expected: {
                    askOrderIds: [1, 2, 3, 4],
                    bidOrderIds: [],
                    skipSummaryTest: true, // It's a case that can't actually happen.
                },
            },
            {
                title: "bid fully executed",
                orders: _.map(_.range(4), i => {
                    return {
                        isBid: true,
                        base: 1,
                        priceX96: Q96,
                        executionId: i % 2 == 0 ? 1 : 0,
                        baseBalancePerShareX96: Q96,
                    }
                }),
                expected: {
                    askOrderIds: [],
                    bidOrderIds: [1, 2, 3, 4],
                    skipSummaryTest: true, // It's a case that can't actually happen.
                },
            },
            {
                title: "ask fully executed with funding",
                orders: _.map(_.range(4), i => {
                    return {
                        isBid: false,
                        base: 1,
                        priceX96: Q96,
                        executionId: 1 + i,
                        baseBalancePerShareX96: Q96.mul(1 + i),
                    }
                }),
                expected: {
                    askOrderIds: [1, 2, 3, 4],
                    bidOrderIds: [],
                },
            },
            {
                title: "bid fully executed with funding",
                orders: _.map(_.range(4), i => {
                    return {
                        isBid: true,
                        base: 1,
                        priceX96: Q96,
                        executionId: 1 + i,
                        baseBalancePerShareX96: Q96.div(1 + i),
                    }
                }),
                expected: {
                    askOrderIds: [],
                    bidOrderIds: [1, 2, 3, 4],
                },
            },
        ].forEach(test => {
            it(test.title, async () => {
                await exchange.connect(alice).createLimitOrdersForTest(test.orders, market.address)

                let askId = 1
                let bidId = 1
                const askSummaries = []
                const bidSummaries = []
                for (let i = 0; i < test.orders.length; i++) {
                    const order = test.orders[i]
                    let id = order.isBid ? bidId++ : askId++
                    expect(await market.getLimitOrderInfo(order.isBid, id)).to.deep.eq([order.base, order.priceX96])
                    const exec = await market.getLimitOrderExecution(order.isBid, id)
                    if (order.executionId > 0) {
                        const quote = order.priceX96.mul(order.base).div(Q96).mul(order.baseBalancePerShareX96).div(Q96)
                        expect(exec).to.deep.eq([order.executionId, order.base, quote])
                    } else {
                        expect(exec).to.deep.eq([0, 0, 0])
                        const summaries = order.isBid ? bidSummaries : askSummaries
                        summaries.push({
                            orderId: id,
                            base: order.base,
                            priceX96: order.priceX96,
                        })
                    }
                }
                const summarySortFunc = (isBid, x, y) => {
                    if (isBid) {
                        if (x.priceX96.gt(y.priceX96)) {
                            return -1
                        } else if (x.priceX96.lt(y.priceX96)) {
                            return 1
                        }
                    } else {
                        if (x.priceX96.lt(y.priceX96)) {
                            return -1
                        } else if (x.priceX96.gt(y.priceX96)) {
                            return 1
                        }
                    }
                    return x.orderId - y.orderId
                }
                askSummaries.sort(_.partial(summarySortFunc, false))
                bidSummaries.sort(_.partial(summarySortFunc, true))

                expect(await exchange.getLimitOrderIds(alice.address, market.address, false)).to.deep.eq(
                    test.expected.askOrderIds,
                )
                expect(await exchange.getLimitOrderIds(alice.address, market.address, true)).to.deep.eq(
                    test.expected.bidOrderIds,
                )

                if (!test.expected.skipSummaryTest) {
                    const assertSummary = (actual, expected) => {
                        expect(actual.orderId).to.eq(expected.orderId)
                        expect(actual.priceX96).to.eq(expected.priceX96)
                        expect(actual.priceX96).to.eq(expected.priceX96)
                    }
                    const actualAskSummaries = await exchange.getLimitOrderSummaries(
                        alice.address,
                        market.address,
                        false,
                    )
                    for (let i = 0; i < actualAskSummaries.length; i++) {
                        assertSummary(actualAskSummaries[i], askSummaries[i])
                    }
                    const actualBidSummaries = await exchange.getLimitOrderSummaries(
                        alice.address,
                        market.address,
                        true,
                    )
                    for (let i = 0; i < actualBidSummaries.length; i++) {
                        assertSummary(actualBidSummaries[i], bidSummaries[i])
                    }
                }
            })
        })
    })
})
