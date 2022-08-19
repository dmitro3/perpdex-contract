import { expect } from "chai"
import { ethers, waffle } from "hardhat"
import { TestERC20 } from "../../typechain"
import { createPerpdexExchangeFixture } from "./fixtures"

describe("PerpdexExchange constructor", () => {
    let loadFixture = waffle.createFixtureLoader(waffle.provider.getWallets())
    let fixture
    let factory

    let USDC: TestERC20
    const invalidAddress = "0x0000000000000000000000000000000000000001"

    beforeEach(async () => {
        fixture = await loadFixture(createPerpdexExchangeFixture({ linear: true }))
        USDC = fixture.USDC

        factory = await ethers.getContractFactory("PerpdexExchange", {
            libraries: {
                AccountLibrary: fixture.accountLibrary.address,
                MakerLibrary: fixture.makerLibrary.address,
                MakerOrderBookLibrary: fixture.makerOrderBookLibrary.address,
                VaultLibrary: fixture.vaultLibrary.address,
            },
        })
    })

    describe("constructor", () => {
        it("zero", async () => {
            await expect(factory.deploy(hre.ethers.constants.AddressZero, hre.ethers.constants.AddressZero, [])).not.to
                .reverted
        })

        it("erc20", async () => {
            await expect(factory.deploy(hre.ethers.constants.AddressZero, USDC.address, [])).not.to.reverted
        })

        it("invalid", async () => {
            await expect(factory.deploy(hre.ethers.constants.AddressZero, invalidAddress, [])).to.revertedWith(
                "PE_C: token address invalid",
            )
        })
    })
})
