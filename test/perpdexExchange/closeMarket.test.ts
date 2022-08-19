import { expect } from "chai"
import { waffle } from "hardhat"
import { TestPerpdexExchange, TestPerpdexMarket } from "../../typechain"
import { createPerpdexExchangeFixture } from "./fixtures"
import { BigNumber, Wallet } from "ethers"
import { getTimestamp, setNextTimestamp } from "../helper/time"
import { MockContract } from "ethereum-waffle"
import { MarketStatus } from "../helper/types"

describe("PerpdexExchange closeMarket", () => {
    let loadFixture = waffle.createFixtureLoader(waffle.provider.getWallets())
    let fixture

    let exchange: TestPerpdexExchange
    let market: TestPerpdexMarket
    let owner: Wallet
    let alice: Wallet

    beforeEach(async () => {
        fixture = await loadFixture(createPerpdexExchangeFixture({ isMarketAllowed: true, initPool: true }))
        exchange = fixture.perpdexExchange
        market = fixture.perpdexMarket
        owner = fixture.owner
        alice = fixture.alice
    })

    const setAccountInfo = async markets => {
        return exchange.setAccountInfo(
            alice.address,
            {
                collateralBalance: 100,
            },
            markets,
        )
    }

    describe("closeMarket", () => {
        beforeEach(async () => {
            await setAccountInfo([market.address])
            await exchange.setTakerInfo(alice.address, market.address, {
                baseBalanceShare: 50,
                quoteBalance: -25,
            })
            await exchange.setMarketStatusForce(market.address, MarketStatus.Closed)
        })

        it("normal", async () => {
            await exchange.connect(alice).closeMarket(market.address)

            expect(await exchange.getCollateralBalance(alice.address)).to.eq(125)
            expect(await exchange.getAccountMarkets(alice.address)).to.deep.eq([])
        })

        it("market not allowed", async () => {
            await exchange.setMarketStatusForce(market.address, MarketStatus.NotAllowed)
            await expect(exchange.connect(alice).closeMarket(market.address)).to.be.revertedWith(
                "PE_CMC: market not closed",
            )
        })

        it("market open", async () => {
            await exchange.setMarketStatusForce(market.address, MarketStatus.Open)
            await expect(exchange.connect(alice).closeMarket(market.address)).to.be.revertedWith(
                "PE_CMC: market not closed",
            )
        })

        it("market not exist", async () => {
            await setAccountInfo([])
            await expect(exchange.connect(alice).closeMarket(market.address)).to.be.revertedWith(
                "AL_CM: market not exist",
            )
        })
    })
})
