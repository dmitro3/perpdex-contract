import { safeVerify } from "./common"
import glob from "glob"
import fs from "fs"

async function main() {
    console.log("verify")

    const files = glob.sync(`deployments/${hre.network.name}/*.json`)

    for (let i = 0; i < files.length; i++) {
        const dep = JSON.parse(fs.readFileSync(files[i], "utf8"))
        await safeVerify(dep.address, dep.args)
    }

    console.log("verify finished")
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
