import { expect } from "chai"
import { waffle } from "hardhat"
import { TestPerpdexExchange, TestPerpdexMarket } from "../../typechain"
import { createPerpdexExchangeFixture } from "./fixtures"
import { BigNumber, Wallet } from "ethers"
import { getTimestamp, setNextTimestamp } from "../helper/time"

describe("PerpdexExchange deadline", () => {
    let loadFixture = waffle.createFixtureLoader(waffle.provider.getWallets())
    let fixture

    let exchange: TestPerpdexExchange
    let market: TestPerpdexMarket
    let owner: Wallet
    let alice: Wallet
    let nextBlockTimestamp: number

    beforeEach(async () => {
        fixture = await loadFixture(createPerpdexExchangeFixture({ isMarketAllowed: true }))
        exchange = fixture.perpdexExchange
        market = fixture.perpdexMarket
        owner = fixture.owner
        alice = fixture.alice
        nextBlockTimestamp = (await getTimestamp()) + 1000

        await exchange.setAccountInfo(
            alice.address,
            {
                collateralBalance: 10000,
            },
            [market.address],
        )

        await exchange.connect(alice).addLiquidity({
            market: market.address,
            base: 10000,
            quote: 10000,
            minBase: 0,
            minQuote: 0,
            deadline: nextBlockTimestamp + 1,
        })

        await exchange.connect(alice).createLimitOrder({
            market: market.address,
            isBid: true,
            base: 1,
            priceX96: 1,
            deadline: nextBlockTimestamp + 1,
        })

        await setNextTimestamp(nextBlockTimestamp)
    })

    describe("trade", () => {
        it("before", async () => {
            await expect(
                exchange.connect(alice).trade({
                    trader: alice.address,
                    market: market.address,
                    isBaseToQuote: false,
                    isExactInput: true,
                    amount: 100,
                    oppositeAmountBound: 0,
                    deadline: nextBlockTimestamp + 1,
                }),
            ).not.to.revertedWith("PE_CD: too late")
        })

        it("just", async () => {
            await expect(
                exchange.connect(alice).trade({
                    trader: alice.address,
                    market: market.address,
                    isBaseToQuote: false,
                    isExactInput: true,
                    amount: 100,
                    oppositeAmountBound: 0,
                    deadline: nextBlockTimestamp,
                }),
            ).not.to.revertedWith("PE_CD: too late")
        })

        it("after", async () => {
            await expect(
                exchange.connect(alice).trade({
                    trader: alice.address,
                    market: market.address,
                    isBaseToQuote: false,
                    isExactInput: true,
                    amount: 100,
                    oppositeAmountBound: 0,
                    deadline: nextBlockTimestamp - 1,
                }),
            ).to.revertedWith("PE_CD: too late")
        })
    })

    describe("addLiquidity", () => {
        it("before", async () => {
            await expect(
                exchange.connect(alice).addLiquidity({
                    market: market.address,
                    base: 100,
                    quote: 100,
                    minBase: 0,
                    minQuote: 0,
                    deadline: nextBlockTimestamp + 1,
                }),
            ).not.to.revertedWith("PE_CD: too late")
        })

        it("just", async () => {
            await expect(
                exchange.connect(alice).addLiquidity({
                    market: market.address,
                    base: 100,
                    quote: 100,
                    minBase: 0,
                    minQuote: 0,
                    deadline: nextBlockTimestamp,
                }),
            ).not.to.revertedWith("PE_CD: too late")
        })

        it("after", async () => {
            await expect(
                exchange.connect(alice).addLiquidity({
                    market: market.address,
                    base: 100,
                    quote: 100,
                    minBase: 0,
                    minQuote: 0,
                    deadline: nextBlockTimestamp - 1,
                }),
            ).to.revertedWith("PE_CD: too late")
        })
    })

    describe("removeLiquidity", () => {
        it("before", async () => {
            await expect(
                exchange.connect(alice).removeLiquidity({
                    trader: alice.address,
                    market: market.address,
                    liquidity: 100,
                    minBase: 0,
                    minQuote: 0,
                    deadline: nextBlockTimestamp + 1,
                }),
            ).not.to.revertedWith("PE_CD: too late")
        })

        it("just", async () => {
            await expect(
                exchange.connect(alice).removeLiquidity({
                    trader: alice.address,
                    market: market.address,
                    liquidity: 100,
                    minBase: 0,
                    minQuote: 0,
                    deadline: nextBlockTimestamp,
                }),
            ).not.to.revertedWith("PE_CD: too late")
        })

        it("after", async () => {
            await expect(
                exchange.connect(alice).removeLiquidity({
                    trader: alice.address,
                    market: market.address,
                    liquidity: 100,
                    minBase: 0,
                    minQuote: 0,
                    deadline: nextBlockTimestamp - 1,
                }),
            ).to.revertedWith("PE_CD: too late")
        })
    })

    describe("createLimitOrder", () => {
        it("before", async () => {
            await expect(
                exchange.connect(alice).createLimitOrder({
                    market: market.address,
                    isBid: true,
                    base: 1,
                    priceX96: 1,
                    deadline: nextBlockTimestamp + 1,
                }),
            ).not.to.revertedWith("PE_CD: too late")
        })

        it("just", async () => {
            await expect(
                exchange.connect(alice).createLimitOrder({
                    market: market.address,
                    isBid: true,
                    base: 1,
                    priceX96: 1,
                    deadline: nextBlockTimestamp,
                }),
            ).not.to.revertedWith("PE_CD: too late")
        })

        it("after", async () => {
            await expect(
                exchange.connect(alice).createLimitOrder({
                    market: market.address,
                    isBid: true,
                    base: 1,
                    priceX96: 1,
                    deadline: nextBlockTimestamp - 1,
                }),
            ).to.revertedWith("PE_CD: too late")
        })
    })

    describe("cancelLimitOrder", () => {
        it("before", async () => {
            await expect(
                exchange.connect(alice).cancelLimitOrder({
                    market: market.address,
                    isBid: false,
                    orderId: 1,
                    deadline: nextBlockTimestamp + 1,
                }),
            ).not.to.revertedWith("PE_CD: too late")
        })

        it("just", async () => {
            await expect(
                exchange.connect(alice).cancelLimitOrder({
                    market: market.address,
                    isBid: false,
                    orderId: 1,
                    deadline: nextBlockTimestamp,
                }),
            ).not.to.revertedWith("PE_CD: too late")
        })

        it("after", async () => {
            await expect(
                exchange.connect(alice).cancelLimitOrder({
                    market: market.address,
                    isBid: false,
                    orderId: 1,
                    deadline: nextBlockTimestamp - 1,
                }),
            ).to.revertedWith("PE_CD: too late")
        })
    })
})
