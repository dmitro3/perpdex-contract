import { expect } from "chai"
import { waffle } from "hardhat"
import { TestPerpdexMarket, TestPerpdexExchange } from "../../typechain"
import { createPerpdexExchangeFixture } from "./fixtures"
import { BigNumber, BigNumberish, Wallet } from "ethers"
import { MockContract } from "ethereum-waffle"

describe("PerpdexExchange limitOrder", () => {
    let loadFixture = waffle.createFixtureLoader(waffle.provider.getWallets())
    let fixture

    let exchange: TestPerpdexExchange
    let market: TestPerpdexMarket
    let owner: Wallet
    let alice: Wallet
    let priceFeed: MockContract

    const Q96 = BigNumber.from(2).pow(96)
    const deadline = Q96

    beforeEach(async () => {
        fixture = await loadFixture(createPerpdexExchangeFixture())
        exchange = fixture.perpdexExchange
        market = fixture.perpdexMarket
        owner = fixture.owner
        alice = fixture.alice
        priceFeed = fixture.priceFeed

        await exchange.connect(owner).setImRatio(10e4)
        await exchange.connect(owner).setMmRatio(5e4)
        await exchange.connect(owner).setLiquidationRewardConfig({
            rewardRatio: 25e4,
            smoothEmaTime: 1,
        })

        await market.connect(owner).setPoolFeeRatio(0)
        await market.connect(owner).setFundingMaxPremiumRatio(0)
        await exchange.connect(owner).setIsMarketAllowed(market.address, true)
        await market.connect(owner).setPriceLimitConfig({
            normalOrderRatio: 5e4,
            liquidationRatio: 10e4,
            emaNormalOrderRatio: 5e4,
            emaLiquidationRatio: 10e4,
            emaSec: 300,
        })

        await exchange.setAccountInfo(
            owner.address,
            {
                collateralBalance: 100000,
            },
            [],
        )

        await exchange.connect(owner).addLiquidity({
            market: market.address,
            base: 10000,
            quote: 10000,
            minBase: 0,
            minQuote: 0,
            deadline: deadline,
        })
    })

    describe("createLimitOrder", () => {
        it("normal", async () => {
            await expect(
                exchange.connect(alice).createLimitOrder({
                    market: market.address,
                    isBid: true,
                    base: 1,
                    priceX96: Q96,
                    deadline: deadline,
                }),
            )
                .to.emit(exchange, "LimitOrderCreated")
                .withArgs(alice.address, market.address, true, 1, Q96, 1)

            await expect(
                exchange.connect(alice).createLimitOrder({
                    market: market.address,
                    isBid: false,
                    base: 1,
                    priceX96: Q96,
                    deadline: deadline,
                }),
            )
                .to.emit(exchange, "LimitOrderCreated")
                .withArgs(alice.address, market.address, false, 1, Q96, 1)
        })

        it("multiple", async () => {
            await expect(
                exchange.connect(alice).createLimitOrder({
                    market: market.address,
                    isBid: true,
                    base: 1,
                    priceX96: Q96,
                    deadline: deadline,
                }),
            )
                .to.emit(exchange, "LimitOrderCreated")
                .withArgs(alice.address, market.address, true, 1, Q96, 1)
            await expect(
                exchange.connect(alice).createLimitOrder({
                    market: market.address,
                    isBid: true,
                    base: 1,
                    priceX96: Q96,
                    deadline: deadline,
                }),
            )
                .to.emit(exchange, "LimitOrderCreated")
                .withArgs(alice.address, market.address, true, 1, Q96, 2)

            await expect(
                exchange.connect(alice).createLimitOrder({
                    market: market.address,
                    isBid: false,
                    base: 1,
                    priceX96: Q96,
                    deadline: deadline,
                }),
            )
                .to.emit(exchange, "LimitOrderCreated")
                .withArgs(alice.address, market.address, false, 1, Q96, 1)
            await expect(
                exchange.connect(alice).createLimitOrder({
                    market: market.address,
                    isBid: false,
                    base: 1,
                    priceX96: Q96,
                    deadline: deadline,
                }),
            )
                .to.emit(exchange, "LimitOrderCreated")
                .withArgs(alice.address, market.address, false, 1, Q96, 2)
        })
    })

    describe("cancelLimitOrder", () => {
        it("normal", async () => {
            await expect(
                exchange.connect(alice).createLimitOrder({
                    market: market.address,
                    isBid: true,
                    base: 1,
                    priceX96: Q96,
                    deadline: deadline,
                }),
            )
                .to.emit(exchange, "LimitOrderCreated")
                .withArgs(alice.address, market.address, true, 1, Q96, 1)
            await expect(
                exchange.connect(alice).cancelLimitOrder({
                    market: market.address,
                    isBid: true,
                    orderId: 1,
                    deadline: deadline,
                }),
            )
                .to.emit(exchange, "LimitOrderCanceled")
                .withArgs(alice.address, market.address, hre.ethers.constants.AddressZero, true, 1)

            await expect(
                exchange.connect(alice).createLimitOrder({
                    market: market.address,
                    isBid: false,
                    base: 1,
                    priceX96: Q96,
                    deadline: deadline,
                }),
            )
                .to.emit(exchange, "LimitOrderCreated")
                .withArgs(alice.address, market.address, false, 1, Q96, 1)
            await expect(
                exchange.connect(alice).cancelLimitOrder({
                    market: market.address,
                    isBid: false,
                    orderId: 1,
                    deadline: deadline,
                }),
            )
                .to.emit(exchange, "LimitOrderCanceled")
                .withArgs(alice.address, market.address, hre.ethers.constants.AddressZero, false, 1)
        })

        it("empty", async () => {
            await expect(
                exchange.connect(alice).cancelLimitOrder({
                    market: market.address,
                    isBid: true,
                    orderId: 1,
                    deadline: deadline,
                }),
            ).to.revertedWith("PE_CLO: order not exist")
        })
    })
})
