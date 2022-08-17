import { expect } from "chai"
import { waffle } from "hardhat"
import { TestOrderBookLibrary } from "../../typechain"
import { createOrderBookLibraryFixture } from "./fixtures"
import { BigNumber } from "ethers"
import _ from "lodash"

describe("OrderBookLibrary previewSwap", () => {
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
                title: "amm only long",
                orders: [],
                isBaseToQuote: false,
                tests: [
                    {
                        title: "zero",
                        isExactInput: true,
                        amount: 0,
                        expected: {
                            amountPool: 0,
                            baseFull: 0,
                            quoteFull: 0,
                            basePartial: 0,
                            quotePartial: 0,
                            fullLastKey: 0,
                            partialKey: 0,
                        },
                    },
                    {
                        title: "zero",
                        isExactInput: false,
                        amount: 0,
                        expected: {
                            amountPool: 0,
                            baseFull: 0,
                            quoteFull: 0,
                            basePartial: 0,
                            quotePartial: 0,
                            fullLastKey: 0,
                            partialKey: 0,
                        },
                    },
                    {
                        title: "normal",
                        isExactInput: true,
                        amount: 100,
                        expected: {
                            amountPool: 100,
                            baseFull: 0,
                            quoteFull: 0,
                            basePartial: 0,
                            quotePartial: 0,
                            fullLastKey: 0,
                            partialKey: 0,
                        },
                    },
                    {
                        title: "normal",
                        isExactInput: false,
                        amount: 100,
                        expected: {
                            amountPool: 100,
                            baseFull: 0,
                            quoteFull: 0,
                            basePartial: 0,
                            quotePartial: 0,
                            fullLastKey: 0,
                            partialKey: 0,
                        },
                    },
                    {
                        title: "funding not affect",
                        isExactInput: true,
                        amount: 100,
                        expected: {
                            amountPool: 100,
                            baseFull: 0,
                            quoteFull: 0,
                            basePartial: 0,
                            quotePartial: 0,
                            fullLastKey: 0,
                            partialKey: 0,
                        },
                        baseBalancePerShareX96: Q96.mul(2),
                    },
                ],
            },
            {
                title: "amm only short",
                orders: [],
                isBaseToQuote: true,
                tests: [
                    {
                        title: "zero",
                        isExactInput: true,
                        amount: 0,
                        expected: {
                            amountPool: 0,
                            baseFull: 0,
                            quoteFull: 0,
                            basePartial: 0,
                            quotePartial: 0,
                            fullLastKey: 0,
                            partialKey: 0,
                        },
                    },
                    {
                        title: "zero",
                        isExactInput: false,
                        amount: 0,
                        expected: {
                            amountPool: 0,
                            baseFull: 0,
                            quoteFull: 0,
                            basePartial: 0,
                            quotePartial: 0,
                            fullLastKey: 0,
                            partialKey: 0,
                        },
                    },
                    {
                        title: "normal",
                        isExactInput: true,
                        amount: 100,
                        expected: {
                            amountPool: 100,
                            baseFull: 0,
                            quoteFull: 0,
                            basePartial: 0,
                            quotePartial: 0,
                            fullLastKey: 0,
                            partialKey: 0,
                        },
                    },
                    {
                        title: "normal",
                        isExactInput: false,
                        amount: 100,
                        expected: {
                            amountPool: 100,
                            baseFull: 0,
                            quoteFull: 0,
                            basePartial: 0,
                            quotePartial: 0,
                            fullLastKey: 0,
                            partialKey: 0,
                        },
                    },
                    {
                        title: "funding not affect",
                        isExactInput: true,
                        amount: 100,
                        expected: {
                            amountPool: 100,
                            baseFull: 0,
                            quoteFull: 0,
                            basePartial: 0,
                            quotePartial: 0,
                            fullLastKey: 0,
                            partialKey: 0,
                        },
                        baseBalancePerShareX96: Q96.mul(2),
                    },
                ],
            },
            {
                title: "complex case long",
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
                tests: [
                    {
                        title: "zero",
                        isExactInput: true,
                        amount: 0,
                        expected: {
                            amountPool: 0,
                            baseFull: 0,
                            quoteFull: 0,
                            basePartial: 0,
                            quotePartial: 0,
                            fullLastKey: 0,
                            partialKey: 0,
                        },
                    },
                    {
                        title: "zero",
                        isExactInput: false,
                        amount: 0,
                        expected: {
                            amountPool: 0,
                            baseFull: 0,
                            quoteFull: 0,
                            basePartial: 0,
                            quotePartial: 0,
                            fullLastKey: 0,
                            partialKey: 0,
                        },
                    },
                    {
                        title: "amm only",
                        isExactInput: true,
                        amount: 200,
                        expected: {
                            amountPool: 200,
                            baseFull: 0,
                            quoteFull: 0,
                            basePartial: 0,
                            quotePartial: 0,
                            fullLastKey: 0,
                            partialKey: 0,
                        },
                    },
                    {
                        title: "amm only",
                        isExactInput: false,
                        amount: 100,
                        expected: {
                            amountPool: 100,
                            baseFull: 0,
                            quoteFull: 0,
                            basePartial: 0,
                            quotePartial: 0,
                            fullLastKey: 0,
                            partialKey: 0,
                        },
                    },
                    {
                        title: "amm only. funding not affect",
                        isExactInput: true,
                        amount: 600,
                        expected: {
                            amountPool: 600,
                            baseFull: 0,
                            quoteFull: 0,
                            basePartial: 0,
                            quotePartial: 0,
                            fullLastKey: 0,
                            partialKey: 0,
                        },
                        baseBalancePerShareX96: Q96.mul(2),
                    },
                    {
                        title: "amm only. funding not affect",
                        isExactInput: false,
                        amount: 300,
                        expected: {
                            amountPool: 300,
                            baseFull: 0,
                            quoteFull: 0,
                            basePartial: 0,
                            quotePartial: 0,
                            fullLastKey: 0,
                            partialKey: 0,
                        },
                        baseBalancePerShareX96: Q96.mul(2),
                    },
                    {
                        title: "partial",
                        isExactInput: true,
                        amount: 250,
                        expected: {
                            amountPool: 200,
                            baseFull: 0,
                            quoteFull: 0,
                            basePartial: 25,
                            quotePartial: 50,
                            fullLastKey: 0,
                            partialKey: 1,
                        },
                    },
                    {
                        title: "partial",
                        isExactInput: false,
                        amount: 125,
                        expected: {
                            amountPool: 100,
                            baseFull: 0,
                            quoteFull: 0,
                            basePartial: 25,
                            quotePartial: 50,
                            fullLastKey: 0,
                            partialKey: 1,
                        },
                    },
                    {
                        title: "full and partial",
                        isExactInput: true,
                        amount: 200 + 100 + 10,
                        expected: {
                            amountPool: 200,
                            baseFull: 50,
                            quoteFull: 100,
                            basePartial: 5,
                            quotePartial: 10,
                            fullLastKey: 1,
                            partialKey: 4,
                        },
                    },
                    {
                        title: "full and partial",
                        isExactInput: false,
                        amount: 100 + 50 + 10,
                        expected: {
                            amountPool: 100,
                            baseFull: 50,
                            quoteFull: 100,
                            basePartial: 10,
                            quotePartial: 20,
                            fullLastKey: 1,
                            partialKey: 4,
                        },
                    },
                    {
                        title: "full and partial with funding",
                        isExactInput: true,
                        amount: 600 + 200 + 40,
                        expected: {
                            amountPool: 600,
                            baseFull: 50,
                            quoteFull: 200,
                            basePartial: 10,
                            quotePartial: 40,
                            fullLastKey: 1,
                            partialKey: 4,
                        },
                        baseBalancePerShareX96: Q96.mul(2),
                    },
                    {
                        title: "full and partial with funding",
                        isExactInput: false,
                        amount: 300 + 50 + 10,
                        expected: {
                            amountPool: 300,
                            baseFull: 50,
                            quoteFull: 200,
                            basePartial: 10,
                            quotePartial: 40,
                            fullLastKey: 1,
                            partialKey: 4,
                        },
                        baseBalancePerShareX96: Q96.mul(2),
                    },
                    {
                        title: "between order",
                        isExactInput: true,
                        amount: 200 + 100 * 10 + 10,
                        expected: {
                            amountPool: 200 + 10,
                            baseFull: 50 * 10,
                            quoteFull: 100 * 10,
                            basePartial: 0,
                            quotePartial: 0,
                            fullLastKey: 28,
                            partialKey: 0,
                        },
                    },
                    {
                        title: "between order",
                        isExactInput: false,
                        amount: 100 + 50 * 10 + 10,
                        expected: {
                            amountPool: 100 + 10,
                            baseFull: 50 * 10,
                            quoteFull: 100 * 10,
                            basePartial: 0,
                            quotePartial: 0,
                            fullLastKey: 28,
                            partialKey: 0,
                        },
                    },
                    {
                        title: "all",
                        isExactInput: true,
                        amount: 1200 * 10 + 300 * 2 + 1,
                        expected: {
                            amountPool: 300 * 2 + 1,
                            baseFull: 350 * 10,
                            quoteFull: 1200 * 10,
                            basePartial: 0,
                            quotePartial: 0,
                            fullLastKey: 30,
                            partialKey: 0,
                        },
                    },
                    {
                        title: "all",
                        isExactInput: false,
                        amount: 350 * 10 + 300 + 1,
                        expected: {
                            amountPool: 300 + 1,
                            baseFull: 350 * 10,
                            quoteFull: 1200 * 10,
                            basePartial: 0,
                            quotePartial: 0,
                            fullLastKey: 30,
                            partialKey: 0,
                        },
                    },
                    {
                        title: "all with funding",
                        isExactInput: true,
                        amount: 2400 * 10 + 700 * 2 + 1,
                        expected: {
                            amountPool: 700 * 2 + 1,
                            baseFull: 350 * 10,
                            quoteFull: 2400 * 10,
                            basePartial: 0,
                            quotePartial: 0,
                            fullLastKey: 30,
                            partialKey: 0,
                        },
                        baseBalancePerShareX96: Q96.mul(2),
                    },
                    {
                        title: "all with funding",
                        isExactInput: false,
                        amount: 350 * 10 + 700 + 1,
                        expected: {
                            amountPool: 700 + 1,
                            baseFull: 350 * 10,
                            quoteFull: 2400 * 10,
                            basePartial: 0,
                            quotePartial: 0,
                            fullLastKey: 30,
                            partialKey: 0,
                        },
                        baseBalancePerShareX96: Q96.mul(2),
                    },
                ],
            },
            {
                title: "complex case short",
                orders: _.flatten(
                    _.map(_.range(10), () => {
                        return [
                            {
                                isBid: true,
                                base: 50,
                                priceX96: Q96.div(2), // amm 50
                            },
                            {
                                isBid: true,
                                base: 100,
                                priceX96: Q96.div(4), // amm 75
                            },
                            {
                                isBid: true,
                                base: 200,
                                priceX96: Q96.div(8), // amm 87
                            },
                        ]
                    }),
                ),
                isBaseToQuote: true,
                tests: [
                    {
                        title: "zero",
                        isExactInput: true,
                        amount: 0,
                        expected: {
                            amountPool: 0,
                            baseFull: 0,
                            quoteFull: 0,
                            basePartial: 0,
                            quotePartial: 0,
                            fullLastKey: 0,
                            partialKey: 0,
                        },
                    },
                    {
                        title: "zero",
                        isExactInput: false,
                        amount: 0,
                        expected: {
                            amountPool: 0,
                            baseFull: 0,
                            quoteFull: 0,
                            basePartial: 0,
                            quotePartial: 0,
                            fullLastKey: 0,
                            partialKey: 0,
                        },
                    },
                    {
                        title: "amm only",
                        isExactInput: true,
                        amount: 50,
                        expected: {
                            amountPool: 50,
                            baseFull: 0,
                            quoteFull: 0,
                            basePartial: 0,
                            quotePartial: 0,
                            fullLastKey: 0,
                            partialKey: 0,
                        },
                    },
                    {
                        title: "amm only",
                        isExactInput: false,
                        amount: 100,
                        expected: {
                            amountPool: 100,
                            baseFull: 0,
                            quoteFull: 0,
                            basePartial: 0,
                            quotePartial: 0,
                            fullLastKey: 0,
                            partialKey: 0,
                        },
                    },
                    {
                        title: "amm only with funding",
                        isExactInput: true,
                        amount: 75,
                        expected: {
                            amountPool: 75,
                            baseFull: 0,
                            quoteFull: 0,
                            basePartial: 0,
                            quotePartial: 0,
                            fullLastKey: 0,
                            partialKey: 0,
                        },
                        baseBalancePerShareX96: Q96.div(2),
                    },
                    {
                        title: "amm only with funding",
                        isExactInput: false,
                        amount: 150,
                        expected: {
                            amountPool: 150,
                            baseFull: 0,
                            quoteFull: 0,
                            basePartial: 0,
                            quotePartial: 0,
                            fullLastKey: 0,
                            partialKey: 0,
                        },
                        baseBalancePerShareX96: Q96.div(2),
                    },
                    {
                        title: "partial",
                        isExactInput: true,
                        amount: 50 + 10,
                        expected: {
                            amountPool: 50,
                            baseFull: 0,
                            quoteFull: 0,
                            basePartial: 10,
                            quotePartial: 5,
                            fullLastKey: 0,
                            partialKey: 1,
                        },
                    },
                    {
                        title: "partial",
                        isExactInput: false,
                        amount: 100 + 10,
                        expected: {
                            amountPool: 100,
                            baseFull: 0,
                            quoteFull: 0,
                            basePartial: 20,
                            quotePartial: 10,
                            fullLastKey: 0,
                            partialKey: 1,
                        },
                    },
                    {
                        title: "full and partial",
                        isExactInput: true,
                        amount: 50 + 50 + 10,
                        expected: {
                            amountPool: 50,
                            baseFull: 50,
                            quoteFull: 25,
                            basePartial: 10,
                            quotePartial: 5,
                            fullLastKey: 1,
                            partialKey: 4,
                        },
                    },
                    {
                        title: "full and partial",
                        isExactInput: false,
                        amount: 100 + 25 + 10,
                        expected: {
                            amountPool: 100,
                            baseFull: 50,
                            quoteFull: 25,
                            basePartial: 20,
                            quotePartial: 10,
                            fullLastKey: 1,
                            partialKey: 4,
                        },
                    },
                    {
                        title: "full and partial with funding",
                        isExactInput: true,
                        amount: 75 + 100 + 20,
                        expected: {
                            amountPool: 75,
                            baseFull: 100,
                            quoteFull: 25,
                            basePartial: 20,
                            quotePartial: 5,
                            fullLastKey: 4,
                            partialKey: 7,
                        },
                        baseBalancePerShareX96: Q96.div(2),
                    },
                    {
                        title: "full and partial with funding",
                        isExactInput: false,
                        amount: 150 + 25 + 5,
                        expected: {
                            amountPool: 150,
                            baseFull: 100,
                            quoteFull: 25,
                            basePartial: 20,
                            quotePartial: 5,
                            fullLastKey: 4,
                            partialKey: 7,
                        },
                        baseBalancePerShareX96: Q96.div(2),
                    },
                    {
                        title: "between order",
                        isExactInput: true,
                        amount: 50 + 50 * 10 + 10,
                        expected: {
                            amountPool: 50 + 10,
                            baseFull: 50 * 10,
                            quoteFull: 25 * 10,
                            basePartial: 0,
                            quotePartial: 0,
                            fullLastKey: 28,
                            partialKey: 0,
                        },
                    },
                    {
                        title: "between order",
                        isExactInput: false,
                        amount: 100 + 25 * 10 + 10,
                        expected: {
                            amountPool: 100 + 10,
                            baseFull: 50 * 10,
                            quoteFull: 25 * 10,
                            basePartial: 0,
                            quotePartial: 0,
                            fullLastKey: 28,
                            partialKey: 0,
                        },
                    },
                    {
                        title: "all",
                        isExactInput: true,
                        amount: 350 * 10 + 87 + 1,
                        expected: {
                            amountPool: 87 + 1,
                            baseFull: 350 * 10,
                            quoteFull: 75 * 10,
                            basePartial: 0,
                            quotePartial: 0,
                            fullLastKey: 30,
                            partialKey: 0,
                        },
                    },
                    {
                        title: "all",
                        isExactInput: false,
                        amount: 75 * 10 + 87 * 2 + 1,
                        expected: {
                            amountPool: 87 * 2 + 1,
                            baseFull: 350 * 10,
                            quoteFull: 75 * 10,
                            basePartial: 0,
                            quotePartial: 0,
                            fullLastKey: 30,
                            partialKey: 0,
                        },
                    },
                    {
                        title: "all with funding",
                        isExactInput: true,
                        amount: 350 * 10 + 93 + 1,
                        expected: {
                            amountPool: 93 + 1,
                            baseFull: 350 * 10,
                            quoteFull: (75 * 10) / 2,
                            basePartial: 0,
                            quotePartial: 0,
                            fullLastKey: 30,
                            partialKey: 0,
                        },
                        baseBalancePerShareX96: Q96.div(2),
                    },
                    {
                        title: "all with funding",
                        isExactInput: false,
                        amount: (75 * 10) / 2 + 93 * 2 + 1,
                        expected: {
                            amountPool: 93 * 2 + 1,
                            baseFull: 350 * 10,
                            quoteFull: (75 * 10) / 2,
                            basePartial: 0,
                            quotePartial: 0,
                            fullLastKey: 30,
                            partialKey: 0,
                        },
                        baseBalancePerShareX96: Q96.div(2),
                    },
                ],
            },
        ].forEach(test => {
            describe(test.title, () => {
                test.tests.forEach(subtest => {
                    describe(subtest.title + (subtest.isExactInput ? " exact input" : " exact output"), () => {
                        it("ok", async () => {
                            await library.createOrders(test.orders)
                            const result = await library.previewSwap(
                                test.isBaseToQuote,
                                subtest.isExactInput,
                                subtest.amount,
                                subtest.baseBalancePerShareX96 || Q96,
                            )
                            _.each(subtest.expected, (_value, key) => {
                                expect(result[key]).to.deep.eq(subtest.expected[key], key)
                            })
                        })
                    })
                })
            })
        })
    })
})
