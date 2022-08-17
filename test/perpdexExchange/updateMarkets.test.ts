import { expect } from "chai"
import { waffle } from "hardhat"
import { TestPerpdexExchange, TestPerpdexMarket } from "../../typechain"
import { createPerpdexExchangeFixture } from "./fixtures"
import { BigNumber, Wallet } from "ethers"

describe("PerpdexExchange updateMarkets", () => {
    let loadFixture = waffle.createFixtureLoader(waffle.provider.getWallets())
    let fixture

    let exchange: TestPerpdexExchange
    let market: TestPerpdexMarket
    let markets: TestPerpdexMarket[]
    let owner: Wallet
    let alice: Wallet

    const Q96 = BigNumber.from(2).pow(96)
    const deadline = Q96

    const long = async (amount, idx = 0) => {
        return exchange.connect(alice).trade({
            trader: alice.address,
            market: markets[idx].address,
            isBaseToQuote: false,
            isExactInput: false,
            amount: amount,
            oppositeAmountBound: 10 * amount,
            deadline: deadline,
        })
    }

    const short = async (amount, idx = 0) => {
        return exchange.connect(alice).trade({
            trader: alice.address,
            market: markets[idx].address,
            isBaseToQuote: true,
            isExactInput: true,
            amount: amount,
            oppositeAmountBound: 0,
            deadline: deadline,
        })
    }

    const addLiquidity = async (base, quote, idx = 0) => {
        return exchange.connect(alice).addLiquidity({
            market: markets[idx].address,
            base: base,
            quote: quote,
            minBase: 0,
            minQuote: 0,
            deadline: deadline,
        })
    }

    const removeLiquidity = async (liquidity, idx = 0) => {
        return exchange.connect(alice).removeLiquidity({
            trader: alice.address,
            market: markets[idx].address,
            liquidity: liquidity,
            minBase: 0,
            minQuote: 0,
            deadline: deadline,
        })
    }

    const createLimitOrder = async (isBid, idx = 0) => {
        return exchange.connect(alice).createLimitOrder({
            market: markets[idx].address,
            isBid: isBid,
            base: 1,
            priceX96: Q96,
            deadline: deadline,
        })
    }

    const cancelLimitOrder = async (isBid, orderId, idx = 0) => {
        return exchange.connect(alice).cancelLimitOrder({
            market: markets[idx].address,
            isBid: isBid,
            orderId: orderId,
            deadline: deadline,
        })
    }

    const getMarkets = async () => {
        return await exchange.getAccountMarkets(alice.address)
    }

    beforeEach(async () => {
        fixture = await loadFixture(
            createPerpdexExchangeFixture({
                isMarketAllowed: true,
                initPool: true,
                marketCount: 3,
            }),
        )
        exchange = fixture.perpdexExchange
        market = fixture.perpdexMarket
        owner = fixture.owner
        alice = fixture.alice
        markets = fixture.perpdexMarkets

        await exchange.setAccountInfo(
            alice.address,
            {
                collateralBalance: 10000,
            },
            [],
        )
    })

    describe("add and remove markets", () => {
        it("taker", async () => {
            await long(100)
            expect(await getMarkets()).to.deep.eq([market.address])

            await short(50)
            expect(await getMarkets()).to.deep.eq([market.address])

            await short(50)
            expect(await getMarkets()).to.deep.eq([])

            await short(100)
            expect(await getMarkets()).to.deep.eq([market.address])

            await long(100)
            expect(await getMarkets()).to.deep.eq([])
        })

        it("maker", async () => {
            await addLiquidity(100, 100)
            expect(await getMarkets()).to.deep.eq([market.address])

            await removeLiquidity(50)
            expect(await getMarkets()).to.deep.eq([market.address])

            await removeLiquidity(50)
            expect(await getMarkets()).to.deep.eq([])
        })

        it("ask", async () => {
            await createLimitOrder(false)
            expect(await getMarkets()).to.deep.eq([market.address])

            await cancelLimitOrder(false, 1)
            expect(await getMarkets()).to.deep.eq([])
        })

        it("bid", async () => {
            await createLimitOrder(true)
            expect(await getMarkets()).to.deep.eq([market.address])

            await cancelLimitOrder(true, 1)
            expect(await getMarkets()).to.deep.eq([])
        })
    })

    describe("max market count", () => {
        it("taker", async () => {
            await exchange.setMaxMarketsPerAccount(2)

            await long(100, 0)
            expect(await getMarkets()).to.deep.eq([markets[0].address])

            await long(100, 1)
            expect(await getMarkets()).to.deep.eq([markets[0].address, markets[1].address])

            await expect(long(100, 2)).to.revertedWith("AL_UP: too many markets")

            await short(100, 0)
            expect(await getMarkets()).to.deep.eq([markets[1].address])

            await long(100, 2)
            expect(await getMarkets()).to.deep.eq([markets[1].address, markets[2].address])
        })

        it("maker", async () => {
            await exchange.setMaxMarketsPerAccount(2)

            await addLiquidity(100, 100, 0)
            expect(await getMarkets()).to.deep.eq([markets[0].address])

            await addLiquidity(100, 100, 1)
            expect(await getMarkets()).to.deep.eq([markets[0].address, markets[1].address])

            await expect(addLiquidity(100, 100, 2)).to.revertedWith("AL_UP: too many markets")

            await removeLiquidity(100, 0)
            expect(await getMarkets()).to.deep.eq([markets[1].address])

            await addLiquidity(100, 100, 2)
            expect(await getMarkets()).to.deep.eq([markets[1].address, markets[2].address])
        })

        it("ask", async () => {
            await exchange.setMaxMarketsPerAccount(2)

            await createLimitOrder(false, 0)
            expect(await getMarkets()).to.deep.eq([markets[0].address])

            await createLimitOrder(false, 1)
            expect(await getMarkets()).to.deep.eq([markets[0].address, markets[1].address])

            await expect(createLimitOrder(false, 2)).to.revertedWith("AL_UP: too many markets")

            await cancelLimitOrder(false, 1)
            expect(await getMarkets()).to.deep.eq([markets[1].address])

            await createLimitOrder(false, 2)
            expect(await getMarkets()).to.deep.eq([markets[1].address, markets[2].address])
        })

        it("bid", async () => {
            await exchange.setMaxMarketsPerAccount(2)

            await createLimitOrder(true, 0)
            expect(await getMarkets()).to.deep.eq([markets[0].address])

            await createLimitOrder(true, 1)
            expect(await getMarkets()).to.deep.eq([markets[0].address, markets[1].address])

            await expect(createLimitOrder(true, 2)).to.revertedWith("AL_UP: too many markets")

            await cancelLimitOrder(true, 1)
            expect(await getMarkets()).to.deep.eq([markets[1].address])

            await createLimitOrder(true, 2)
            expect(await getMarkets()).to.deep.eq([markets[1].address, markets[2].address])
        })
    })
})
