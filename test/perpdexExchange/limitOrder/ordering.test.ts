import { expect } from "chai"
import { waffle } from "hardhat"
import { TestPerpdexMarket, TestPerpdexExchange } from "../../../typechain"
import { createPerpdexExchangeFixture } from "../fixtures"
import { BigNumber, Wallet } from "ethers"

describe("PerpdexExchange limitOrder", () => {
    let loadFixture = waffle.createFixtureLoader(waffle.provider.getWallets())
    let fixture

    let exchange: TestPerpdexExchange
    let market: TestPerpdexMarket
    let owner: Wallet
    let alice: Wallet

    const Q96 = BigNumber.from(2).pow(96)
    const deadline = Q96

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

    describe("ordering of orders", () => {
        it("ask same price", async () => {
            for (let i = 0; i < 4; i++) {
                await exchange.connect(alice).createLimitOrder({
                    market: market.address,
                    isBid: false,
                    base: 1,
                    priceX96: Q96,
                    deadline: deadline,
                })
            }
            expect(await exchange.getLimitOrderIds(alice.address, market.address, false)).to.deep.eq([1, 2, 3, 4])
        })

        it("ask different price", async () => {
            for (let i = 0; i < 4; i++) {
                await exchange.connect(alice).createLimitOrder({
                    market: market.address,
                    isBid: false,
                    base: 1,
                    priceX96: Q96.add(4 - i),
                    deadline: deadline,
                })
            }
            expect(await exchange.getLimitOrderIds(alice.address, market.address, false)).to.deep.eq([4, 3, 2, 1])
        })

        it("bid same price", async () => {
            for (let i = 0; i < 4; i++) {
                await exchange.connect(alice).createLimitOrder({
                    market: market.address,
                    isBid: true,
                    base: 1,
                    priceX96: Q96,
                    deadline: deadline,
                })
            }
            expect(await exchange.getLimitOrderIds(alice.address, market.address, true)).to.deep.eq([1, 2, 3, 4])
        })

        it("bid different price", async () => {
            for (let i = 0; i < 4; i++) {
                await exchange.connect(alice).createLimitOrder({
                    market: market.address,
                    isBid: true,
                    base: 1,
                    priceX96: Q96.sub(4 - i),
                    deadline: deadline,
                })
            }
            expect(await exchange.getLimitOrderIds(alice.address, market.address, true)).to.deep.eq([4, 3, 2, 1])
        })
    })
})
