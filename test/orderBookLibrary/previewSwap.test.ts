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
                ],
            },
        ].forEach(test => {
            describe(test.title, () => {
                test.tests.forEach(subtest => {
                    describe(subtest.title + subtest.isExactInput ? " exact input" : " exact output", () => {
                        it("ok", async () => {
                            await library.createOrders(test.orders)
                            const result = await library.previewSwap(
                                test.isBaseToQuote,
                                subtest.isExactInput,
                                subtest.amount,
                                Q96,
                            )
                            _.each(subtest.expected, (_value, key) => {
                                expect(result[key]).to.deep.eq(subtest.expected[key])
                            })
                        })
                    })
                })
            })
        })
    })
})
