import { ethers, waffle } from "hardhat"
import { TestPoolFeeLibrary } from "../../typechain"

interface PoolFeeLibraryFixture {
    poolFeeLibrary: TestPoolFeeLibrary
}

export function createPoolFeeLibraryFixture(): (wallets, provider) => Promise<PoolFeeLibraryFixture> {
    return async ([owner], provider): Promise<PoolFeeLibraryFixture> => {
        const factory = await ethers.getContractFactory("TestPoolFeeLibrary")
        const poolFeeLibrary = (await factory.deploy()) as TestPoolFeeLibrary

        return {
            poolFeeLibrary,
        }
    }
}
