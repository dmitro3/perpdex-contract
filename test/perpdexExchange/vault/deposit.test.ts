import { expect } from "chai"
import { parseUnits } from "ethers/lib/utils"
import { ethers, waffle } from "hardhat"
import { TestPerpdexExchange, TestPerpdexMarket, TestERC20 } from "../../../typechain"
import { createPerpdexExchangeFixture } from "../fixtures"

describe("Vault deposit test", () => {
    const [admin, alice] = waffle.provider.getWallets()
    const loadFixture: ReturnType<typeof waffle.createFixtureLoader> = waffle.createFixtureLoader([admin])
    let fixture
    let usdc: TestERC20
    let exchange: TestPerpdexExchange
    let market: TestPerpdexMarket
    let usdcDecimals: number

    function parseUsdc(amount: string) {
        return parseUnits(amount, usdcDecimals)
    }

    beforeEach(async () => {
        fixture = await loadFixture(
            createPerpdexExchangeFixture({
                linear: true,
            }),
        )
        exchange = fixture.perpdexExchange
        market = fixture.perpdexMarket
        usdc = fixture.USDC
        usdcDecimals = await usdc.decimals()

        const amount = parseUsdc("1000")
        await usdc.mint(alice.address, amount)

        await usdc.connect(alice).approve(exchange.address, ethers.constants.MaxUint256)
    })

    describe("settlement token", () => {
        it("deposit settlement token", async () => {
            const amount = parseUsdc("100")

            // check event has been sent
            await expect(exchange.connect(alice).deposit(amount))
                .to.emit(exchange, "Deposited")
                .withArgs(alice.address, amount)

            // reduce alice balance
            expect(await usdc.balanceOf(alice.address)).to.eq(parseUsdc("900"))

            // increase vault balance
            expect(await usdc.balanceOf(exchange.address)).to.eq(amount)

            // update sender's balance
            const result = await exchange.accountInfos(alice.address)
            expect(result.vaultInfo.collateralBalance).to.eq(amount.mul(1e12))
        })

        it("force error, not enough balance", async () => {
            const amount = parseUsdc("1100")
            await expect(exchange.connect(alice).deposit(amount)).to.be.revertedWith(
                "ERC20: transfer amount exceeds balance",
            )
        })

        it("force error, inconsistent vault balance with deflationary token", async () => {
            usdc.setTransferFeeRatio(50)
            await expect(exchange.connect(alice).deposit(parseUsdc("100"))).to.be.revertedWith(
                "VL_TTI: inconsistent balance",
            )
            usdc.setTransferFeeRatio(0)
        })

        it("force error, zero amount", async () => {
            await expect(exchange.connect(alice).deposit(parseUsdc("0"))).to.be.revertedWith("VL_D: zero amount")
        })

        it("force error, value is not zero", async () => {
            const amount = parseUsdc("100")
            await expect(exchange.connect(alice).deposit(amount, { value: 1 })).to.be.revertedWith(
                "PE_D: msg.value not zero",
            )
        })
    })

    describe("collateral compensation", () => {
        it("normal", async () => {
            const amount = parseUsdc("100")
            await exchange.setInsuranceFundInfo({ balance: 50, liquidationRewardBalance: 0 })
            await exchange.setAccountInfo(alice.address, { collateralBalance: -50 }, [])

            await expect(exchange.connect(alice).deposit(amount))
                .to.emit(exchange, "CollateralCompensated")
                .withArgs(alice.address, 50)

            expect(await usdc.balanceOf(alice.address)).to.eq(parseUsdc("900"))
            expect(await usdc.balanceOf(exchange.address)).to.eq(amount)

            const result = await exchange.accountInfos(alice.address)
            expect(result.vaultInfo.collateralBalance).to.eq(amount.mul(1e12))
        })

        it("insurance fund empty", async () => {
            const amount = parseUsdc("100")
            await exchange.setInsuranceFundInfo({ balance: 0, liquidationRewardBalance: 0 })
            await exchange.setAccountInfo(alice.address, { collateralBalance: -50 }, [])

            await expect(exchange.connect(alice).deposit(amount)).not.to.emit(exchange, "CollateralCompensated")

            expect(await usdc.balanceOf(alice.address)).to.eq(parseUsdc("900"))
            expect(await usdc.balanceOf(exchange.address)).to.eq(amount)

            const result = await exchange.accountInfos(alice.address)
            expect(result.vaultInfo.collateralBalance).to.eq(amount.mul(1e12).sub(50))
        })

        it("insurance fund not enough", async () => {
            const amount = parseUsdc("100")
            await exchange.setInsuranceFundInfo({ balance: 49, liquidationRewardBalance: 0 })
            await exchange.setAccountInfo(alice.address, { collateralBalance: -50 }, [])

            await expect(exchange.connect(alice).deposit(amount))
                .to.emit(exchange, "CollateralCompensated")
                .withArgs(alice.address, 49)

            expect(await usdc.balanceOf(alice.address)).to.eq(parseUsdc("900"))
            expect(await usdc.balanceOf(exchange.address)).to.eq(amount)

            const result = await exchange.accountInfos(alice.address)
            expect(result.vaultInfo.collateralBalance).to.eq(amount.mul(1e12).sub(1))
        })

        it("market active", async () => {
            const amount = parseUsdc("100")
            await exchange.setInsuranceFundInfo({ balance: 50, liquidationRewardBalance: 0 })
            await exchange.setAccountInfo(alice.address, { collateralBalance: -50 }, [market.address])

            await expect(exchange.connect(alice).deposit(amount)).not.to.emit(exchange, "CollateralCompensated")

            expect(await usdc.balanceOf(alice.address)).to.eq(parseUsdc("900"))
            expect(await usdc.balanceOf(exchange.address)).to.eq(amount)

            const result = await exchange.accountInfos(alice.address)
            expect(result.vaultInfo.collateralBalance).to.eq(amount.mul(1e12).sub(50))
        })
    })
})
