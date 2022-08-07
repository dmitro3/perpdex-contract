import { ethers, waffle } from "hardhat"
import { TestOrderBookLibrary } from "../../typechain"

interface OrderBookLibraryFixture {
    library: TestOrderBookLibrary
}

export function createOrderBookLibraryFixture(): (wallets, provider) => Promise<OrderBookLibraryFixture> {
    return async ([owner], provider): Promise<OrderBookLibraryFixture> => {
        const factory = await ethers.getContractFactory("TestOrderBookLibrary")
        const library = (await factory.deploy()) as TestOrderBookLibrary

        return {
            library,
        }
    }
}
