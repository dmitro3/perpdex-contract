import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"
import { parseEther } from "ethers/lib/utils"
import { ethers } from "hardhat"
import { getPerpdexOracleContractDeployment as getOracleDeploy } from "../scripts/deployHelper"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts, getChainId } = hre
    const { deploy, execute } = deployments
    const { deployer } = await getNamedAccounts()

    const priceFeedQuoteAddress = {
        rinkeby: "ChainlinkPriceFeedETHUSD",
        mumbai: "ChainlinkPriceFeedMATICUSD",
        shibuya: "DiaPriceFeedASTRUSD",
        zksync2_testnet: "DebugPriceFeedETHUSD",
        arbitrum_rinkeby: "ChainlinkPriceFeedETHUSD",
        optimism_kovan: "ChainlinkPriceFeedETHUSD",
        hardhat: hre.ethers.constants.AddressZero,
    }[hre.network.name]

    const markets = {
        rinkeby: [
            {
                symbol: "USD",
                priceFeedBase: hre.ethers.constants.AddressZero,
            },
            {
                symbol: "BTC",
                priceFeedBase: "ChainlinkPriceFeedBTCUSD",
            },
            {
                symbol: "LINK",
                priceFeedBase: "ChainlinkPriceFeedLINKUSD",
            },
            {
                symbol: "MATIC",
                priceFeedBase: "ChainlinkPriceFeedMATICUSD",
            },
        ],
        mumbai: [
            {
                symbol: "USD",
                priceFeedBase: hre.ethers.constants.AddressZero,
            },
        ],
        shibuya: [
            {
                symbol: "USD",
                priceFeedBase: hre.ethers.constants.AddressZero,
            },
            {
                symbol: "BTC",
                priceFeedBase: "DiaPriceFeedBTCUSD",
            },
            {
                symbol: "ETH",
                priceFeedBase: "DiaPriceFeedETHUSD",
            },
            {
                symbol: "SDN",
                priceFeedBase: "DiaPriceFeedSDNUSD",
            },
            {
                symbol: "KSM",
                priceFeedBase: "DiaPriceFeedKSMUSD",
            },
        ],
        zksync2_testnet: [
            {
                symbol: "USD",
                priceFeedBase: hre.ethers.constants.AddressZero,
            },
        ],
        optimism_kovan: [
            {
                symbol: "USD",
                priceFeedBase: hre.ethers.constants.AddressZero,
            },
        ],
        arbitrum_rinkeby: [
            {
                symbol: "USD",
                priceFeedBase: hre.ethers.constants.AddressZero,
            },
        ],
        hardhat: [
            {
                symbol: "USD",
                priceFeedBase: hre.ethers.constants.AddressZero,
            },
        ],
    }[hre.network.name]

    await deploy("OrderBookLibrary", {
        from: deployer,
        log: true,
        autoMine: true,
    })
    const orderBookLibrary = await deployments.get("OrderBookLibrary")

    const perpdexExchange = await deployments.get("PerpdexExchange")

    for (let i = 0; i < markets.length; i++) {
        const market = await deploy("PerpdexMarket" + markets[i].symbol, {
            from: deployer,
            contract: "PerpdexMarket",
            args: [
                markets[i].symbol,
                perpdexExchange.address,
                markets[i].priceFeedBase === hre.ethers.constants.AddressZero
                    ? hre.ethers.constants.AddressZero
                    : getOracleDeploy(markets[i].priceFeedBase).address,
                priceFeedQuoteAddress === hre.ethers.constants.AddressZero
                    ? hre.ethers.constants.AddressZero
                    : getOracleDeploy(priceFeedQuoteAddress).address,
            ],
            log: true,
            autoMine: true,
            libraries: {
                OrderBookLibrary: orderBookLibrary.address,
            },
        })

        await execute(
            "PerpdexExchange",
            {
                from: deployer,
                log: true,
                autoMine: true,
            },
            "setMarketStatus",
            market.address,
            1,
        )
    }
}

export default func
func.tags = ["Markets"]
