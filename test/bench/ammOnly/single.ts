import { waffle } from "hardhat"
import { TestPerpdexExchange, TestPerpdexMarket } from "../../../typechain"
import { createPerpdexExchangeFixture } from "../../perpdexExchange/fixtures"
import { BigNumber, Wallet } from "ethers"
import { MockContract } from "ethereum-waffle"

describe("gas benchmark amm only", () => {
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
        fixture = await loadFixture(
            createPerpdexExchangeFixture({
                marketCount: 16,
                isMarketAllowed: true,
                initPool: true,
            }),
        )
        exchange = fixture.perpdexExchange
        market = fixture.perpdexMarket
        owner = fixture.owner
        alice = fixture.alice
        bob = fixture.bob
        priceFeed = fixture.priceFeed

        await exchange.connect(owner).setImRatio(10e4)
        await exchange.connect(owner).setMmRatio(5e4)
        await exchange.connect(owner).setLiquidationRewardConfig({
            rewardRatio: 25e4,
            smoothEmaTime: 1,
        })

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

        await exchange.setAccountInfo(
            alice.address,
            {
                collateralBalance: 100000,
            },
            [],
        )
    })

    describe("single market", () => {
        it("ok", async () => {
            await exchange.connect(alice).trade({
                trader: alice.address,
                market: market.address,
                isBaseToQuote: false,
                isExactInput: false,
                amount: 100,
                oppositeAmountBound: 1000,
                deadline: deadline,
            })

            await exchange.connect(alice).trade({
                trader: alice.address,
                market: market.address,
                isBaseToQuote: true,
                isExactInput: true,
                amount: 100,
                oppositeAmountBound: 0,
                deadline: deadline,
            })
        })
    })
})
