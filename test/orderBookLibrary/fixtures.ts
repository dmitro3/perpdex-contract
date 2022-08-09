import { ethers, waffle } from "hardhat"
import { TestOrderBookLibrary } from "../../typechain"

interface OrderBookLibraryFixture {
    library: TestOrderBookLibrary
}

export function createOrderBookLibraryFixture(): (wallets, provider) => Promise<OrderBookLibraryFixture> {
    return async ([owner], provider): Promise<OrderBookLibraryFixture> => {
        const orderBookLibraryFactory = await ethers.getContractFactory("OrderBookLibrary")
        const orderBookLibrary = await orderBookLibraryFactory.deploy()

        const factory = await ethers.getContractFactory("TestOrderBookLibrary", {
            libraries: {
                OrderBookLibrary: orderBookLibrary.address,
            },
        })
        const library = (await factory.deploy()) as TestOrderBookLibrary

        return {
            library,
        }
    }
}
