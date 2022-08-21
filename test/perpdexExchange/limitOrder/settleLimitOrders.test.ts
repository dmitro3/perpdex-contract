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
            alice.address,
            {
                collateralBalance: 100000,
            },
            [],
        )
    })

    describe("settleLimitOrders", () => {
        ;[
            {
                title: "ask executed",
                orders: [
                    {
                        isBid: false,
                        base: 1,
                        priceX96: Q96,
                        executionId: 1,
                        baseBalancePerShareX96: Q96,
                    },
                ],
                expected: {
                    limitOrderCount: 0,
                    totalBase: [0, 0],
                    markets: true,
                    askOrderIds: [],
                    bidOrderIds: [],
                    limitOrderSettled: {
                        base: -1,
                        quote: 1,
                        realizedPnl: 0,
                    },
                },
            },
            {
                title: "bid executed",
                orders: [
                    {
                        isBid: true,
                        base: 1,
                        priceX96: Q96,
                        executionId: 1,
                        baseBalancePerShareX96: Q96,
                    },
                ],
                expected: {
                    limitOrderCount: 0,
                    totalBase: [0, 0],
                    markets: true,
                    askOrderIds: [],
                    bidOrderIds: [],
                    limitOrderSettled: {
                        base: 1,
                        quote: -1,
                        realizedPnl: 0,
                    },
                },
            },
            {
                title: "ask bid executed",
                orders: [
                    {
                        isBid: true,
                        base: 1,
                        priceX96: Q96,
                        executionId: 1,
                        baseBalancePerShareX96: Q96,
                    },
                    {
                        isBid: false,
                        base: 1,
                        priceX96: Q96,
                        executionId: 1,
                        baseBalancePerShareX96: Q96,
                    },
                ],
                expected: {
                    limitOrderCount: 0,
                    totalBase: [0, 0],
                    markets: false,
                    askOrderIds: [],
                    bidOrderIds: [],
                    limitOrderSettled: void 0,
                },
            },
            {
                title: "ask bid executed with realizedPnl",
                orders: [
                    {
                        isBid: true,
                        base: 2,
                        priceX96: Q96.div(2),
                        executionId: 1,
                        baseBalancePerShareX96: Q96,
                    },
                    {
                        isBid: false,
                        base: 2,
                        priceX96: Q96,
                        executionId: 1,
                        baseBalancePerShareX96: Q96,
                    },
                ],
                expected: {
                    limitOrderCount: 0,
                    totalBase: [0, 0],
                    markets: false,
                    askOrderIds: [],
                    bidOrderIds: [],
                    limitOrderSettled: {
                        base: 0,
                        quote: 0,
                        realizedPnl: 1,
                    },
                },
            },
            {
                title: "complex case",
                orders: [
                    {
                        isBid: true,
                        base: 1,
                        priceX96: Q96.sub(1),
                        executionId: 0,
                        baseBalancePerShareX96: Q96,
                    },
                    {
                        isBid: true,
                        base: 2,
                        priceX96: Q96,
                        executionId: 1,
                        baseBalancePerShareX96: Q96,
                    },
                    {
                        isBid: false,
                        base: 3,
                        priceX96: Q96,
                        executionId: 1,
                        baseBalancePerShareX96: Q96,
                    },
                    {
                        isBid: false,
                        base: 4,
                        priceX96: Q96.add(1),
                        executionId: 0,
                        baseBalancePerShareX96: Q96,
                    },
                ],
                expected: {
                    limitOrderCount: 2,
                    totalBase: [4, 1],
                    markets: true,
                    askOrderIds: [2],
                    bidOrderIds: [1],
                    limitOrderSettled: {
                        base: -1,
                        quote: 1,
                        realizedPnl: 0,
                    },
                },
            },
        ].forEach(test => {
            it(test.title, async () => {
                await exchange.connect(alice).createLimitOrdersForTest(test.orders, market.address)
                const call = exchange.settleLimitOrders(alice.address)
                if (test.expected.limitOrderSettled) {
                    await expect(call)
                        .to.emit(exchange, "LimitOrderSettled")
                        .withArgs(
                            alice.address,
                            market.address,
                            test.expected.limitOrderSettled.base,
                            test.expected.limitOrderSettled.quote,
                            test.expected.limitOrderSettled.realizedPnl,
                        )
                } else {
                    await expect(call).not.to.emit(exchange, "LimitOrderSettled")
                }

                await assertLimitOrderCount(test.expected.limitOrderCount)
                await assertTotalBase(test.expected.totalBase)
                await assertMarkets(test.expected.markets ? [market.address] : [])

                // check if all settled
                for (let i = 0; i < 2; i++) {
                    const isBid = i == 0
                    const orderIds = await exchange.getLimitOrderIds(alice.address, market.address, isBid)
                    for (let j = 0; j < orderIds.length; j++) {
                        expect(await market.getLimitOrderExecution(isBid, orderIds[j])).to.deep.eq([0, 0, 0])
                    }
                }

                expect(await exchange.getLimitOrderIds(alice.address, market.address, false)).to.deep.eq(
                    test.expected.askOrderIds,
                )
                expect(await exchange.getLimitOrderIds(alice.address, market.address, true)).to.deep.eq(
                    test.expected.bidOrderIds,
                )
            })
        })
    })
})
