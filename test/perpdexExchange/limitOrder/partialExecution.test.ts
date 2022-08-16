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

    const assertLimitOrderCount = async expected => {
        expect((await exchange.accountInfos(alice.address)).limitOrderCount).to.eq(expected)
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
            owner.address,
            {
                collateralBalance: 100000,
            },
            [],
        )
        await exchange.setAccountInfo(
            alice.address,
            {
                collateralBalance: 100000,
            },
            [],
        )
    })

    describe("partial execution", () => {
        it("ask", async () => {
            await exchange.connect(alice).createLimitOrder({
                market: market.address,
                isBid: false,
                base: 2,
                priceX96: Q96,
                deadline: deadline,
            })

            await expect(
                exchange.connect(owner).trade({
                    trader: owner.address,
                    market: market.address,
                    isBaseToQuote: false,
                    isExactInput: false,
                    amount: 1,
                    oppositeAmountBound: 1,
                    deadline: deadline,
                }),
            )
                .to.emit(market, "Swapped")
                .withArgs(false, false, 1, 1, 0, 1, 1, 1)

            expect(await market.getLimitOrderInfo(false, 1)).to.deep.eq([1, Q96])
            expect(await market.getLimitOrderExecution(false, 1)).to.deep.eq([0, 0, 0])
            expect(await exchange.getLimitOrderIds(alice.address, market.address, false)).to.deep.eq([1])
            expect(await exchange.getPositionShare(alice.address, market.address)).to.deep.eq(-1)
        })

        it("bid", async () => {
            await exchange.connect(alice).createLimitOrder({
                market: market.address,
                isBid: true,
                base: 2,
                priceX96: Q96,
                deadline: deadline,
            })

            await expect(
                exchange.connect(owner).trade({
                    trader: owner.address,
                    market: market.address,
                    isBaseToQuote: true,
                    isExactInput: true,
                    amount: 1,
                    oppositeAmountBound: 1,
                    deadline: deadline,
                }),
            )
                .to.emit(market, "Swapped")
                .withArgs(true, true, 1, 1, 0, 1, 1, 1)

            expect(await market.getLimitOrderInfo(true, 1)).to.deep.eq([1, Q96])
            expect(await market.getLimitOrderExecution(true, 1)).to.deep.eq([0, 0, 0])
            expect(await exchange.getLimitOrderIds(alice.address, market.address, true)).to.deep.eq([1])
            expect(await exchange.getPositionShare(alice.address, market.address)).to.deep.eq(1)
        })
    })
})
