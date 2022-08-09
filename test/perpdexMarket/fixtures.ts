import { ethers, waffle } from "hardhat"
import { TestPerpdexMarket, OrderBookLibrary } from "../../typechain"
import IPerpdexPriceFeedJson from "../../artifacts/contracts/interfaces/IPerpdexPriceFeed.sol/IPerpdexPriceFeed.json"
import { MockContract } from "ethereum-waffle"
import { BigNumber, Wallet } from "ethers"

interface PerpdexMarketFixture {
    perpdexMarket: TestPerpdexMarket
    priceFeed: MockContract
    owner: Wallet
    alice: Wallet
    bob: Wallet
    exchange: Wallet
    orderBookLibrary: OrderBookLibrary
}

export function createPerpdexMarketFixture(): (wallets, provider) => Promise<PerpdexMarketFixture> {
    return async ([owner, alice, bob, exchange], provider): Promise<PerpdexMarketFixture> => {
        const priceFeed = await waffle.deployMockContract(owner, IPerpdexPriceFeedJson.abi)
        await priceFeed.mock.getPrice.returns(BigNumber.from(10).pow(18))
        await priceFeed.mock.decimals.returns(18)

        const orderBookLibraryFactory = await ethers.getContractFactory("OrderBookLibrary")
        const orderBookLibrary = await orderBookLibraryFactory.deploy()

        const perpdexMarketFactory = await ethers.getContractFactory("TestPerpdexMarket", {
            libraries: {
                OrderBookLibrary: orderBookLibrary.address,
            },
        })
        const perpdexMarket = (await perpdexMarketFactory.deploy(
            "USD",
            exchange.address,
            priceFeed.address,
            ethers.constants.AddressZero,
        )) as TestPerpdexMarket

        return {
            perpdexMarket,
            priceFeed,
            owner,
            alice,
            bob,
            exchange,
            orderBookLibrary,
        }
    }
}
