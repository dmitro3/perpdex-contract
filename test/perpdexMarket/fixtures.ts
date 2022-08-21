import { ethers, waffle } from "hardhat"
import { TestPerpdexMarket } from "../../typechain"
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
    orderBookLibrary: any
    candleLibrary: any
}

interface Params {
    skipConfig?: Boolean
}

export function createPerpdexMarketFixture(params: Params = {}): (wallets, provider) => Promise<PerpdexMarketFixture> {
    params = { skipConfig: false, ...params }
    return async ([owner, alice, bob, exchange], provider): Promise<PerpdexMarketFixture> => {
        const priceFeed = await waffle.deployMockContract(owner, IPerpdexPriceFeedJson.abi)
        await priceFeed.mock.getPrice.returns(BigNumber.from(10).pow(18))
        await priceFeed.mock.decimals.returns(18)

        const orderBookLibraryFactory = await ethers.getContractFactory("OrderBookLibrary")
        const orderBookLibrary = await orderBookLibraryFactory.deploy()

        const candleLibraryFactory = await ethers.getContractFactory("CandleLibrary")
        const candleLibrary = await candleLibraryFactory.deploy()

        const perpdexMarketFactory = await ethers.getContractFactory("TestPerpdexMarket", {
            libraries: {
                CandleLibrary: candleLibrary.address,
                OrderBookLibrary: orderBookLibrary.address,
            },
        })
        const perpdexMarket = (await perpdexMarketFactory.deploy(
            "USD",
            exchange.address,
            priceFeed.address,
            ethers.constants.AddressZero,
        )) as TestPerpdexMarket

        if (!params.skipConfig) {
            await perpdexMarket.connect(owner).setPoolFeeConfig({
                fixedFeeRatio: 0,
                atrFeeRatio: 0,
                atrEmaBlocks: 1,
            })
            await perpdexMarket.connect(owner).setFundingMaxPremiumRatio(0)
        }

        return {
            perpdexMarket,
            priceFeed,
            owner,
            alice,
            bob,
            exchange,
            orderBookLibrary,
            candleLibrary,
        }
    }
}
