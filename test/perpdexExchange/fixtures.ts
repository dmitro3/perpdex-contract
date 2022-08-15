import { ethers, waffle } from "hardhat"
import { TestPerpdexExchange, TestPerpdexMarket, TestERC20 } from "../../typechain"
import { BigNumber, Wallet } from "ethers"
import IPerpdexPriceFeedJson from "../../artifacts/contracts/interfaces/IPerpdexPriceFeed.sol/IPerpdexPriceFeed.json"
import { MockContract } from "ethereum-waffle"
import _ from "lodash"

export interface PerpdexExchangeFixture {
    perpdexExchange: TestPerpdexExchange
    perpdexMarket: TestPerpdexMarket
    perpdexMarkets: TestPerpdexMarket[]
    USDC: TestERC20
    owner: Wallet
    alice: Wallet
    bob: Wallet
    carol: Wallet
    priceFeed: MockContract
    priceFeeds: MockContract[]
    accountLibrary: any
    makerOrderBookLibrary: any
    vaultLibrary: any
}

interface Params {
    linear?: Boolean
    isMarketAllowed?: Boolean
    initPool?: Boolean
    marketCount?: number
}

const Q96 = BigNumber.from(2).pow(96)

export function createPerpdexExchangeFixture(
    params: Params = {},
): (wallets, provider) => Promise<PerpdexExchangeFixture> {
    params = _.extend({ linear: false, isMarketAllowed: false, initPool: false, marketCount: 1 }, params)
    return async ([owner, alice, bob, carol], provider): Promise<PerpdexExchangeFixture> => {
        let settlementToken = hre.ethers.constants.AddressZero
        let USDC

        if (params.linear) {
            const tokenFactory = await ethers.getContractFactory("TestERC20")
            USDC = (await tokenFactory.deploy("TestUSDC", "USDC", 6)) as TestERC20
            settlementToken = USDC.address
        }
        const accountLibraryFactory = await ethers.getContractFactory("AccountLibrary")
        const accountLibrary = await accountLibraryFactory.deploy()
        const makerOrderBookLibraryFactory = await ethers.getContractFactory("MakerOrderBookLibrary", {
            libraries: {
                AccountLibrary: accountLibrary.address,
            },
        })
        const makerOrderBookLibrary = await makerOrderBookLibraryFactory.deploy()
        const vaultLibraryFactory = await ethers.getContractFactory("VaultLibrary", {
            libraries: {
                AccountLibrary: accountLibrary.address,
            },
        })
        const vaultLibrary = await vaultLibraryFactory.deploy()

        const perpdexExchangeFactory = await ethers.getContractFactory("TestPerpdexExchange", {
            libraries: {
                AccountLibrary: accountLibrary.address,
                MakerOrderBookLibrary: makerOrderBookLibrary.address,
                VaultLibrary: vaultLibrary.address,
            },
        })
        const perpdexExchange = (await perpdexExchangeFactory.deploy(settlementToken)) as TestPerpdexExchange

        const orderBookLibraryFactory = await ethers.getContractFactory("OrderBookLibrary")
        const orderBookLibrary = await orderBookLibraryFactory.deploy()

        const perpdexMarketFactory = await ethers.getContractFactory("TestPerpdexMarket", {
            libraries: {
                OrderBookLibrary: orderBookLibrary.address,
            },
        })
        const perpdexMarkets = []
        const priceFeeds = []
        for (let i = 0; i < params.marketCount; i++) {
            priceFeeds[i] = await waffle.deployMockContract(owner, IPerpdexPriceFeedJson.abi)
            await priceFeeds[i].mock.getPrice.returns(BigNumber.from(10).pow(18))
            await priceFeeds[i].mock.decimals.returns(18)

            perpdexMarkets[i] = (await perpdexMarketFactory.deploy(
                "USD",
                perpdexExchange.address,
                priceFeeds[i].address,
                ethers.constants.AddressZero,
            )) as TestPerpdexMarket

            await perpdexMarkets[i].connect(owner).setPoolFeeRatio(0)
            await perpdexMarkets[i].connect(owner).setFundingMaxPremiumRatio(0)

            if (params.isMarketAllowed) {
                await perpdexExchange.connect(owner).setIsMarketAllowed(perpdexMarkets[i].address, true)
            }

            if (params.initPool) {
                await perpdexMarkets[i].setPoolInfo({
                    base: 10000,
                    quote: 10000,
                    totalLiquidity: 10000,
                    cumBasePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                    baseBalancePerShareX96: Q96,
                })
            }
        }

        const perpdexMarket = perpdexMarkets[0]
        const priceFeed = priceFeeds[0]

        return {
            perpdexExchange,
            perpdexMarket,
            perpdexMarkets,
            USDC,
            owner,
            alice,
            bob,
            carol,
            priceFeed,
            priceFeeds,
            accountLibrary,
            makerOrderBookLibrary,
            vaultLibrary,
        }
    }
}
