import { safeVerify } from "./common"
import glob from "glob"
import fs from "fs"
import path from "path"
import _ from "lodash"
import hre from "hardhat"

async function main() {
    console.log("verify")

    const files = glob.sync(`deployments/${hre.network.name}/*.json`)
    const contracts = {}

    const verifyContract = async (filename: string) => {
        const dep = contracts[filename]
        if (!dep) return
        delete contracts[filename]

        const libraries = _.keys(dep.libraries || {})

        for (let i = 0; i < libraries.length; i++) {
            await verifyContract(libraries[i])
        }

        // console.log(filename)
        // const a = await hre.run("verify:get-libraries", {
        //     librariesModule: dep.path,
        // })
        // console.log(a)

        await safeVerify(dep.address, dep.args)
    }

    for (let i = 0; i < files.length; i++) {
        const dep = JSON.parse(fs.readFileSync(files[i], "utf8"))
        dep.path = files[i]
        const filename = path.basename(files[i]).replace(".json", "")
        contracts[filename] = dep
    }

    while (!_.isEmpty(contracts)) {
        await verifyContract(_.first(_.keys(contracts)))
    }

    console.log("verify finished")
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
