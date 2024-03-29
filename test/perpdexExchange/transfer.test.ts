import { expect } from "chai"
import { parseUnits } from "ethers/lib/utils"
import { ethers, waffle } from "hardhat"
import { TestPerpdexExchange, TestERC20 } from "../../typechain"
import { createPerpdexExchangeFixture } from "./fixtures"
import { Wallet } from "ethers"
import { PANIC_CODES } from "@nomicfoundation/hardhat-chai-matchers/panic"

describe("PerpdexExchange transfer", () => {
    let loadFixture = waffle.createFixtureLoader(waffle.provider.getWallets())
    let fixture
    let exchange: TestPerpdexExchange
    let owner: Wallet

    beforeEach(async () => {
        fixture = await loadFixture(createPerpdexExchangeFixture())
        exchange = fixture.perpdexExchange
        owner = fixture.owner
    })

    describe("transferProtocolFee", () => {
        it("ok", async () => {
            await exchange.setProtocolInfo({
                protocolFee: 100,
            })
            await expect(exchange.connect(owner).transferProtocolFee(30))
                .to.emit(exchange, "ProtocolFeeTransferred")
                .withArgs(owner.address, 30)

            const balance = await exchange.protocolInfo()
            expect(balance).to.eq(70)

            const result = await exchange.accountInfos(owner.address)
            expect(result.vaultInfo.collateralBalance).to.eq(30)
        })

        it("force error, not enough balance", async () => {
            await expect(exchange.connect(owner).transferProtocolFee(30)).to.revertedWithPanic(
                PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW,
            )
        })
    })
})
