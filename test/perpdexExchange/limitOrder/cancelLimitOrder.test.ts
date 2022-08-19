import { expect } from "chai"
import { waffle } from "hardhat"
import { TestPerpdexMarket, TestPerpdexExchange } from "../../../typechain"
import { createPerpdexExchangeFixture } from "../fixtures"
import { BigNumber, Wallet } from "ethers"
import { MarketStatus } from "../../helper/types"

describe("PerpdexExchange limitOrder", () => {
    let loadFixture = waffle.createFixtureLoader(waffle.provider.getWallets())
    let fixture

    let exchange: TestPerpdexExchange
    let market: TestPerpdexMarket
    let owner: Wallet
    let alice: Wallet

    const Q96 = BigNumber.from(2).pow(96)
    const deadline = Q96

    const assertLimitOrderCount = async expected => {
        expect((await exchange.accountInfos(alice.address)).limitOrderCount).to.eq(expected)
    }

    const assertTotalBase = async expected => {
        const info = await exchange.getLimitOrderInfo(alice.address, market.address)
        expect(info.slice(2, 4)).to.deep.eq(expected)
    }

    const assertMarkets = async expected => {
        expect(await exchange.getAccountMarkets(alice.address)).to.deep.eq(expected)
    }

    beforeEach(async () => {
        fixture = await loadFixture(createPerpdexExchangeFixture({ isMarketAllowed: true, initPool: true }))
        exchange = fixture.perpdexExchange
        market = fixture.perpdexMarket
        owner = fixture.owner
        alice = fixture.alice

        await exchange.connect(owner).setImRatio(10e4)
        await exchange.connect(owner).setMmRatio(5e4)

        await exchange.setAccountInfo(
            alice.address,
            {
                collateralBalance: 100000,
            },
            [],
        )
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

            await assertLimitOrderCount(0)
            await assertTotalBase([0, 0])
            await assertMarkets([])
            expect(await exchange.getLimitOrderIds(alice.address, market.address, true)).to.deep.eq([])
            expect(await exchange.getLimitOrderIds(alice.address, market.address, false)).to.deep.eq([])
        })

        it("liquidation bid", async () => {
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
            await exchange.setAccountInfo(
                alice.address,
                {
                    collateralBalance: -1,
                },
                [],
            )
            await expect(
                exchange.connect(owner).cancelLimitOrder({
                    market: market.address,
                    isBid: true,
                    orderId: 1,
                    deadline: deadline,
                }),
            )
                .to.emit(exchange, "LimitOrderCanceled")
                .withArgs(alice.address, market.address, owner.address, true, 1)

            await assertLimitOrderCount(0)
            await assertTotalBase([0, 0])
            await assertMarkets([])
            expect(await exchange.getLimitOrderIds(alice.address, market.address, true)).to.deep.eq([])
        })

        it("liquidation ask", async () => {
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
            await exchange.setAccountInfo(
                alice.address,
                {
                    collateralBalance: -1,
                },
                [],
            )
            await expect(
                exchange.connect(owner).cancelLimitOrder({
                    market: market.address,
                    isBid: false,
                    orderId: 1,
                    deadline: deadline,
                }),
            )
                .to.emit(exchange, "LimitOrderCanceled")
                .withArgs(alice.address, market.address, owner.address, false, 1)

            await assertLimitOrderCount(0)
            await assertTotalBase([0, 0])
            await assertMarkets([])
            expect(await exchange.getLimitOrderIds(alice.address, market.address, false)).to.deep.eq([])
        })

        it("already canceled", async () => {
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
                exchange.connect(alice).cancelLimitOrder({
                    market: market.address,
                    isBid: true,
                    orderId: 1,
                    deadline: deadline,
                }),
            ).to.be.revertedWith("RBTL_R: key not exist")

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
            await expect(
                exchange.connect(alice).cancelLimitOrder({
                    market: market.address,
                    isBid: false,
                    orderId: 1,
                    deadline: deadline,
                }),
            ).to.be.revertedWith("RBTL_R: key not exist")
        })

        it("already fully executed", async () => {
            await exchange.connect(alice).createLimitOrdersForTest(
                [
                    {
                        isBid: true,
                        base: 1,
                        priceX96: Q96,
                        executionId: 1,
                        baseBalancePerShareX96: Q96,
                    },
                    {
                        isBid: false,
                        base: 1,
                        priceX96: Q96,
                        executionId: 1,
                        baseBalancePerShareX96: Q96,
                    },
                ],
                market.address,
            )

            await expect(
                exchange.connect(alice).cancelLimitOrder({
                    market: market.address,
                    isBid: true,
                    orderId: 1,
                    deadline: deadline,
                }),
            ).to.be.revertedWith("OBL_CO: already fully executed")

            await expect(
                exchange.connect(alice).cancelLimitOrder({
                    market: market.address,
                    isBid: false,
                    orderId: 1,
                    deadline: deadline,
                }),
            ).to.be.revertedWith("OBL_CO: already fully executed")
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

        it("market not allowed", async () => {
            await exchange.setMarketStatusForce(market.address, MarketStatus.NotAllowed)
            await expect(
                exchange.connect(alice).cancelLimitOrder({
                    market: market.address,
                    isBid: true,
                    orderId: 1,
                    deadline: deadline,
                }),
            ).to.revertedWith("PE_CMO: market not open")
        })

        it("market closed", async () => {
            await exchange.setMarketStatusForce(market.address, MarketStatus.Closed)
            await expect(
                exchange.connect(alice).cancelLimitOrder({
                    market: market.address,
                    isBid: true,
                    orderId: 1,
                    deadline: deadline,
                }),
            ).to.revertedWith("PE_CMO: market not open")
        })

        it("not liquidatable", async () => {
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
                exchange.connect(owner).cancelLimitOrder({
                    market: market.address,
                    isBid: true,
                    orderId: 1,
                    deadline: deadline,
                }),
            ).to.revertedWith("MOBL_CLO: enough mm")
        })
    })
})
