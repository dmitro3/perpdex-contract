import { expect } from "chai"
import { waffle } from "hardhat"
import { TestPerpdexExchange, TestPerpdexMarket } from "../../typechain"
import { createPerpdexExchangeFixture } from "./fixtures"
import { Wallet } from "ethers"

describe("PerpdexExchange multicall", () => {
    let loadFixture = waffle.createFixtureLoader(waffle.provider.getWallets())
    let fixture

    let exchange: TestPerpdexExchange
    let owner: Wallet

    beforeEach(async () => {
        fixture = await loadFixture(createPerpdexExchangeFixture())
        exchange = fixture.perpdexExchange
        owner = fixture.owner
    })

    describe("multicall", () => {
        it("ok", async () => {
            const calls = [
                exchange.interface.encodeFunctionData("setMaxMarketsPerAccount", [1]),
                exchange.interface.encodeFunctionData("setMmRatio", [2]),
            ]

            await expect(exchange.connect(owner).multicall(calls))
                .to.emit(exchange, "MaxMarketsPerAccountChanged")
                .withArgs(1)
                .to.emit(exchange, "MmRatioChanged")
                .withArgs(2)

            expect(await exchange.maxMarketsPerAccount()).to.eq(1)
            expect(await exchange.mmRatio()).to.eq(2)
        })
    })
})
