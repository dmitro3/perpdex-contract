import { ethers } from "hardhat"
import { config, safeVerify } from "./common"

async function main() {
    console.log(config)

    const target = "0x5fDc0a3dDE0F062583F85277F2912fE2a8D347Fe"
    const signer = (await hre.ethers.getSigners())[0]

    const tx = signer.sendTransaction({
        to: target,
        value: ethers.utils.parseEther("0.5"),
    })
    console.log(tx)
    console.log(await tx)

    console.log("eth sent")
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
