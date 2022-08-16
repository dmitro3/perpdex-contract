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

    describe("various cases", () => {
        ;[
            {
                title: "ask same price",
                orders: _.map(_.range(4), () => {
                    return {
                        isBid: false,
                        base: 1,
                        priceX96: Q96,
                        executionId: 0,
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
                    }
                }),
                expected: {
                    askOrderIds: [1, 2, 3, 4],
                    bidOrderIds: [],
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
                for (let i = 0; i < test.orders.length; i++) {
                    const order = test.orders[i]
                    let id = order.isBid ? bidId++ : askId++
                    expect(await market.getLimitOrderInfo(order.isBid, id)).to.deep.eq([order.base, order.priceX96])
                    const exec = await market.getLimitOrderExecution(order.isBid, id)
                    if (order.executionId > 0) {
                        const quote = order.priceX96.mul(order.base).div(Q96)
                        expect(exec).to.deep.eq([order.executionId, order.base, quote])
                    } else {
                        expect(exec).to.deep.eq([0, 0, 0])
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
