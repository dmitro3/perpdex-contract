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

    const multicallChunk = async (contract, calls) => {
        const step = 10
        for (let i = 0; i < calls.length; i += step) {
            await contract.multicall(calls.slice(i, i + step))
        }
    }

    beforeEach(async () => {
        fixture = await loadFixture(
            createPerpdexExchangeFixture({
                marketCount: 16,
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

            await exchange.connect(owner).addLiquidity({
                market: market.address,
                base: 10000,
                quote: 10000,
                minBase: 0,
                minQuote: 0,
                deadline: deadline,
            })
        }
    })

    describe("multiple market extreme", () => {
        it("ok", async () => {
            let calls = []
            const orderCount = 100
            for (let i = 0; i < orderCount / 2; i++) {
                const market = markets[markets.length - 1]

                calls.push(
                    exchange.interface.encodeFunctionData("createLimitOrder", [
                        {
                            market: market.address,
                            isBid: true,
                            base: 100,
                            priceX96: Q96,
                            deadline: deadline,
                        },
                    ]),
                )
                calls.push(
                    exchange.interface.encodeFunctionData("createLimitOrder", [
                        {
                            market: market.address,
                            isBid: false,
                            base: 100,
                            priceX96: Q96,
                            deadline: deadline,
                        },
                    ]),
                )
            }
            await multicallChunk(exchange.connect(bob), calls)

            calls = []
            for (let i = 0; i < markets.length; i++) {
                const market = markets[i]
                calls.push(
                    exchange.interface.encodeFunctionData("createLimitOrder", [
                        {
                            market: market.address,
                            isBid: true,
                            base: 100,
                            priceX96: Q96,
                            deadline: deadline,
                        },
                    ]),
                )
                calls.push(
                    exchange.interface.encodeFunctionData("createLimitOrder", [
                        {
                            market: market.address,
                            isBid: false,
                            base: 100,
                            priceX96: Q96,
                            deadline: deadline,
                        },
                    ]),
                )
                calls.push(
                    exchange.interface.encodeFunctionData("addLiquidity", [
                        {
                            market: market.address,
                            base: 100,
                            quote: 100,
                            minBase: 0,
                            minQuote: 0,
                            deadline: deadline,
                        },
                    ]),
                )
            }
            await multicallChunk(exchange.connect(alice), calls)

            for (let i = 0; i < markets.length; i++) {
                const market = markets[i]
                await exchange.connect(alice).trade({
                    trader: alice.address,
                    market: market.address,
                    isBaseToQuote: false,
                    isExactInput: false,
                    amount: i < markets.length - 1 ? 1 : (orderCount / 2) * 100,
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
                    amount: i < markets.length - 1 ? 1 : (orderCount / 2) * 100 - 1,
                    oppositeAmountBound: 0,
                    deadline: deadline,
                })
            }
        })
    })
})
