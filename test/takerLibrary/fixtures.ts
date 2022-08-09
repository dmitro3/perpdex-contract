import { ethers, waffle } from "hardhat"
import { TestTakerLibrary } from "../../typechain"
import { MockContract } from "ethereum-waffle"
import IPerpdexMarketJson from "../../artifacts/contracts/interfaces/IPerpdexMarket.sol/IPerpdexMarket.json"

interface TakerLibraryFixture {
    takerLibrary: TestTakerLibrary
    market: MockContract
}

export function createTakerLibraryFixture(): (wallets, provider) => Promise<TakerLibraryFixture> {
    return async ([owner], provider): Promise<TakerLibraryFixture> => {
        const accountLibraryFactory = await ethers.getContractFactory("AccountLibrary")
        const accountLibrary = await accountLibraryFactory.deploy()

        const factory = await ethers.getContractFactory("TestTakerLibrary", {
            libraries: {
                AccountLibrary: accountLibrary.address,
            },
        })
        const takerLibrary = (await factory.deploy()) as TestTakerLibrary

        const market = await waffle.deployMockContract(owner, IPerpdexMarketJson.abi)

        return {
            takerLibrary,
            market,
        }
    }
}
