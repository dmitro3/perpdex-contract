import { expect } from "chai"
import { waffle } from "hardhat"
import { TestPoolFeeLibrary } from "../../typechain"
import { createPoolFeeLibraryFixture } from "./fixtures"
import { getTimestamp, setNextTimestamp } from "../helper/time"
import { BigNumber } from "ethers"

describe("PoolFeeLibrary update", () => {
    let loadFixture = waffle.createFixtureLoader(waffle.provider.getWallets())
    let fixture

    let library: TestPoolFeeLibrary

    const Q96 = BigNumber.from(2).pow(96)

    beforeEach(async () => {
        fixture = await loadFixture(createPoolFeeLibraryFixture())
        library = fixture.poolFeeLibrary
    })

    describe("various cases", () => {
        ;[
            {
                title: "first time",
                poolFeeInfo: {
                    atrX96: 0,
                    referenceTimestamp: -1,
                    currentHighX96: 0,
                    currentLowX96: 0,
                },
                atrEmaBlocks: 1,
                prevPriceX96: 1,
                currentPriceX96: 2,
                expected: {
                    atrX96: 0,
                    referenceTimestamp: 0,
                    currentHighX96: 2,
                    currentLowX96: 1,
                },
            },
            {
                title: "second time",
                poolFeeInfo: {
                    atrX96: 0,
                    referenceTimestamp: -1,
                    currentHighX96: 2,
                    currentLowX96: 1,
                },
                atrEmaBlocks: 1,
                prevPriceX96: 2,
                currentPriceX96: 4,
                expected: {
                    atrX96: Q96.div(2),
                    referenceTimestamp: 0,
                    currentHighX96: 4,
                    currentLowX96: 2,
                },
            },
            {
                title: "same time high updated",
                poolFeeInfo: {
                    atrX96: 0,
                    referenceTimestamp: 0,
                    currentHighX96: 3,
                    currentLowX96: 2,
                },
                atrEmaBlocks: 1,
                prevPriceX96: 1,
                currentPriceX96: 4,
                expected: {
                    atrX96: 0,
                    referenceTimestamp: 0,
                    currentHighX96: 4,
                    currentLowX96: 2,
                },
            },
            {
                title: "same time low updated",
                poolFeeInfo: {
                    atrX96: 0,
                    referenceTimestamp: 0,
                    currentHighX96: 3,
                    currentLowX96: 2,
                },
                atrEmaBlocks: 1,
                prevPriceX96: 4,
                currentPriceX96: 1,
                expected: {
                    atrX96: 0,
                    referenceTimestamp: 0,
                    currentHighX96: 3,
                    currentLowX96: 1,
                },
            },
            {
                title: "future time",
                poolFeeInfo: {
                    atrX96: 0,
                    referenceTimestamp: 1,
                    currentHighX96: 3,
                    currentLowX96: 2,
                },
                atrEmaBlocks: 1,
                prevPriceX96: 1,
                currentPriceX96: 4,
                expected: {
                    atrX96: 0,
                    referenceTimestamp: 1,
                    currentHighX96: 4,
                    currentLowX96: 2,
                },
            },
        ].forEach(test => {
            it(test.title, async () => {
                const currentTimestamp = await getTimestamp()
                const nextTimeStamp = currentTimestamp + 1000
                await setNextTimestamp(nextTimeStamp)
                await library.update(
                    {
                        ...test.poolFeeInfo,
                        referenceTimestamp: nextTimeStamp + test.poolFeeInfo.referenceTimestamp,
                    },
                    test.atrEmaBlocks,
                    test.prevPriceX96,
                    test.currentPriceX96,
                )
                const info = await library.poolFeeInfo()
                expect(info.atrX96).to.eq(test.expected.atrX96)
                expect(info.referenceTimestamp).to.eq(nextTimeStamp + test.expected.referenceTimestamp)
                expect(info.currentHighX96).to.eq(test.expected.currentHighX96)
                expect(info.currentLowX96).to.eq(test.expected.currentLowX96)
            })
        })
    })
})
