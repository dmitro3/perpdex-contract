import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { parseEther } from "ethers/lib/utils"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts, getChainId } = hre
    const { deploy, execute } = deployments
    const { deployer } = await getNamedAccounts()

    // const settlementTokenAddress = {
    //     "31337": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH(mainnet) hardhat
    //     "4": "0xc778417E063141139Fce010982780140Aa0cD5Ab", // WETH rinkeby
    //     "80001": "0xA6FA4fB5f76172d178d61B04b0ecd319C5d1C0aa", // WETH mumbai
    //     "43113": "0xd00ae08403B9bbb9124bB305C09058E32C39A48c", // WAVAX fuji
    //     "81": "0x321F318e7C276c93Cf3094fd3a9d7c4362fd19FB", // WSBY shibuya
    // }[await getChainId()]

    const settlementTokenAddress = hre.ethers.constants.AddressZero // native token

    await deploy("AccountLibrary", {
        from: deployer,
        log: true,
        autoMine: true,
    })
    const accountLibrary = await deployments.get("AccountLibrary")

    await deploy("MakerLibrary", {
        from: deployer,
        log: true,
        autoMine: true,
        libraries: {
            AccountLibrary: accountLibrary.address,
        },
    })
    const makerLibrary = await deployments.get("MakerLibrary")

    await deploy("MakerOrderBookLibrary", {
        from: deployer,
        log: true,
        autoMine: true,
        libraries: {
            AccountLibrary: accountLibrary.address,
        },
    })
    const makerOrderBookLibrary = await deployments.get("MakerOrderBookLibrary")

    await deploy("VaultLibrary", {
        from: deployer,
        log: true,
        autoMine: true,
        libraries: {
            AccountLibrary: accountLibrary.address,
        },
    })
    const vaultLibrary = await deployments.get("VaultLibrary")

    try {
        await deploy("PerpdexExchange", {
            contract: "DebugPerpdexExchange",
            from: deployer,
            args: [settlementTokenAddress],
            log: true,
            autoMine: true,
            libraries: {
                AccountLibrary: accountLibrary.address,
                MakerLibrary: makerLibrary.address,
                MakerOrderBookLibrary: makerOrderBookLibrary.address,
                VaultLibrary: vaultLibrary.address,
            },
        })
    } catch (err) {
        console.log(err.message)
        console.log(err.code)
        console.log(err.data)
        throw err
    }
}

export default func
func.tags = ["PerpdexExchange"]
