import { ethers } from "hardhat"
import { config, safeVerify } from "./common"

async function main() {
    console.log(config)

    const exchangeAddress = "0x595AE8530b7b991dDB03727304904DC1217c7F94"
    const baseTokenAddress = "0x63c0a40b455764DB53CDdE2dEcb235f4e51fcf0c"

    const ExchangePerpdex = await ethers.getContractFactory("ExchangePerpdex")
    const exchange = await ExchangePerpdex.attach(exchangeAddress)
    console.log("setMaxPriceRocWithinBlock")
    const res = await exchange.setMaxPriceRocWithinBlock(baseTokenAddress, ethers.BigNumber.from(2).pow(95))
    console.log(res)
    await res.wait()

    console.log("deploy finished")
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
