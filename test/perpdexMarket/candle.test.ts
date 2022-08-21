import { expect } from "chai"
import { waffle } from "hardhat"
import { TestPerpdexMarket } from "../../typechain"
import { createPerpdexMarketFixture } from "./fixtures"
import { BigNumber, BigNumberish, Wallet } from "ethers"
import { MockContract } from "ethereum-waffle"
import { getTimestamp, setNextTimestamp } from "../helper/time"

describe("PerpdexMarket candle", () => {
    let loadFixture = waffle.createFixtureLoader(waffle.provider.getWallets())
    let fixture

    let market: TestPerpdexMarket
    let owner: Wallet
    let alice: Wallet
    let exchange: Wallet
    let baseTime: number

    const Q96 = BigNumber.from(2).pow(96)
    const day = 24 * 60 * 60

    beforeEach(async () => {
        fixture = await loadFixture(createPerpdexMarketFixture())
        market = fixture.perpdexMarket
        owner = fixture.owner
        alice = fixture.alice
        exchange = fixture.exchange
    })

    const assertCandles = (actual, expected) => {
        expect(actual.length).to.eq(expected.length)
        for (let i = 0; i < actual.length; i++) {
            expect(actual[i].quote).to.eq(expected[i].quote)
            expect(actual[i].closeX96).to.eq(expected[i].closeX96)
            expect(actual[i].highX96).to.eq(expected[i].highX96)
            expect(actual[i].lowX96).to.eq(expected[i].lowX96)
        }
    }

    describe("candle", () => {
        beforeEach(async () => {
            await market.connect(exchange).addLiquidity(10000, 10000)

            const currentTimestamp = await getTimestamp()
            baseTime = Math.floor((currentTimestamp + 1000 + day) / day) * day
        })

        it("normal", async () => {
            await setNextTimestamp(baseTime)
            await market.connect(exchange).swap(false, false, 100, false)

            await setNextTimestamp(baseTime + 59)
            await market.connect(exchange).swap(true, true, 100, false)

            for (let i = 0; i < 5; i++) {
                const interval = [60, 300, 3600, 4 * 3600, 24 * 3600][i]
                assertCandles(await market.getCandles(interval, baseTime, 1), [
                    {
                        closeX96: BigNumber.from("79236085330515764027303304731"),
                        highX96: BigNumber.from("80844737143343266502018281443"),
                        lowX96: BigNumber.from("79236085330515764027303304731"),
                        quote: 203,
                    },
                ])
            }
        })

        it("last candle", async () => {
            await setNextTimestamp(baseTime)
            await market.connect(exchange).swap(false, false, 100, false)

            await setNextTimestamp(baseTime + day - 1)
            await market.connect(exchange).swap(true, true, 100, false)

            for (let i = 0; i < 4; i++) {
                const interval = [60, 300, 3600, 4 * 3600, 24 * 3600][i]
                assertCandles(await market.getCandles(interval, baseTime, 1), [
                    {
                        closeX96: BigNumber.from("80844737143343266502018281443"),
                        highX96: BigNumber.from("80844737143343266502018281443"),
                        lowX96: BigNumber.from("80844737143343266502018281443"),
                        quote: 102,
                    },
                ])
            }

            const interval = [60, 300, 3600, 4 * 3600, 24 * 3600][4]
            assertCandles(await market.getCandles(interval, baseTime, 1), [
                {
                    closeX96: BigNumber.from("79236085330515764027303304731"),
                    highX96: BigNumber.from("80844737143343266502018281443"),
                    lowX96: BigNumber.from("79236085330515764027303304731"),
                    quote: 203,
                },
            ])
        })

        it("2 days", async () => {
            await setNextTimestamp(baseTime)
            await market.connect(exchange).swap(false, false, 100, false)

            await setNextTimestamp(baseTime + day)
            await market.connect(exchange).swap(true, true, 100, false)

            for (let i = 0; i < 5; i++) {
                const interval = [60, 300, 3600, 4 * 3600, 24 * 3600][i]
                assertCandles(await market.getCandles(interval, baseTime, 1), [
                    {
                        closeX96: BigNumber.from("80844737143343266502018281443"),
                        highX96: BigNumber.from("80844737143343266502018281443"),
                        lowX96: BigNumber.from("80844737143343266502018281443"),
                        quote: 102,
                    },
                ])
            }

            for (let i = 0; i < 5; i++) {
                const interval = [60, 300, 3600, 4 * 3600, 24 * 3600][i]
                assertCandles(await market.getCandles(interval, baseTime + day, 1), [
                    {
                        closeX96: BigNumber.from("79236085330515764027303304731"),
                        highX96: BigNumber.from("79236085330515764027303304731"),
                        lowX96: BigNumber.from("79236085330515764027303304731"),
                        quote: 101,
                    },
                ])
            }
        })
    })
})
