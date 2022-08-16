import { expect } from "chai"
import { waffle } from "hardhat"
import { TestAccountLibrary } from "../../typechain"
import { createAccountLibraryFixture } from "./fixtures"
import { BigNumberish, Wallet } from "ethers"

describe("AccountLibrary updateMarkets", () => {
    let loadFixture = waffle.createFixtureLoader(waffle.provider.getWallets())
    let fixture

    let library: TestAccountLibrary
    let markets: string[]

    const idxToMarket = idx => {
        return markets[idx]
    }

    beforeEach(async () => {
        fixture = await loadFixture(createAccountLibraryFixture())
        library = fixture.accountLibrary
        markets = [fixture.market1.address, fixture.market2.address, hre.ethers.constants.AddressZero]
    })

    describe("updateMarkets", () => {
        ;[
            {
                title: "initial taker",
                markets: [],
                accountInfo: [
                    {
                        market: 0,
                        takerBaseBalanceShare: 0,
                        makerLiquidity: 1,
                    },
                ],
                market: 0,
                maxMarketsPerAccount: 1,
                afterMarkets: [0],
            },
            {
                title: "initial maker",
                markets: [],
                accountInfo: [
                    {
                        market: 0,
                        takerBaseBalanceShare: 1,
                        makerLiquidity: 0,
                    },
                ],
                market: 0,
                maxMarketsPerAccount: 1,
                afterMarkets: [0],
            },
            {
                title: "initial ask",
                markets: [],
                accountInfo: [
                    {
                        market: 0,
                        takerBaseBalanceShare: 0,
                        makerLiquidity: 0,
                        askRoot: 1,
                    },
                ],
                market: 0,
                maxMarketsPerAccount: 1,
                afterMarkets: [0],
            },
            {
                title: "initial bid",
                markets: [],
                accountInfo: [
                    {
                        market: 0,
                        takerBaseBalanceShare: 0,
                        makerLiquidity: 0,
                        bidRoot: 1,
                    },
                ],
                market: 0,
                maxMarketsPerAccount: 1,
                afterMarkets: [0],
            },
            {
                title: "zero",
                markets: [],
                accountInfo: [
                    {
                        market: 2,
                        takerBaseBalanceShare: 1,
                        makerLiquidity: 1,
                    },
                ],
                market: 2,
                maxMarketsPerAccount: 1,
                afterMarkets: [2],
            },
            {
                title: "max markets",
                markets: [],
                accountInfo: [
                    {
                        market: 0,
                        takerBaseBalanceShare: 1,
                        makerLiquidity: 1,
                    },
                ],
                market: 0,
                maxMarketsPerAccount: 0,
                revertedWith: "AL_UP: too many markets",
            },
            {
                title: "two markets",
                markets: [0],
                accountInfo: [
                    {
                        market: 1,
                        takerBaseBalanceShare: 1,
                        makerLiquidity: 1,
                    },
                ],
                market: 1,
                maxMarketsPerAccount: 2,
                afterMarkets: [0, 1],
            },
            {
                title: "remove 1",
                markets: [0, 1],
                accountInfo: [],
                market: 0,
                maxMarketsPerAccount: 0,
                afterMarkets: [1],
            },
            {
                title: "remove 2",
                markets: [0, 1],
                accountInfo: [],
                market: 1,
                maxMarketsPerAccount: 0,
                afterMarkets: [0],
            },
            {
                title: "remove not found",
                markets: [0],
                accountInfo: [],
                market: 1,
                maxMarketsPerAccount: 0,
                afterMarkets: [0],
            },
            {
                title: "already added",
                markets: [0, 1],
                accountInfo: [
                    {
                        market: 1,
                        takerBaseBalanceShare: 1,
                        makerLiquidity: 1,
                    },
                ],
                market: 1,
                maxMarketsPerAccount: 2,
                afterMarkets: [0, 1],
            },
        ].forEach(test => {
            it(test.title, async () => {
                await library.setMarkets(test.markets.map(idxToMarket))
                for (let i = 0; i < test.accountInfo.length; i++) {
                    const market = idxToMarket(test.accountInfo[i].market)
                    await library.setTakerInfo(market, {
                        baseBalanceShare: test.accountInfo[i].takerBaseBalanceShare,
                        quoteBalance: -1,
                    })
                    await library.setMakerInfo(market, {
                        liquidity: test.accountInfo[i].makerLiquidity,
                        cumBaseSharePerLiquidityX96: 0,
                        cumQuotePerLiquidityX96: 0,
                    })
                    const info = test.accountInfo[i] as any
                    if (info.askRoot) {
                        await library.setAskRoot(market, info.askRoot)
                    }
                    if (info.bidRoot) {
                        await library.setBidRoot(market, info.bidRoot)
                    }
                }
                const res = library.updateMarkets(idxToMarket(test.market), test.maxMarketsPerAccount)

                if (test.revertedWith === void 0) {
                    await res
                    expect(await library.getMarkets()).to.deep.eq(test.afterMarkets.map(idxToMarket))
                } else {
                    await expect(res).to.revertedWith(test.revertedWith)
                }
            })
        })
    })
})
