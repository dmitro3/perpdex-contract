import { waffle } from "hardhat"
import { TestPerpdexExchange, TestPerpdexMarket } from "../../../typechain"
import { createPerpdexExchangeFixture } from "../../perpdexExchange/fixtures"
import { BigNumber, BigNumberish, Wallet } from "ethers"
import { MockContract } from "ethereum-waffle"

describe("gas benchmark limit order", () => {
    let loadFixture = waffle.createFixtureLoader(waffle.provider.getWallets())
    let fixture

    let exchange: TestPerpdexExchange
    let markets: TestPerpdexMarket[]
    let owner: Wallet
    let alice: Wallet
    let bob: Wallet
    let priceFeed: MockContract

    const Q96 = BigNumber.from(2).pow(96)
    const deadline = Q96

    beforeEach(async () => {
        fixture = await loadFixture(
            createPerpdexExchangeFixture({
                marketCount: 16,
                isMarketAllowed: true,
                initPool: true,
            }),
        )
        exchange = fixture.perpdexExchange
        markets = fixture.perpdexMarkets
        owner = fixture.owner
        alice = fixture.alice
        bob = fixture.bob
        priceFeed = fixture.priceFeed

        await exchange.connect(owner).setMaxOrdersPerAccount(100)
        await exchange.connect(owner).setImRatio(10e4)
        await exchange.connect(owner).setMmRatio(5e4)
        await exchange.connect(owner).setLiquidationRewardConfig({
            rewardRatio: 25e4,
            smoothEmaTime: 1,
        })

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

        await exchange.setAccountInfo(
            bob.address,
            {
                collateralBalance: 100000,
            },
            [],
        )

        for (let i = 0; i < markets.length; i++) {
            const market = markets[i]

            await market.connect(owner).setPriceLimitConfig({
                normalOrderRatio: 5e4,
                liquidationRatio: 10e4,
                emaNormalOrderRatio: 5e4,
                emaLiquidationRatio: 10e4,
                emaSec: 300,
            })
        }
    })

    describe("multiple market typical", () => {
        it("ok", async () => {
            for (let i = 0; i < 50; i++) {
                const market = markets[i % markets.length]
                await exchange.connect(bob).createLimitOrder({
                    market: market.address,
                    isBid: true,
                    base: 100,
                    priceX96: Q96,
                    deadline: deadline,
                })
                await exchange.connect(bob).createLimitOrder({
                    market: market.address,
                    isBid: false,
                    base: 100,
                    priceX96: Q96,
                    deadline: deadline,
                })
            }

            for (let i = 0; i < markets.length; i++) {
                const market = markets[i]
                await exchange.connect(alice).trade({
                    trader: alice.address,
                    market: market.address,
                    isBaseToQuote: false,
                    isExactInput: false,
                    amount: 101,
                    oppositeAmountBound: Q96,
                    deadline: deadline,
                })
            }

            for (let i = 0; i < markets.length; i++) {
                const market = markets[i]
                await exchange.connect(alice).trade({
                    trader: alice.address,
                    market: market.address,
                    isBaseToQuote: true,
                    isExactInput: true,
                    amount: 101,
                    oppositeAmountBound: 0,
                    deadline: deadline,
                })
            }
        }).timeout(10 * 60 * 1000)
    })
})
