import { expect } from "chai"
import { waffle } from "hardhat"
import { TestOrderBookLibrary } from "../../typechain"
import { createOrderBookLibraryFixture } from "./fixtures"
import { BigNumber } from "ethers"
import _ from "lodash"

describe("OrderBookLibrary maxSwap", () => {
    let loadFixture = waffle.createFixtureLoader(waffle.provider.getWallets())
    let fixture

    let library: TestOrderBookLibrary

    const Q96 = BigNumber.from(2).pow(96)

    beforeEach(async () => {
        fixture = await loadFixture(createOrderBookLibraryFixture())
        library = fixture.library
    })

    describe("various cases", () => {
        ;[
            {
                title: "empty long",
                orders: [],
                isBaseToQuote: false,
                priceBoundX96: Q96,
                expected: 0,
                expectedExactOutput: 0,
            },
            {
                title: "empty short",
                orders: [],
                isBaseToQuote: true,
                priceBoundX96: Q96,
                expected: 0,
                expectedExactOutput: 0,
            },
            {
                title: "long for bid",
                orders: [
                    {
                        isBid: true,
                        base: 100,
                        priceX96: Q96,
                    },
                ],
                isBaseToQuote: false,
                priceBoundX96: Q96,
                expected: 0,
                expectedExactOutput: 0,
            },
            {
                title: "short for ask",
                orders: [
                    {
                        isBid: false,
                        base: 100,
                        priceX96: Q96,
                    },
                ],
                isBaseToQuote: true,
                priceBoundX96: Q96,
                expected: 0,
                expectedExactOutput: 0,
            },
            {
                title: "long for ask. out of bound",
                orders: [
                    {
                        isBid: false,
                        base: 100,
                        priceX96: Q96.mul(2),
                    },
                ],
                isBaseToQuote: false,
                priceBoundX96: Q96.mul(2).sub(1),
                expected: 0,
                expectedExactOutput: 0,
            },
            {
                title: "long for ask. same price",
                orders: [
                    {
                        isBid: false,
                        base: 100,
                        priceX96: Q96.mul(2),
                    },
                ],
                isBaseToQuote: false,
                priceBoundX96: Q96.mul(2),
                expected: 200,
                expectedExactOutput: 100,
            },
            {
                title: "long for ask. in bound",
                orders: [
                    {
                        isBid: false,
                        base: 100,
                        priceX96: Q96.mul(2),
                    },
                ],
                isBaseToQuote: false,
                priceBoundX96: Q96.mul(2).add(1),
                expected: 200,
                expectedExactOutput: 100,
            },
            {
                title: "short for bid. out of bound",
                orders: [
                    {
                        isBid: true,
                        base: 100,
                        priceX96: Q96.mul(2),
                    },
                ],
                isBaseToQuote: true,
                priceBoundX96: Q96.mul(2).add(1),
                expected: 0,
                expectedExactOutput: 0,
            },
            {
                title: "short for bid. same price",
                orders: [
                    {
                        isBid: true,
                        base: 100,
                        priceX96: Q96.mul(2),
                    },
                ],
                isBaseToQuote: true,
                priceBoundX96: Q96.mul(2),
                expected: 100,
                expectedExactOutput: 200,
            },
            {
                title: "short for bid. in bound",
                orders: [
                    {
                        isBid: true,
                        base: 100,
                        priceX96: Q96.mul(2),
                    },
                ],
                isBaseToQuote: true,
                priceBoundX96: Q96.mul(2).sub(1),
                expected: 100,
                expectedExactOutput: 200,
            },
            {
                title: "long for ask. complex case",
                orders: _.flatten(
                    _.map(_.range(10), () => {
                        return [
                            {
                                isBid: false,
                                base: 50,
                                priceX96: Q96.mul(2),
                            },
                            {
                                isBid: false,
                                base: 100,
                                priceX96: Q96.mul(3),
                            },
                            {
                                isBid: false,
                                base: 200,
                                priceX96: Q96.mul(4),
                            },
                        ]
                    }),
                ),
                isBaseToQuote: false,
                priceBoundX96: Q96.mul(3),
                expected: 400 * 10,
                expectedExactOutput: 150 * 10,
            },
            {
                title: "short for bid. complex case",
                orders: _.flatten(
                    _.map(_.range(10), () => {
                        return [
                            {
                                isBid: true,
                                base: 50,
                                priceX96: Q96.mul(2),
                            },
                            {
                                isBid: true,
                                base: 100,
                                priceX96: Q96.mul(3),
                            },
                            {
                                isBid: true,
                                base: 200,
                                priceX96: Q96.mul(4),
                            },
                        ]
                    }),
                ),
                isBaseToQuote: true,
                priceBoundX96: Q96.mul(3),
                expected: 300 * 10,
                expectedExactOutput: 1100 * 10,
            },
            {
                title: "baseBalancePerShareX96 long for ask. out of bound",
                orders: [
                    {
                        isBid: false,
                        base: 100,
                        priceX96: Q96.mul(2),
                    },
                ],
                isBaseToQuote: false,
                priceBoundX96: Q96.mul(2).mul(2).sub(1),
                baseBalancePerShareX96: Q96.mul(2),
                expected: 0,
                expectedExactOutput: 0,
            },
            {
                title: "baseBalancePerShareX96 long for ask. same price",
                orders: [
                    {
                        isBid: false,
                        base: 100,
                        priceX96: Q96.mul(2),
                    },
                ],
                isBaseToQuote: false,
                priceBoundX96: Q96.mul(2).mul(2),
                baseBalancePerShareX96: Q96.mul(2),
                expected: 400,
                expectedExactOutput: 100,
            },
            {
                title: "baseBalancePerShareX96 long for ask. in bound",
                orders: [
                    {
                        isBid: false,
                        base: 100,
                        priceX96: Q96.mul(2),
                    },
                ],
                isBaseToQuote: false,
                priceBoundX96: Q96.mul(2).mul(2).add(1),
                baseBalancePerShareX96: Q96.mul(2),
                expected: 400,
                expectedExactOutput: 100,
            },
        ].forEach(test => {
            describe(test.title, () => {
                it("exact input", async () => {
                    await library.createOrders(test.orders)
                    const result = await library.maxSwap(
                        test.isBaseToQuote,
                        true,
                        test.priceBoundX96,
                        test.baseBalancePerShareX96 || Q96,
                    )
                    expect(result).to.eq(test.expected)
                })

                it("exact output", async () => {
                    await library.createOrders(test.orders)
                    const result = await library.maxSwap(
                        test.isBaseToQuote,
                        false,
                        test.priceBoundX96,
                        test.baseBalancePerShareX96 || Q96,
                    )
                    expect(result).to.eq(test.expectedExactOutput)
                })
            })
        })
    })
})
