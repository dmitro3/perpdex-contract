import { expect } from "chai"
import { waffle } from "hardhat"
import { TestPerpdexMarket, TestPerpdexExchange } from "../../../typechain"
import { createPerpdexExchangeFixture } from "../fixtures"
import { BigNumber, Wallet } from "ethers"
import { LimitOrderType, MarketStatus } from "../../helper/types"

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

    describe("normal order", () => {
        it("no taker bid", async () => {
            await expect(
                exchange.connect(alice).createLimitOrder({
                    market: market.address,
                    isBid: true,
                    base: 1,
                    priceX96: Q96,
                    deadline: deadline,
                    limitOrderType: LimitOrderType.Normal,
                }),
            )
                .to.emit(exchange, "LimitOrderCreated")
                .withArgs(alice.address, market.address, true, 1, Q96, LimitOrderType.Normal, 1, 0)

            await assertLimitOrderCount(1)
            await assertTotalBase([0, 1])
            await assertMarkets([market.address])
            expect(await exchange.getLimitOrderIds(alice.address, market.address, true)).to.deep.eq([1])
            expect(await exchange.getLimitOrderIds(alice.address, market.address, false)).to.deep.eq([])
        })

        it("no taker ask", async () => {
            await expect(
                exchange.connect(alice).createLimitOrder({
                    market: market.address,
                    isBid: false,
                    base: 1,
                    priceX96: Q96,
                    deadline: deadline,
                    limitOrderType: LimitOrderType.Normal,
                }),
            )
                .to.emit(exchange, "LimitOrderCreated")
                .withArgs(alice.address, market.address, false, 1, Q96, LimitOrderType.Normal, 1, 0)

            await assertLimitOrderCount(1)
            await assertTotalBase([1, 0])
            await assertMarkets([market.address])
            expect(await exchange.getLimitOrderIds(alice.address, market.address, true)).to.deep.eq([])
            expect(await exchange.getLimitOrderIds(alice.address, market.address, false)).to.deep.eq([1])
        })

        it("all taker bid", async () => {
            await expect(
                exchange.connect(alice).createLimitOrder({
                    market: market.address,
                    isBid: true,
                    base: 100,
                    priceX96: Q96.mul(2),
                    deadline: deadline,
                    limitOrderType: LimitOrderType.Normal,
                }),
            )
                .to.emit(exchange, "PositionChanged")
                .withArgs(
                    alice.address,
                    market.address,
                    100,
                    -102,
                    0,
                    0,
                    Q96,
                    BigNumber.from("80844737143343266502018281443"),
                )

            await assertLimitOrderCount(0)
            await assertTotalBase([0, 0])
            await assertMarkets([market.address])
            expect(await exchange.getLimitOrderIds(alice.address, market.address, true)).to.deep.eq([])
            expect(await exchange.getLimitOrderIds(alice.address, market.address, false)).to.deep.eq([])
        })

        it("all taker ask", async () => {
            await expect(
                exchange.connect(alice).createLimitOrder({
                    market: market.address,
                    isBid: false,
                    base: 100,
                    priceX96: Q96.div(2),
                    deadline: deadline,
                    limitOrderType: LimitOrderType.Normal,
                }),
            )
                .to.emit(exchange, "PositionChanged")
                .withArgs(
                    alice.address,
                    market.address,
                    -100,
                    99,
                    0,
                    0,
                    Q96,
                    BigNumber.from("77667132381557545199374123987"),
                )

            await assertLimitOrderCount(0)
            await assertTotalBase([0, 0])
            await assertMarkets([market.address])
            expect(await exchange.getLimitOrderIds(alice.address, market.address, true)).to.deep.eq([])
            expect(await exchange.getLimitOrderIds(alice.address, market.address, false)).to.deep.eq([])
        })

        it("not enough im", async () => {
            await expect(
                exchange.connect(alice).createLimitOrder({
                    market: market.address,
                    isBid: true,
                    base: 1000001,
                    priceX96: Q96,
                    deadline: deadline,
                    limitOrderType: LimitOrderType.Normal,
                }),
            ).to.be.revertedWith("MOBL_CLO: not enough im")
        })

        it("base is zero", async () => {
            await expect(
                exchange.connect(alice).createLimitOrder({
                    market: market.address,
                    isBid: true,
                    base: 0,
                    priceX96: Q96,
                    deadline: deadline,
                    limitOrderType: LimitOrderType.Normal,
                }),
            ).not.to.emit(exchange, "LimitOrderCreated")

            await assertLimitOrderCount(0)
            await assertTotalBase([0, 0])
            await assertMarkets([])
            expect(await exchange.getLimitOrderIds(alice.address, market.address, true)).to.deep.eq([])
            expect(await exchange.getLimitOrderIds(alice.address, market.address, false)).to.deep.eq([])
        })

        it("price is too small", async () => {
            await expect(
                exchange.connect(alice).createLimitOrder({
                    market: market.address,
                    isBid: true,
                    base: 1,
                    priceX96: Q96.div(100).sub(1),
                    deadline: deadline,
                    limitOrderType: LimitOrderType.Normal,
                }),
            ).to.be.revertedWith("OBL_CO: price too small")
        })

        it("price is too large", async () => {
            await expect(
                exchange.connect(alice).createLimitOrder({
                    market: market.address,
                    isBid: false,
                    base: 1,
                    priceX96: Q96.mul(100).add(1),
                    deadline: deadline,
                    limitOrderType: LimitOrderType.Normal,
                }),
            ).to.be.revertedWith("OBL_CO: price too large")
        })
    })
})
