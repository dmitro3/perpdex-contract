import { waffle } from "hardhat"
import { TestPerpdexExchange, TestPerpdexMarket } from "../../../typechain"
import { createPerpdexExchangeFixture } from "../../perpdexExchange/fixtures"
import { BigNumber, BigNumberish, Wallet } from "ethers"
import { MockContract } from "ethereum-waffle"

describe("gas benchmark limit order", () => {
    let loadFixture = waffle.createFixtureLoader(waffle.provider.getWallets())
    let fixture

    let exchange: TestPerpdexExchange
    let market: TestPerpdexMarket
    let owner: Wallet
    let alice: Wallet
    let bob: Wallet
    let priceFeed: MockContract

    const Q96 = BigNumber.from(2).pow(96)
    const deadline = Q96

    beforeEach(async () => {
        fixture = await loadFixture(createPerpdexExchangeFixture())
        exchange = fixture.perpdexExchange
        market = fixture.perpdexMarket
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

        await exchange.setInsuranceFundInfo({ balance: 10000, liquidationRewardBalance: 0 })
        await exchange.setProtocolInfo({ protocolFee: 10000 })

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
    })

    describe("single market typical", () => {
        it("ok", async () => {
            for (let i = 0; i < 50; i++) {
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

            await exchange.connect(alice).trade({
                trader: alice.address,
                market: market.address,
                isBaseToQuote: false,
                isExactInput: false,
                amount: 101,
                oppositeAmountBound: Q96,
                deadline: deadline,
            })

            await exchange.connect(alice).trade({
                trader: alice.address,
                market: market.address,
                isBaseToQuote: true,
                isExactInput: true,
                amount: 101,
                oppositeAmountBound: 0,
                deadline: deadline,
            })
        })
    })
})
