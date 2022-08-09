import { expect } from "chai"
import { ethers, waffle } from "hardhat"
import { createPerpdexMarketFixture } from "./fixtures"
import { MockContract } from "ethereum-waffle"
import { Wallet } from "ethers"

describe("PerpdexMarket constructor", () => {
    let loadFixture = waffle.createFixtureLoader(waffle.provider.getWallets())
    let fixture

    let priceFeed: MockContract
    let exchange: Wallet
    let factory
    const symbol = "test"
    const invalidAddress = "0x0000000000000000000000000000000000000001"

    beforeEach(async () => {
        fixture = await loadFixture(createPerpdexMarketFixture())
        priceFeed = fixture.priceFeed
        exchange = fixture.alice
        factory = await ethers.getContractFactory("PerpdexMarket", {
            libraries: {
                OrderBookLibrary: fixture.orderBookLibrary.address,
            },
        })
    })

    describe("constructor", () => {
        it("zero", async () => {
            await expect(
                factory.deploy(
                    symbol,
                    exchange.address,
                    hre.ethers.constants.AddressZero,
                    hre.ethers.constants.AddressZero,
                ),
            ).not.to.reverted
        })

        it("contract", async () => {
            await expect(factory.deploy(symbol, exchange.address, priceFeed.address, priceFeed.address)).not.to.reverted
        })

        it("invalid base", async () => {
            await expect(
                factory.deploy(symbol, exchange.address, invalidAddress, hre.ethers.constants.AddressZero),
            ).to.revertedWith("PM_C: base price feed invalid")
        })

        it("invalid quote", async () => {
            await expect(
                factory.deploy(symbol, exchange.address, hre.ethers.constants.AddressZero, invalidAddress),
            ).to.revertedWith("PM_C: quote price feed invalid")
        })
    })
})
